"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { createHuaweiDeck } = require("../../pptx/hw_pptx_helpers");
const { addVisualAnchorContentSlide } = require("../../pptx/hw_visual_anchor_slide");
const { parseSlideBodyDsl } = require("../../pptx/dsl/jsx_dsl");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "content_slide_runtime_qa_gate");
const SOURCE_DIR = path.join(OUT_DIR, "sources");

fs.mkdirSync(SOURCE_DIR, { recursive: true });

const source = {
  path: writeSvg("very_wide.svg", "wide evidence", 1000, 180),
  caption: "wide evidence",
};

const bodyDsl = parseSlideBodyDsl(`<Slide>
  <ThreeColumn>
    <Module title="A">
      <EvidenceChart id="wide_a" title="wide A" claim="wide evidence leaves empty vertical slot." source={source} fit="contain" />
      <InsightText body={["结论：证据过宽时不能靠空白过关。"]} />
    </Module>
    <Module title="B">
      <EvidenceChart id="wide_b" title="wide B" claim="wide evidence leaves empty vertical slot." source={source} fit="contain" />
      <InsightText body={["结论：运行态 QA 应该阻断。"]} />
    </Module>
    <Module title="C">
      <EvidenceChart id="wide_c" title="wide C" claim="wide evidence leaves empty vertical slot." source={source} fit="contain" />
      <InsightText body={["结论：需要加内容或改布局。"]} />
    </Module>
  </ThreeColumn>
</Slide>`, { source }).bodyDsl;

const pptx = createHuaweiDeck({ title: "Runtime QA gate smoke" });
assert.throws(
  () => addVisualAnchorContentSlide(pptx, {
    page: "01",
    title: "Runtime QA Gate",
    sections: ["QA"],
    currentSection: "QA",
    summary: { body: [{ label: "检查", text: "layout QA error must block rendering." }] },
    bodyDsl,
  }),
  (error) => {
    const issues = error.feedbackIssues || [];
    return issues.some((issue) => issue.code === "layout_block_gap_excessive")
      && issues.every((issue) => issue.phase === "layout")
      && String(error.message).includes("Runtime QA failed for page 1")
      && String(error.message).includes("layout:layout_block_gap_excessive")
      && String(error.message).includes("Selector: Slide > ThreeColumn:nth-child(1)")
      && String(error.message).includes("Code: <InsightText");
  },
  "content slide generation should fail when default layout QA finds error-level issues"
);

const cli = spawnSync(process.execPath, ["-e", `
const { createHuaweiDeck } = require("./scripts/pptx/hw_pptx_helpers");
const { addVisualAnchorContentSlide } = require("./scripts/pptx/hw_visual_anchor_slide");
const { parseSlideBodyDsl } = require("./scripts/pptx/dsl/jsx_dsl");
const source = { path: ${JSON.stringify(source.path)}, caption: "wide evidence" };
const bodyDsl = parseSlideBodyDsl(${JSON.stringify(`
<Slide>
  <ThreeColumn>
    <Module title="A">
      <EvidenceChart id="wide_a" title="wide A" claim="wide evidence leaves empty vertical slot." source={source} fit="contain" />
      <InsightText body={["结论：证据过宽时不能靠空白过关。"]} />
    </Module>
    <Module title="B">
      <EvidenceChart id="wide_b" title="wide B" claim="wide evidence leaves empty vertical slot." source={source} fit="contain" />
      <InsightText body={["结论：运行态 QA 应该阻断。"]} />
    </Module>
    <Module title="C">
      <EvidenceChart id="wide_c" title="wide C" claim="wide evidence leaves empty vertical slot." source={source} fit="contain" />
      <InsightText body={["结论：需要加内容或改布局。"]} />
    </Module>
  </ThreeColumn>
</Slide>` )}, { source }).bodyDsl;
const pptx = createHuaweiDeck({ title: "Runtime QA gate smoke" });
try {
  addVisualAnchorContentSlide(pptx, {
    page: "01",
    title: "Runtime QA Gate",
    sections: ["QA"],
    currentSection: "QA",
    summary: { body: [{ label: "检查", text: "layout QA error must block rendering." }] },
    bodyDsl,
  });
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const output = `${cli.stdout || ""}${cli.stderr || ""}`;
assert.notEqual(cli.status, 0, "real content slide CLI path should fail on layout QA errors");
assert(output.includes("Runtime QA failed for page 1"), output);
assert(output.includes("layout:layout_block_gap_excessive"), output);
assert(output.includes("Selector: Slide > ThreeColumn:nth-child(1)"), output);
assert(output.includes("Source: line"), output);
assert(output.includes("Code: <"), output);
assert(!/^\s+at\s+\S+/m.test(output), output);

console.log("Content slide runtime QA gate smoke passed.");

function writeSvg(fileName, label, width, height) {
  const filePath = path.join(SOURCE_DIR, fileName);
  fs.writeFileSync(filePath, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="#f7f7f7" stroke="#c00000" stroke-width="6"/>
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="42" font-family="Arial">${label}</text>
</svg>`, "utf8");
  return filePath;
}
