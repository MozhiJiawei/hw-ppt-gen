$ErrorActionPreference = 'Stop'

$IdleTimeoutMs = if ($env:HW_POWERPOINT_COM_BROKER_IDLE_MS) { [int]$env:HW_POWERPOINT_COM_BROKER_IDLE_MS } else { 300000 }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Resolve-Path (Join-Path $ScriptDir '..\..')
$LogPath = if ($env:HW_POWERPOINT_COM_BROKER_TRACE) { $env:HW_POWERPOINT_COM_BROKER_TRACE } else { Join-Path $RootDir '.tmp\powerpoint_com_broker.trace.log' }
$QueueDir = if ($env:HW_POWERPOINT_COM_BROKER_QUEUE) { $env:HW_POWERPOINT_COM_BROKER_QUEUE } else { Join-Path $RootDir '.tmp\powerpoint_com_broker_queue' }
$RequestDir = Join-Path $QueueDir 'requests'
$ResponseDir = Join-Path $QueueDir 'responses'
$HeartbeatPath = Join-Path $QueueDir 'broker.heartbeat'

$app = $null
$lastRequestAt = Get-Date

function Log($message) {
  try {
    $stamp = (Get-Date).ToUniversalTime().ToString('o')
    Add-Content -Path $LogPath -Value "$stamp $message" -Encoding UTF8
  } catch {}
}

function Ensure-App {
  if ($script:app -ne $null) {
    try {
      $null = $script:app.Version
      return $script:app
    } catch {
      Log "ensure_app:stale $($_.Exception.Message)"
      try { $script:app.Quit() } catch {}
      $script:app = $null
    }
  }
  Log 'ensure_app:start'
  $script:app = New-Object -ComObject PowerPoint.Application
  if ($script:app -eq $null) { throw 'PowerPoint COM application could not be created.' }
  Log 'ensure_app:ready'
  return $script:app
}

function RoundPt($value) {
  return [Math]::Round([double]$value, 3)
}

function ShapeText($shape) {
  try {
    if ($shape.HasTextFrame -and $shape.TextFrame2.HasText) {
      return [string]$shape.TextFrame2.TextRange.Text
    }
  } catch {}
  return ''
}

function Measure-Presentation($inputPath, $profileEnabled) {
  $startedAt = Get-Date
  $timings = New-Object System.Collections.Generic.List[object]
  function Mark($label) {
    if (-not $profileEnabled) { return }
    $elapsed = [int]((Get-Date) - $startedAt).TotalMilliseconds
    $timings.Add([pscustomobject]@{ label = $label; ms = $elapsed }) | Out-Null
  }

  $presentation = $null
  try {
    $app = Ensure-App
    Mark 'ensure_app'
    $presentation = $app.Presentations.Open($inputPath, $true, $false, $false)
    Mark 'open_presentation'
    $slides = @()
    for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
      $slide = $presentation.Slides.Item($i)
      $shapes = @()
      $measurementId = $null
      $measurementKind = $null
      $firstShapeIndex = 1
      if ($slide.Shapes.Count -ge 1) {
        $markerShape = $slide.Shapes.Item(1)
        $markerText = ShapeText $markerShape
        if ($markerText -match 'MEASURE_ID:([^\r\n]+)') {
          $measurementId = $Matches[1].Trim()
          $firstShapeIndex = 2
        }
        if ($markerText -match 'MEASURE_KIND:([^\r\n]+)') {
          $measurementKind = $Matches[1].Trim()
        }
      }
      for ($j = $firstShapeIndex; $j -le $slide.Shapes.Count; $j++) {
        $shape = $slide.Shapes.Item($j)
        $hasText = $false
        $text = ''
        $boundLeft = $null
        $boundTop = $null
        $boundWidth = $null
        $boundHeight = $null
        try {
          $hasText = [bool]($shape.HasTextFrame -and $shape.TextFrame2.HasText)
          if ($hasText) {
            $text = [string]$shape.TextFrame2.TextRange.Text
            $boundLeft = RoundPt $shape.TextFrame2.TextRange.BoundLeft
            $boundTop = RoundPt $shape.TextFrame2.TextRange.BoundTop
            $boundWidth = RoundPt $shape.TextFrame2.TextRange.BoundWidth
            $boundHeight = RoundPt $shape.TextFrame2.TextRange.BoundHeight
          }
        } catch {}
        $fillVisible = $false
        $lineVisible = $false
        try { $fillVisible = [bool]$shape.Fill.Visible } catch {}
        try { $lineVisible = [bool]$shape.Line.Visible } catch {}
        $shapes += [pscustomobject]@{
          index = $j
          name = [string]$shape.Name
          type = [int]$shape.Type
          left = RoundPt $shape.Left
          top = RoundPt $shape.Top
          width = RoundPt $shape.Width
          height = RoundPt $shape.Height
          has_text = $hasText
          text = $text
          bound_left = $boundLeft
          bound_top = $boundTop
          bound_width = $boundWidth
          bound_height = $boundHeight
          fill_visible = $fillVisible
          line_visible = $lineVisible
        }
      }
      $slides += [pscustomobject]@{
        slide = $i
        measurement_id = $measurementId
        measurement_kind = $measurementKind
        shape_count = $slide.Shapes.Count
        shapes = $shapes
      }
    }
    Mark 'read_shapes'
    return [pscustomobject]@{
      input = $inputPath
      generated_at = (Get-Date).ToUniversalTime().ToString('o')
      renderer = 'powerpoint_com_measurement_broker'
      unit = 'pt'
      slides = $slides
      profile = if ($profileEnabled) { [pscustomobject]@{ total_ms = [int]((Get-Date) - $startedAt).TotalMilliseconds; timings = $timings } } else { $null }
    }
  } finally {
    if ($presentation -ne $null) {
      try { $presentation.Close() } catch {}
    }
  }
}

