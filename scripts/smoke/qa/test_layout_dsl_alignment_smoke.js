"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  createHuaweiDeck,
  repairPptxForPowerPointCom,
} = require("../../pptx/hw_pptx_helpers");
const {
  addVisualAnchorContentSlide,
  collectBodyPipelinePages,
} = require("../../pptx/hw_visual_anchor_slide");
const { parseSlideBodyDsl } = require("../../pptx/dsl/jsx_dsl");
const { compileSlideDsl } = require("../../pptx/dsl/compile_slide_dsl");
const { runLayoutChecks } = require("../../pptx/qa/layout_checks");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "layout_dsl_alignment_smoke");
const SOURCE_DIR = path.join(OUT_DIR, "sources");
const PPTX_OUT = path.join(OUT_DIR, "layout_alignment_review.pptx");
const REPORT_PATH = path.join(OUT_DIR, "layout_alignment_report.md");

async function main() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  const wideSource = writeSvg("wide_evidence.svg", "Wide evidence", 900, 420);
  const biasedSource = writeSvg("biased_evidence.svg", "Biased evidence", 900, 525);
  const columnSource = writeSvg("column_evidence.svg", "Column evidence", 900, 600);
  const tallSource = writeSvg("tall_evidence.svg", "Tall evidence", 520, 700);
  const scope = {
    wideSource: { path: wideSource, caption: "wide evidence" },
    biasedSource: { path: biasedSource, caption: "biased evidence" },
    columnSource: { path: columnSource, caption: "column evidence" },
    tallSource: { path: tallSource, caption: "tall evidence" },
    bodyLines: [
      "判断：证据区域优先保持可读。",
      "边界：辅助文字不抢占主视觉。",
    ],
    supportLines: [
      "机制判断：右栏文字承接证据结论。",
      "业务边界：辅助栏不靠 KPI 或表格补空。",
      "排版要求：底部留白靠文本节奏与布局平衡。",
      "行动建议：信息不足时补充结论或拆页。",
    ],
    shortLines: ["结论：模块边界、留白和分布保持一致。"],
    sideLines: [
      "侧栏判断：文字模块用于承接主视觉。",
      "密度控制：每行只保留一个判断。",
      "对齐目标：上下边界跟主视觉形成稳定节奏。",
      "改进路径：优先补写结论，不伪造指标。",
    ],
    threeLines: [
      "判断：三分栏需要每栏都有足够信息密度。",
      "证据：图形比例应贴近列宽，避免左右空白。",
      "排版：每栏顶部、底部和内部节奏保持一致。",
      "行动：缺内容时应补充解释或拆页。",
    ],
  };

  const fixtures = buildFixtures();
  const pptx = createHuaweiDeck({ title: "布局排版 DSL 对齐 Smoke" });
  const compiled = fixtures.map((fixture, index) => {
    const parsed = parseSlideBodyDsl(fixture.markup, scope);
    const compile = compileSlideDsl(parsed.bodyDsl, { throwOnError: false, source: fixture.markup });
    assert.equal(compile.ok, true, `${fixture.id} DSL should compile: ${compile.feedbackIssues.map((issue) => issue.message).join("; ")}`);
    addVisualAnchorContentSlide(pptx, {
      page: String(index + 1).padStart(2, "0"),
      title: `布局排版：${fixture.title}`,
      sections: ["布局排版"],
      currentSection: "布局排版",
      summary: { body: [{ label: "检查", text: `${fixture.title} 真实 PPT 展示路径的对齐、留白、分布和 visual slot。` }] },
      bodyDsl: parsed.bodyDsl,
    });
    return { ...fixture, parsed, compile };
  });

  const renderedLayoutPages = collectBodyPipelinePages(pptx);
  await pptx.writeFile({ fileName: PPTX_OUT });
  await repairPptxForPowerPointCom(PPTX_OUT);

  const report = ["# Layout DSL Alignment Smoke", "", `PPTX: ${path.relative(ROOT, PPTX_OUT).replace(/\\/g, "/")}`, ""];
  for (const fixture of compiled) {
    const renderedPage = renderedLayoutPages.find((entry) => Number(entry.page) === fixture.page);
    assert(renderedPage, `${fixture.id} should render layout evidence`);
    const layoutInfo = renderedPage.layoutInfo;
    assert(layoutInfo, `${fixture.id} should render layout info through addVisualAnchorContentSlide`);
    assert.equal(renderedPage.compileIr?.irKind, "CompileIr", `${fixture.id} should expose CompileIR from the production body pipeline`);
    assert(renderedPage.compileIr.visiblePrimitives.length > 0, `${fixture.id} CompileIR should expose visible primitives`);
    assert(renderedPage.layoutIr, `${fixture.id} should expose LayoutIR produced before body rendering`);
    assert.equal(renderedPage.layoutIr.producedBeforeRender, true, `${fixture.id} LayoutIR should be a pre-render body pipeline artifact`);
    assertNoEmbeddedDiagnostics(layoutInfo, fixture.id);
    const layoutIr = renderedPage.layoutIr;
    const qa = runLayoutChecks(layoutIr);
    assert.equal(qa.issues.length, 0, `${fixture.id} should not produce layout QA issues: ${JSON.stringify(qa.issues)}`);
    assert(layoutIr.records.some((record) => record.readability?.role === "visual_anchor"), `${fixture.id} should include visual readability facts`);
    assert(layoutIr.constraints.some((constraint) => constraint.type === "spacing"), `${fixture.id} should include spacing constraints`);
    assert(layoutIr.constraints.some((constraint) => constraint.type === "distribution"), `${fixture.id} should include distribution constraints`);
    assert(layoutIr.alignmentGroups.some((group) => group.edge === "top"), `${fixture.id} should include top alignment group`);
    assert(layoutIr.alignmentGroups.some((group) => group.edge === "bottom"), `${fixture.id} should include bottom alignment group`);
    appendReport(report, fixture, layoutInfo, layoutIr, renderedPage.renderedVisuals || []);
  }

  fs.writeFileSync(REPORT_PATH, report.join("\n"), "utf8");
  console.log(`Runtime QA layout DSL alignment smoke passed: ${PPTX_OUT}`);
}

