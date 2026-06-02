"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runRuntimeQaPipeline } = require("../../pptx/qa/runtime_pipeline");
const { writeIrArtifacts, writeRuntimeQaReport } = require("../../pptx/qa/runtime_reporter");
const {
  BAD_BODY_DSL,
  SUPPORTING_ONLY_BODY_DSL,
  TRACELESS_ANCHOR_BODY_DSL,
  VALID_BODY_DSL,
  scope,
} = require("./fixtures/dsl_pages");
const { validArtifacts } = require("./fixtures/artifact_fixtures");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "runtime_qa_pipeline");

const report = runRuntimeQaPipeline({
  pages: [
    { pageId: "missing-body" },
    { pageId: "bad-dsl", bodyDsl: BAD_BODY_DSL, dslScope: scope },
    { pageId: "missing-trace", bodyDsl: TRACELESS_ANCHOR_BODY_DSL, dslScope: scope },
    { pageId: "measure-failed", bodyDsl: VALID_BODY_DSL, dslScope: scope },
    { pageId: "layout-failed", bodyDsl: VALID_BODY_DSL, dslScope: scope },
  ],
  measurePage: ({ page, compileIr }) => {
    const records = compileIr.visiblePrimitives.map((primitive) => ({
      identity: primitive.identity,
      dsl: primitive.dsl,
      status: page.pageId === "measure-failed" && primitive.identity.componentId === "main_evidence" ? "failed" : "ok",
      measureSupport: "measured",
      bounds: page.pageId === "measure-failed" && primitive.identity.componentId === "main_evidence" ? { w: 0, h: 0 } : { w: 3, h: 2 },
      measurement: page.pageId === "measure-failed" && primitive.identity.componentId === "main_evidence"
        ? { ok: false, error: "PowerPoint COM failed in artifact fixture." }
        : { ok: true, shape_bounds: { w: 3, h: 2 } },
    }));
    return { expectedPrimitives: compileIr.visiblePrimitives, records };
  },
  layoutPage: ({ page, compileIr, measurementIr }) => ({
    expectedPrimitives: compileIr.visiblePrimitives,
    measuredPrimitives: measurementIr.records,
    bodyBounds: { x: 0, y: 0, w: 10, h: 5 },
    status: page.pageId === "layout-failed" ? "infeasible" : "ok",
    records: measurementIr.records.map((record) => ({
      identity: record.identity,
      dsl: record.dsl,
      box: page.pageId === "layout-failed" && record.identity.blockType === "text" ? { x: 99, y: 1, w: 2, h: 1 } : { x: 1, y: 1, w: 3, h: 2 },
      measuredBounds: record.bounds,
      style: {
        fontSize: page.pageId === "layout-failed" && record.identity.blockType === "text" ? 9 : 14,
        fontFace: "Microsoft YaHei",
        textColor: "333333",
        fillColor: "FFFFFF",
        lineColor: "C00000",
        lineWidth: 0.5,
      },
    })),
  }),
  artifacts: invalidArtifacts(),
});

const written = writeRuntimeQaReport(report, OUT_DIR);
const irArtifacts = writeIrArtifacts(report, OUT_DIR, {
  dslFileName: "page_04.dsl-ir.json",
  compileFileName: "page_04.compile-ir.json",
  measurementFileName: "page_04.measurement-ir.json",
  layoutFileName: "page_05.layout-ir.json",
  dslPageId: "measure-failed",
  compilePageId: "measure-failed",
  measurementPageId: "measure-failed",
  layoutPageId: "layout-failed",
});
const dslCaseArtifacts = writeDslCaseMatrix(OUT_DIR);
const jsonText = fs.readFileSync(written.jsonPath, "utf8");
const markdown = fs.readFileSync(written.markdownPath, "utf8");
const caseMatrixMarkdown = fs.readFileSync(dslCaseArtifacts.markdownPath, "utf8");