function Export-Presentation($inputPath, $outDir, $width, $height) {
  Log "export:start input=$inputPath out=$outDir"
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $presentation = $null
  try {
    $app = Ensure-App
    Log 'export:open:start'
    $presentation = $app.Presentations.Open($inputPath, $true, $false, $false)
    Log 'export:open:done'
    $count = $presentation.Slides.Count
    for ($i = 1; $i -le $count; $i++) {
      $name = 'slide_{0:D2}.png' -f $i
      $file = Join-Path $outDir $name
      Log "export:slide:${i}:start"
      $presentation.Slides.Item($i).Export($file, 'PNG', $width, $height) | Out-Null
      Log "export:slide:${i}:done"
    }
    Log "export:done count=$count"
    return [pscustomobject]@{ slide_count = $count }
  } finally {
    if ($presentation -ne $null) {
      try { $presentation.Close(); Log 'export:close:done' } catch { Log "export:close:error $($_.Exception.Message)" }
    }
  }
}

function Handle-Request($request) {
  $script:lastRequestAt = Get-Date
  Log "request:start command=$($request.command)"
  if ($request.command -eq 'ping') {
    $version = $null
    try { $version = (Ensure-App).Version } catch {}
    return [pscustomobject]@{ ok = $true; renderer = 'powerpoint_com_broker'; version = $version }
  }
  if ($request.command -eq 'measure') {
    return [pscustomobject]@{ ok = $true; result = (Measure-Presentation $request.inputPath ([bool]$request.profile)) }
  }
  if ($request.command -eq 'export') {
    $width = if ($request.width) { [int]$request.width } else { 2400 }
    $height = if ($request.height) { [int]$request.height } else { 1350 }
    return [pscustomobject]@{ ok = $true; result = (Export-Presentation $request.inputPath $request.outDir $width $height) }
  }
  if ($request.command -eq 'shutdown') {
    return [pscustomobject]@{ ok = $true; shutdown = $true }
  }
  throw "Unknown broker command: $($request.command)"
}

try {
  New-Item -ItemType Directory -Force -Path $RequestDir | Out-Null
  New-Item -ItemType Directory -Force -Path $ResponseDir | Out-Null
  Log "broker:start queue=$QueueDir"
  while ($true) {
    Set-Content -Path $HeartbeatPath -Value (Get-Date).ToUniversalTime().ToString('o') -Encoding UTF8
    $requestFile = Get-ChildItem -Path $RequestDir -Filter '*.json' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc, Name |
      Select-Object -First 1
    if ($requestFile -eq $null) {
      if (((Get-Date) - $lastRequestAt).TotalMilliseconds -gt $IdleTimeoutMs) {
        return
      }
      Start-Sleep -Milliseconds 100
      continue
    }
    $request = $null
    try {
      $request = Get-Content -Raw $requestFile.FullName | ConvertFrom-Json
      $response = Handle-Request $request
      $responsePath = Join-Path $ResponseDir ($request.id + '.json')
      $response | ConvertTo-Json -Depth 12 | Set-Content -Path $responsePath -Encoding UTF8
      Log "request:response id=$($request.id) command=$($request.command)"
      Remove-Item -LiteralPath $requestFile.FullName -Force -ErrorAction SilentlyContinue
      if ($response.shutdown) { return }
    } catch {
      $id = if ($request -and $request.id) { $request.id } else { [IO.Path]::GetFileNameWithoutExtension($requestFile.Name) }
      $responsePath = Join-Path $ResponseDir ($id + '.json')
      Log "request:error id=$id $($_.Exception.Message)"
      [pscustomobject]@{ ok = $false; error = [string]($_.Exception.Message) } |
        ConvertTo-Json -Depth 8 |
        Set-Content -Path $responsePath -Encoding UTF8
      Remove-Item -LiteralPath $requestFile.FullName -Force -ErrorAction SilentlyContinue
      }
  }
} finally {
  Log 'broker:stop'
  if ($app -ne $null) {
    try { $app.Quit(); Log 'app:quit:done' } catch { Log "app:quit:error $($_.Exception.Message)" }
  }
}
