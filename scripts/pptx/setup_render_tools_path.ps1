param(
  [switch]$Machine
)

$ErrorActionPreference = "Stop"

function Find-ExecutableDir {
  param(
    [string]$Executable,
    [string[]]$Roots
  )

  $existing = Get-Command $Executable -ErrorAction SilentlyContinue
  if ($existing) {
    return Split-Path -Parent $existing.Source
  }

  foreach ($root in $Roots) {
    if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
    $match = Get-ChildItem -LiteralPath $root -Recurse -Filter $Executable -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($match) { return $match.DirectoryName }
  }

  return $null
}

$roots = @(
  "$env:ProgramFiles",
  "${env:ProgramFiles(x86)}",
  "$env:LOCALAPPDATA\Microsoft\WinGet",
  "$env:LOCALAPPDATA\Programs",
  "$env:USERPROFILE\scoop",
  "$env:ChocolateyInstall",
  "$env:ProgramData\chocolatey"
) | Where-Object { $_ }

$libreOfficeDir = Find-ExecutableDir -Executable "soffice.exe" -Roots $roots
$popplerDir = Find-ExecutableDir -Executable "pdftoppm.exe" -Roots $roots

if (-not $libreOfficeDir) { throw "Could not find soffice.exe. Install LibreOffice or add it to PATH first." }
if (-not $popplerDir) { throw "Could not find pdftoppm.exe. Install Poppler for Windows or add it to PATH first." }

$target = if ($Machine) { "Machine" } else { "User" }
$current = [Environment]::GetEnvironmentVariable("Path", $target)
$parts = @($current -split ";" | Where-Object { $_ })
$additions = @($libreOfficeDir, $popplerDir)
$changed = $false

foreach ($dir in $additions) {
  if ($parts -notcontains $dir) {
    $parts += $dir
    $changed = $true
  }
}

if ($changed) {
  [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), $target)
}

$env:Path = (($additions + ($env:Path -split ";")) | Where-Object { $_ } | Select-Object -Unique) -join ";"

Write-Output "LibreOffice directory: $libreOfficeDir"
Write-Output "Poppler directory: $popplerDir"
Write-Output "Updated $target PATH: $changed"
Write-Output "Current session commands:"
Get-Command soffice, pdfinfo, pdftoppm -ErrorAction Stop | Select-Object Name, Source