for (const code of [
  "dsl_page_missing_body",
  "dsl_body_not_compilable",
  "dsl_source_trace_missing",
  "measure_powerpoint_failed",
  "measure_bounds_invalid",
  "layout_page_infeasible",
  "layout_component_out_of_bounds",
  "render_evidence_incomplete",
  "render_placeholder_present",
]) {
  assert(jsonText.includes(code), `JSON report should include ${code}`);
  assert(markdown.includes(code), `Markdown report should include ${code}`);
}

assert(markdown.includes("selector: Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)"));
assert(markdown.includes("source: line 5, column 7"));
assert(markdown.includes("stack: Columns > Module > EvidenceFigure#missing_source"));
assert(markdown.includes("### measure: skipped_due_to_page_dependency"));
assert(markdown.includes("## Render / Export Fallback"));
assert(fs.existsSync(irArtifacts.dslIrPath), "DSL IR artifact should exist");
assert(fs.existsSync(irArtifacts.compileIrPath), "compile IR artifact should exist");
assert(fs.existsSync(irArtifacts.measurementIrPath), "measurement IR artifact should exist");
assert(fs.existsSync(irArtifacts.layoutIrPath), "layout IR artifact should exist");
assert.equal(JSON.parse(fs.readFileSync(irArtifacts.dslIrPath, "utf8")).irKind, "DslIr");
assert.equal(JSON.parse(fs.readFileSync(irArtifacts.compileIrPath, "utf8")).irKind, "CompileIr");
assert.equal(JSON.parse(fs.readFileSync(irArtifacts.measurementIrPath, "utf8")).irKind, "MeasurementIr");
assert.equal(JSON.parse(fs.readFileSync(irArtifacts.layoutIrPath, "utf8")).irKind, "LayoutIr");
assert(Array.isArray(JSON.parse(fs.readFileSync(irArtifacts.compileIrPath, "utf8")).nodes), "compile IR should expose nodes");
assert(Array.isArray(JSON.parse(fs.readFileSync(irArtifacts.measurementIrPath, "utf8")).records), "measurement IR should expose records");
assert(caseMatrixMarkdown.includes("dsl_page_missing_body"));
assert(caseMatrixMarkdown.includes("missing-body"));
assert(caseMatrixMarkdown.includes("runDslInputChecks"));
assert(caseMatrixMarkdown.includes("<EvidenceFigure id=\"missing_source\""));

console.log(`Runtime QA artifacts smoke passed: ${written.markdownPath}`);

function invalidArtifacts() {
  const artifacts = validArtifacts();
  artifacts.exportedPngs = ["slide_01.png"];
  artifacts.visibleTextBySlide[2] = "TODO 待补充";
  return artifacts;
}

