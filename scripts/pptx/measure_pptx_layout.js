const fs = require("fs");
const path = require("path");
const { repairPptxForPowerPointCom } = require("./hw_pptx_helpers");
const { requestPowerPointBroker } = require("./powerpoint_com_broker");

function usage() {
  console.error("Usage: node scripts/pptx/measure_pptx_layout.js .tmp/<deck>.pptx --out .tmp/<measurement>.json");
}

function parseArgs(argv) {
  const args = { input: argv[2], out: null };
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      args.out = argv[i + 1];
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

async function measureWithPowerPoint(inputPath) {
  const response = await requestPowerPointBroker("measure", {
    inputPath: path.resolve(inputPath),
    profile: process.env.HW_MEASUREMENT_PROFILE === "1",
  }, { timeoutMs: 180000 });
  return response.result;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input || !args.out) {
    usage();
    process.exit(2);
  }
  ensureTmp(args.input, "Input PPTX");
  ensureTmp(args.out, "Output JSON");
  const inputPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);
  if (!fs.existsSync(inputPath)) throw new Error(`Input PPTX not found: ${inputPath}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await repairPptxForPowerPointCom(inputPath);
  const manifest = await measureWithPowerPoint(inputPath);
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify({ output: outPath, slide_count: manifest.slides.length }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  measureWithPowerPoint,
};