function buildFixtures() {
  return [
    {
      id: "two-column",
      page: 1,
      title: "二分栏",
      markup: `
<Slide>
  <TwoColumn>
    <Module title="主证据">
      <EvidenceFigure id="two_main_evidence_real" title="主证据图" claim="宽图证明二分栏主证据可读。" source={wideSource} fit="contain" priority="primary" />
      <InsightText body={bodyLines} maxLines={3} />
    </Module>
    <Module title="辅助判断">
      <EvidenceChart id="two_secondary_evidence_real" title="辅助证据图" claim="辅助证据图支撑右栏判断。" source={wideSource} fit="contain" priority="supporting" />
      <InsightText body={supportLines} maxLines={4} />
    </Module>
  </TwoColumn>
</Slide>`,
    },
    {
      id: "biased-column",
      page: 2,
      title: "偏分栏",
      markup: `
<Slide>
  <BiasedColumn visualWeight={0.64}>
    <Module title="主视觉">
      <EvidenceFigure id="biased_main_evidence_real" title="主视觉证据" claim="偏分栏给主视觉更大的阅读区域。" source={biasedSource} fit="contain" priority="primary" />
    </Module>
    <Module title="右侧判断">
      <InsightText body={sideLines} maxLines={4} />
    </Module>
    <Module title="右侧结论">
      <InsightText body={supportLines} maxLines={4} />
    </Module>
  </BiasedColumn>
</Slide>`,
    },
    {
      id: "three-column",
      page: 3,
      title: "三分栏",
      markup: `
<Slide>
  <ThreeColumn>
    <Module title="机制">
      <EvidenceFigure id="three_mechanism_real" title="机制证据" claim="第一列保留源图。" source={columnSource} fit="contain" priority="supporting" />
      <InsightText body={threeLines} maxLines={5} />
    </Module>
    <Module title="收益">
      <EvidenceChart id="three_benefit_real" title="收益图" claim="第二列保留图表。" source={columnSource} fit="contain" priority="supporting" />
      <InsightText body={threeLines} maxLines={5} />
    </Module>
    <Module title="边界">
      <EvidenceFigure id="three_boundary_real" title="边界证据" claim="第三列保留源图。" source={columnSource} fit="contain" priority="supporting" />
      <InsightText body={threeLines} maxLines={5} />
    </Module>
  </ThreeColumn>
</Slide>`,
    },
  ];
}