function writeDslCaseMatrix(outputDir) {
  const { runDslInputChecks } = require("../../pptx/qa/dsl_input_checks");
  const cases = [
    {
      id: "missing-body",
      purpose: "正文页没有 bodyDsl，不能进入下游编译/测量/排版。",
      bodyDsl: "",
      expectedCodes: ["dsl_page_missing_body"],
      check: "runDslInputChecks({ pageIndex }) emits dsl_page_missing_body and page_only location.",
      result: runDslInputChecks({ pageIndex: 0 }),
    },
    {
      id: "bad-dsl",
      purpose: "AI 写了未知组件，运行态只汇总为 body 不可编译，细节保留在 compilerIssues。",
      bodyDsl: BAD_BODY_DSL,
      expectedCodes: ["dsl_body_not_compilable"],
      check: "runDslInputChecks keeps compiler-contract details nested under dsl_body_not_compilable.",
      result: runDslInputChecks({ pageIndex: 1, bodyDsl: BAD_BODY_DSL, dslScope: scope }),
    },
    {
      id: "supporting-only",
      purpose: "AI 用表格/文本冒充视觉证据，编译失败同时报告真实锚点缺失。",
      bodyDsl: SUPPORTING_ONLY_BODY_DSL,
      expectedCodes: ["dsl_body_not_compilable", "dsl_real_anchor_missing"],
      check: "runDslInputChecks sees only supporting/text primitives and emits dsl_real_anchor_missing.",
      result: runDslInputChecks({ pageIndex: 2, bodyDsl: SUPPORTING_ONLY_BODY_DSL, dslScope: scope }),
    },
    {
      id: "missing-trace",
      purpose: "AI 写了真实 EvidenceFigure，但缺 source 证据链。",
      bodyDsl: TRACELESS_ANCHOR_BODY_DSL,
      expectedCodes: ["dsl_body_not_compilable", "dsl_source_trace_missing"],
      check: "runDslInputChecks promotes Evidence traceability compiler detail into dsl_source_trace_missing.",
      result: runDslInputChecks({ pageIndex: 3, bodyDsl: TRACELESS_ANCHOR_BODY_DSL, dslScope: scope }),
    },
    {
      id: "valid-body",
      purpose: "合法 Body DSL 不应产生 DSL input runtime QA issue。",
      bodyDsl: VALID_BODY_DSL,
      expectedCodes: [],
      check: "runDslInputChecks returns an empty issue list for the valid fixture.",
      result: runDslInputChecks({ pageIndex: 4, bodyDsl: VALID_BODY_DSL, dslScope: scope }),
    },
  ].map((item) => ({
    id: item.id,
    purpose: item.purpose,
    bodyDsl: item.bodyDsl,
    expectedCodes: item.expectedCodes,
    actualCodes: item.result.issues.map((issue) => issue.code),
    check: item.check,
    issues: item.result.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      location_quality: issue.location_quality,
      selector: issue.target?.selector,
      sourceSpan: issue.target?.sourceSpan,
      codeFrame: issue.target?.codeFrame,
      details: issue.details,
    })),
  }));

  for (const item of cases) {
    assert.deepStrictEqual(item.actualCodes.sort(), item.expectedCodes.sort(), `${item.id} DSL case codes should match`);
  }

  const jsonPath = path.join(outputDir, "dsl_runtime_case_matrix.json");
  const markdownPath = path.join(outputDir, "dsl_runtime_case_matrix.md");
  fs.writeFileSync(jsonPath, JSON.stringify(cases, null, 2), "utf8");
  fs.writeFileSync(markdownPath, dslCaseMatrixToMarkdown(cases), "utf8");
  return { jsonPath, markdownPath };
}

function dslCaseMatrixToMarkdown(cases = []) {
  const lines = [
    "# DSL Input Runtime QA Case Matrix",
    "",
    "| Case | Purpose | Expected Codes | Actual Codes | Check |",
    "|------|---------|----------------|--------------|-------|",
  ];
  for (const item of cases) {
    lines.push(`| ${item.id} | ${escapeTable(item.purpose)} | ${item.expectedCodes.join(", ") || "none"} | ${item.actualCodes.join(", ") || "none"} | ${escapeTable(item.check)} |`);
  }
  for (const item of cases) {
    lines.push("", `## ${item.id}`, "", "### DSL Fixture", "", "```jsx", item.bodyDsl || "(missing bodyDsl)", "```", "", "### Issues", "");
    if (!item.issues.length) {
      lines.push("No DSL input runtime issues.");
      continue;
    }
    for (const issue of item.issues) {
      lines.push(`- ${issue.code}: ${issue.message}`);
      lines.push(`  - location: ${issue.location_quality}`);
      if (issue.selector) lines.push(`  - selector: ${issue.selector}`);
      if (issue.sourceSpan) lines.push(`  - source: line ${issue.sourceSpan.line}, column ${issue.sourceSpan.column}`);
      if (issue.codeFrame) lines.push(`  - code: ${issue.codeFrame}`);
    }
  }
  return lines.join("\n") + "\n";
}

function escapeTable(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}
