const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function usage() {
  console.error("Usage: node scripts/pptx/prepare_reference_review.js --out .tmp/<deck>_reference_review.json");
}

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function ensureTmpOutput(fileName) {
  const normalized = String(fileName || "").replace(/\\/g, "/");
  if (!normalized.includes("/.tmp/") && !normalized.startsWith(".tmp/")) {
    throw new Error(`Reference review must be saved under .tmp: ${fileName}`);
  }
}

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("Not a PNG file.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.out) {
    usage();
    process.exit(2);
  }
  ensureTmpOutput(args.out);
  const refDir = path.resolve("assets", "slides_ref");
  if (!fs.existsSync(refDir)) throw new Error(`Reference directory not found: ${refDir}`);
  const files = fs.readdirSync(refDir).filter((name) => name.toLowerCase().endsWith(".png")).sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
  if (files.length < 5) throw new Error(`Expected 5-10+ reference images, found ${files.length}.`);

  const references = files.map((name) => {
    const file = path.join(refDir, name);
    const buffer = fs.readFileSync(file);
    const size = pngSize(buffer);
    return {
      file: path.relative(process.cwd(), file),
      width: size.width,
      height: size.height,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      loaded: true,
      observations: [],
      applied_to_slides: [],
    };
  });

  const review = {
    generated_at: new Date().toISOString(),
    instruction: "Fill observations and applied_to_slides before writing deck-generation code. For content-page references, explicitly note the top 分析总结 band: red label, gray conclusion body, and how detailed content begins below it. Do not leave entries empty.",
    status: "needs_human_visual_observations",
    references,
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(review, null, 2), "utf8");
  console.log(JSON.stringify(review, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