function assertNoEmbeddedDiagnostics(layoutInfo = {}, id = "layout") {
  for (const module of layoutInfo.module_layouts || []) {
    assert.equal(module.layout_diagnostics, undefined, `${id} layout module should not expose layout_diagnostics`);
    for (const block of module.block_areas || []) {
      assert.equal(block.layout_diagnostics, undefined, `${id} layout block should not expose layout_diagnostics`);
    }
  }
}

function appendReport(report, fixture, layoutInfo, layoutIr, entries) {
  report.push(`## ${fixture.title} (${layoutInfo.type})`, "");
  report.push("### DSL", "", "```jsx", fixture.markup.trim(), "```", "");
  report.push("### Rendered Visuals", "", "| visual | role | slot | image area |", "|---|---|---|---|");
  entries.forEach((entry) => {
    report.push(`| ${entry.visual_component_id} | ${entry.visual_role} | ${rectText(entry.visual_slot)} | ${rectText(entry.image_area)} |`);
  });
  report.push("", "### Module Boxes", "", "| module | frame | body |", "|---|---|---|");
  layoutIr.containers.forEach((container, index) => {
    report.push(`| ${index + 1} | ${rectText(container.box)} | ${rectText(container.bodyBox)} |`);
  });
  report.push("", "### Checks", "", "| check | value |", "|---|---|");
  report.push(`| spacing constraints | ${layoutIr.constraints.filter((item) => item.type === "spacing").map((item) => item.value).join(", ")} |`);
  report.push(`| distribution gaps | ${layoutIr.constraints.filter((item) => item.type === "distribution").map((item) => `${item.id}: ${item.actualGaps.join(", ")}`).join("<br>")} |`);
  report.push(`| alignment groups | ${layoutIr.alignmentGroups.map((item) => `${item.edge}: ${alignmentValues(item).join(", ")}`).join("<br>")} |`);
  report.push(`| visual readability | ${layoutIr.records.filter((item) => item.readability).map((item) => `${item.identity.componentId}: area ${item.readability.actualArea}/${item.readability.minArea}`).join("<br>")} |`);
  report.push("");
}

function alignmentValues(group) {
  return group.members.map((member) => {
    if (group.edge === "bottom") return round(member.box.y + member.box.h);
    if (group.edge === "top") return round(member.box.y);
    return round(member.box.x);
  });
}

function rectText(rect = {}) {
  return `x=${round(rect.x)}, y=${round(rect.y)}, w=${round(rect.w)}, h=${round(rect.h)}`;
}

function writeSvg(fileName, label, width, height) {
  const filePath = path.join(SOURCE_DIR, fileName);
  fs.writeFileSync(filePath, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="#f7f7f7" stroke="#c00000" stroke-width="6"/>
  <line x1="80" y1="${height - 90}" x2="${width - 80}" y2="80" stroke="#c00000" stroke-width="8"/>
  <text x="60" y="90" font-size="42" font-family="Arial" fill="#333">${label}</text>
</svg>`, "utf8");
  return filePath;
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
