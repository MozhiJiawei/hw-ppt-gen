const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const { addHandDrawnDiagramSlide, validateHandDrawnDiagramSpec } = require("./hw_diagram_helpers");

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

Creates SVG files and a PPTX smoke deck for the reusable hand-drawn diagram helper.
Export the deck separately with:
  node scripts/export_pptx_images.js .tmp/diagram_component_smoke/diagram_component_smoke.pptx --out .tmp/diagram_component_smoke/exported_png --renderer auto`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!fs.existsSync(args.spec)) throw new Error(`Spec file not found: ${args.spec}`);
  fs.mkdirSync(args.out, { recursive: true });

  const data = JSON.parse(fs.readFileSync(args.spec, "utf8"));
  const cases = data.cases || [];
  if (!cases.length) throw new Error(`No cases found in spec: ${args.spec}`);

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Huawei PPTX Generator";
  pptx.company = "Huawei";
  pptx.subject = "Hand-drawn diagram component smoke test";
  pptx.title = "Hand-drawn diagram component smoke test";
  pptx.lang = "zh-CN";
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

  const svgFiles = [];
  for (const spec of cases) {
    validateHandDrawnDiagramSpec(spec);
    const { svgPath } = addHandDrawnDiagramSlide(pptx, spec, { outDir: args.out });
    svgFiles.push(svgPath);
  }

  const pptxPath = path.join(args.out, "diagram_component_smoke.pptx");
  await pptx.writeFile({ fileName: pptxPath });

  const manifest = {
    generated_at: new Date().toISOString(),
    spec: path.relative(ROOT, args.spec).replace(/\\/g, "/"),
    helper: "scripts/hw_diagram_helpers.js",
    svg_files: svgFiles.map((file) => path.relative(ROOT, file).replace(/\\/g, "/")),
    pptx: path.relative(ROOT, pptxPath).replace(/\\/g, "/"),
  };
  fs.writeFileSync(path.join(args.out, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Generated ${svgFiles.length} SVG files and ${pptxPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
