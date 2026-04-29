const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function usage() {
  console.error("Usage: node scripts/export_pptx_images.js .tmp/<deck>.pptx --out .tmp/<deck>_slides [--dpi 180] [--renderer auto|powerpoint|libreoffice]");
}

function parseArgs(argv) {
  const args = { input: argv[2], out: null, dpi: 180, renderer: "auto" };
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      args.out = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--dpi") {
      args.dpi = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--renderer") {
      args.renderer = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function ensureTmp(value, label) {
  const normalized = String(value || "").replace(/\\/g, "/");
  if (!normalized.includes("/.tmp/") && !normalized.startsWith(".tmp/")) {
    throw new Error(`${label} must be under .tmp: ${value}`);
  }
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) {
    throw new Error(`Failed to run ${command}. Ensure LibreOffice and Poppler are on PATH. ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout;
}

function commandExists(command) {
  const probe = spawnSync(command, ["-v"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return !probe.error;
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function powerpointAvailable() {
  if (process.platform !== "win32") return false;
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$ErrorActionPreference='Stop'; $app = New-Object -ComObject PowerPoint.Application; $v = $app.Version; $app.Quit(); Write-Output $v",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return ps.status === 0 && /\d/.test(ps.stdout || "");
}

function refreshWindowsPathFromRegistry() {
  if (process.platform !== "win32") return;
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (ps.status === 0 && ps.stdout.trim()) {
    const existing = process.env.PATH || process.env.Path || "";
    process.env.PATH = `${existing};${ps.stdout.trim()}`;
    process.env.Path = process.env.PATH;
  }
}

function pad(num, width) {
  return String(num).padStart(width, "0");
}

function cleanPreviousSlides(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of fs.readdirSync(outDir)) {
    if (/^slide[_-]\d+\.png$/i.test(name) || name === "render_manifest.json") {
      fs.rmSync(path.join(outDir, name), { force: true });
    }
  }
}

function writeManifest(outDir, manifest) {
  const manifestPath = path.join(outDir, "render_manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify(manifest, null, 2));
}

function exportWithLibreOffice(inputPath, outDir, dpi) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "hw-ppt-render-"));
  try {
    refreshWindowsPathFromRegistry();
    for (const command of ["soffice", "pdfinfo", "pdftoppm"]) {
      if (!commandExists(command)) {
        throw new Error(`${command} is not on PATH. Run: powershell -ExecutionPolicy Bypass -File scripts/setup_render_tools_path.ps1`);
      }
    }

    run("soffice", ["--headless", "--convert-to", "pdf", "--outdir", workDir, inputPath]);
    const expectedPdf = path.join(workDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
    const pdfPath = fs.existsSync(expectedPdf)
      ? expectedPdf
      : fs.readdirSync(workDir).find((name) => name.toLowerCase().endsWith(".pdf"));
    const resolvedPdf = path.isAbsolute(pdfPath) ? pdfPath : path.join(workDir, pdfPath || "");
    if (!resolvedPdf || !fs.existsSync(resolvedPdf)) throw new Error("LibreOffice did not produce a PDF.");

    const info = run("pdfinfo", [resolvedPdf]);
    const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1] || 0);
    if (!pages) throw new Error(`Could not determine PDF page count.\n${info}`);

    const prefix = path.join(outDir, "slide");
    run("pdftoppm", ["-png", "-r", String(dpi), resolvedPdf, prefix]);

    const rendered = fs.readdirSync(outDir)
      .filter((name) => /^slide-\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    rendered.forEach((name, idx) => {
      const next = `slide_${pad(idx + 1, 2)}.png`;
      const from = path.join(outDir, name);
      const to = path.join(outDir, next);
      if (fs.existsSync(to)) fs.unlinkSync(to);
      fs.renameSync(from, to);
    });

    const finalFiles = fs.readdirSync(outDir)
      .filter((name) => /^slide_\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (finalFiles.length !== pages) {
      throw new Error(`Rendered ${finalFiles.length} PNGs, expected ${pages}.`);
    }

    return {
      input: inputPath,
      output_dir: outDir,
      generated_at: new Date().toISOString(),
      renderer: "libreoffice",
      toolchain: {
        pptx_to_pdf: "soffice",
        pdf_info: "pdfinfo",
        pdf_to_png: "pdftoppm",
        dpi,
      },
      slide_count: pages,
      slides: finalFiles.map((name) => path.join(outDir, name)),
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function exportWithPowerPoint(inputPath, outDir) {
  if (process.platform !== "win32") throw new Error("PowerPoint rendering is only available on Windows.");
  const scriptPath = path.join(os.tmpdir(), `hw-ppt-render-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);
  const inputPs = escapePowerShellSingleQuoted(inputPath);
  const outPs = escapePowerShellSingleQuoted(outDir);
  const psScript = `
$ErrorActionPreference = 'Stop'
$inputPath = '${inputPs}'
$outDir = '${outPs}'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$app = $null
$presentation = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $presentation = $app.Presentations.Open($inputPath, $true, $false, $false)
  $count = $presentation.Slides.Count
  for ($i = 1; $i -le $count; $i++) {
    $name = 'slide_{0:D2}.png' -f $i
    $file = Join-Path $outDir $name
    $presentation.Slides.Item($i).Export($file, 'PNG', 2400, 1350) | Out-Null
  }
  Write-Output $count
}
finally {
  if ($presentation -ne $null) {
    try { $presentation.Close() } catch { Write-Warning ("PowerPoint presentation cleanup failed: " + $_.Exception.Message) }
  }
  if ($app -ne $null) {
    try { $app.Quit() } catch { Write-Warning ("PowerPoint application cleanup failed: " + $_.Exception.Message) }
  }
}
`;
  fs.writeFileSync(scriptPath, psScript, "utf8");
  try {
    const stdout = run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { timeout: 120000 });
    const pages = Number((stdout.match(/(\d+)\s*$/) || [])[1] || 0);
    if (!pages) throw new Error(`PowerPoint export did not report a slide count.\n${stdout}`);
    const finalFiles = fs.readdirSync(outDir)
      .filter((name) => /^slide_\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (finalFiles.length !== pages) {
      throw new Error(`PowerPoint rendered ${finalFiles.length} PNGs, expected ${pages}.`);
    }
    return {
      input: inputPath,
      output_dir: outDir,
      generated_at: new Date().toISOString(),
      renderer: "powerpoint",
      toolchain: {
        pptx_to_png: "PowerPoint COM",
        width: 2400,
        height: 1350,
      },
      slide_count: pages,
      slides: finalFiles.map((name) => path.join(outDir, name)),
    };
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input || !args.out) {
    usage();
    process.exit(2);
  }
  ensureTmp(args.input, "Input PPTX");
  ensureTmp(args.out, "Output directory");
  if (!fs.existsSync(args.input)) throw new Error(`Input PPTX not found: ${args.input}`);
  if (!Number.isFinite(args.dpi) || args.dpi < 72 || args.dpi > 300) throw new Error(`Invalid DPI: ${args.dpi}`);
  if (!["auto", "powerpoint", "libreoffice"].includes(args.renderer)) throw new Error(`Invalid renderer: ${args.renderer}`);

  const inputPath = path.resolve(args.input);
  const outDir = path.resolve(args.out);
  cleanPreviousSlides(outDir);

  const renderer = args.renderer === "auto"
    ? (powerpointAvailable() ? "powerpoint" : "libreoffice")
    : args.renderer;
  const manifest = renderer === "powerpoint"
    ? exportWithPowerPoint(inputPath, outDir)
    : exportWithLibreOffice(inputPath, outDir, args.dpi);
  writeManifest(outDir, manifest);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
