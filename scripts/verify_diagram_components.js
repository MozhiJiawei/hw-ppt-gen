const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createHandDrawnDiagramImage, validateHandDrawnDiagramSpec } = require("./hw_diagram_helpers");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SPEC = path.join(ROOT, "references", "visual_diagram_test_cases.json");
const DEFAULT_OUT = path.join(ROOT, ".tmp", "diagram_component_smoke");

function parseArgs(argv) {
  const args = { spec: DEFAULT_SPEC, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--spec") args.spec = path.resolve(argv[++i]);
    else if (arg === "--out") args.out = path.resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/verify_diagram_components.js [--spec path/to/visual_specs.json] [--out .tmp/diagram_component_smoke]

Creates SVG and PNG image anchors for the reusable hand-drawn diagram helper.
The diagram module exports images only; deck-specific generators are responsible for placing the image inside a standard PPT page.`);
}

function safePathPart(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "unknown";
}

function cleanDefaultOutputDir(outDir) {
  const relative = path.relative(ROOT, outDir);
  const isTmpChild = relative && !relative.startsWith("..") && !path.isAbsolute(relative) && relative.split(path.sep)[0] === ".tmp";
  if (isTmpChild && fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

async function writeDiagramAssets(spec, outRoot) {
  const intentDir = safePathPart(spec.intent);
  const templateDir = safePathPart(spec.template);
  const caseDir = path.join(outRoot, intentDir, templateDir);
  fs.mkdirSync(caseDir, { recursive: true });

  const image = createHandDrawnDiagramImage(spec, { aspectRatio: "16:9" });
  const baseName = safePathPart(spec.id || spec.template);
  const svgPath = path.join(caseDir, `${baseName}.svg`);
  const pngPath = path.join(caseDir, `${baseName}.png`);
  fs.writeFileSync(svgPath, image.svg, "utf8");
  await sharp(Buffer.from(image.svg)).png().toFile(pngPath);

  return {
    id: spec.id,
    intent: spec.intent,
    template: spec.template,
    svg: path.relative(ROOT, svgPath).replace(/\\/g, "/"),
    png: path.relative(ROOT, pngPath).replace(/\\/g, "/"),
    width: image.width,
    height: image.height,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!fs.existsSync(args.spec)) throw new Error(`Spec file not found: ${args.spec}`);
  cleanDefaultOutputDir(args.out);

  const data = JSON.parse(fs.readFileSync(args.spec, "utf8"));
  const cases = data.cases || [];
  if (!cases.length) throw new Error(`No cases found in spec: ${args.spec}`);

  const assets = [];
  for (const spec of cases) {
    validateHandDrawnDiagramSpec(spec);
    assets.push(await writeDiagramAssets(spec, args.out));
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    spec: path.relative(ROOT, args.spec).replace(/\\/g, "/"),
    helper: "scripts/hw_diagram_helpers.js",
    output_contract: ["image/svg+xml", "image/png"],
    assets,
  };
  fs.writeFileSync(path.join(args.out, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Generated ${assets.length} SVG+PNG pairs under ${args.out}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
