"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const pptxgen = require("pptxgenjs");
const { diagnostic, diagnosticsToFeedbackIssues } = require("../pptx/layout/diagnostics");
const {
  attachFeedbackIssue,
  createFeedbackIssue,
  normalizeLayoutDiagnostic,
  normalizeQaIssue,
} = require("../pptx/feedback/feedback_issue");
const {
  feedbackToJson,
  feedbackToMarkdown,
  normalizeFeedbackIssues,
} = require("../pptx/feedback/feedback_reporter");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "feedback_issue_contract");
const JSON_OUT = path.join(OUT_DIR, "feedback_issues.json");
const MARKDOWN_OUT = path.join(OUT_DIR, "feedback_issues.md");
const QA_PPTX_OUT = path.join(OUT_DIR, "qa_failure_fixture.pptx");
const QA_REPORT_OUT = path.join(OUT_DIR, "qa_failure_report.json");
const QA_FEEDBACK_OUT = path.join(OUT_DIR, "qa_failure_report.feedback.md");

const layoutDiagnostic = diagnostic(
  "layout_stack_infeasible",
  "error",
  "Module content minimum height exceeds available body height.",
  {
    available_height: 1.2,
    minimum_required_height: 1.8,
    context: {
      slide: 4,
      moduleIndex: 2,
      moduleTitle: "市场型浪费",
      blockIndex: 1,
      layoutType: "three_column",
      box: { x: 1, y: 2, w: 3, h: 1.2 },
    },
  }
);

assert.equal(layoutDiagnostic.phase, "layout");
assert.equal(layoutDiagnostic.feedback.code, "layout_stack_infeasible");
assert.equal(layoutDiagnostic.feedback.phase, "layout");
assert.equal(layoutDiagnostic.feedback.target.slide, 4);
assert.equal(layoutDiagnostic.feedback.target.moduleIndex, 2);
assert.equal(layoutDiagnostic.feedback.target.blockIndex, 1);
assert.equal(layoutDiagnostic.feedback.details.layout_type, "three_column");
assert.deepEqual(layoutDiagnostic.feedback.details.box, { x: 1, y: 2, w: 3, h: 1.2 });

const legacyLayoutFeedback = normalizeLayoutDiagnostic({
  code: "layout_manager_fallback",
  severity: "error",
  message: "Legacy allocation is required.",
  taxonomy_key: "Evidence/source_figure",
});
assert.equal(legacyLayoutFeedback.phase, "layout");
assert.equal(legacyLayoutFeedback.details.taxonomy_key, "Evidence/source_figure");

const targetedLayoutFeedback = normalizeLayoutDiagnostic({
  code: "layout_row_forced_scale",
  severity: "error",
  message: "Row is too narrow.",
  target: { slide: 9, moduleIndex: 2, moduleTitle: "收益表现", blockIndex: 1, componentId: "fig4" },
  layoutType: "two_column",
});
assert.equal(targetedLayoutFeedback.target.slide, 9);
assert.equal(targetedLayoutFeedback.target.moduleIndex, 2);
assert.equal(targetedLayoutFeedback.target.moduleTitle, "收益表现");
assert.equal(targetedLayoutFeedback.target.blockIndex, 1);
assert.equal(targetedLayoutFeedback.target.componentId, "fig4");
assert.equal(targetedLayoutFeedback.phase, "layout");

const qaFeedback = normalizeQaIssue({
  slide: 5,
  type: "body_layout_text_too_long",
  severity: "error",
  message: "Text block is too prose-heavy.",
  module_index: 1,
  block_index: 3,
  text_length: 220,
});
assert.equal(qaFeedback.code, "body_layout_text_too_long");
assert.equal(qaFeedback.phase, "qa");
assert.equal(qaFeedback.target.slide, 5);
assert.equal(qaFeedback.target.moduleIndex, 1);
assert.equal(qaFeedback.target.blockIndex, 3);
assert(qaFeedback.repairs.some((item) => /Compress/.test(item)));

const attachedQaFeedback = attachFeedbackIssue({
  slide: 6,
  type: "body_layout_text_too_long",
  severity: "error",
  message: "Text block is too prose-heavy.",
  layout_type: "three_column",
});
assert.equal(attachedQaFeedback.phase, "qa");
assert.equal(attachedQaFeedback.feedback.phase, "qa");

const explicitIssue = createFeedbackIssue({
  code: "compile_unknown_component",
  severity: "warning",
  phase: "compile",
  target: {
    path: "slides[0].body[1]",
    semanticStack: [
      { tag: "Columns", selector: "Slide > TwoColumn:nth-child(1)" },
      { tag: "Module", title: "证据模块", selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1)" },
      { tag: "EvidenceFigure", id: "fig1", selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)" },
    ],
  },
  message: "Unknown component.",
  repairs: ["Register the component or replace it with an official primitive."],
});
assert.equal(explicitIssue.phase, "compile");
assert.equal(explicitIssue.target.path, "slides[0].body[1]");
assert.equal(explicitIssue.target.semanticStack[2].id, "fig1");

const normalized = normalizeFeedbackIssues([layoutDiagnostic, qaFeedback]);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].code, "layout_stack_infeasible");
assert.equal(normalized[1].code, "body_layout_text_too_long");

const json = feedbackToJson([layoutDiagnostic, qaFeedback]);
assert(JSON.parse(json).every((item) => item.code && item.phase && item.target));

const markdown = feedbackToMarkdown([layoutDiagnostic, qaFeedback]);
assert(markdown.includes("slide 4 / module 2 / block 1"));
assert(markdown.includes("layout_stack_infeasible"));
assert(markdown.includes("body_layout_text_too_long"));
assert(markdown.includes("Phase: layout"));
assert(markdown.includes("Module: 市场型浪费"));
assert(markdown.includes("Layout Type: three_column"));

const stackMarkdown = feedbackToMarkdown([explicitIssue]);
assert(stackMarkdown.includes("Semantic Stack:"));
assert(stackMarkdown.includes("at EvidenceFigure#fig1"));

const contextFeedback = diagnosticsToFeedbackIssues([
  { code: "layout_row_forced_scale", severity: "error", message: "Too narrow." },
], { slide: 6, moduleIndex: 1 });
assert.equal(contextFeedback[0].target.slide, 6);
assert.equal(contextFeedback[0].target.moduleIndex, 1);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(JSON_OUT, feedbackToJson([layoutDiagnostic, qaFeedback, explicitIssue]), "utf8");
fs.writeFileSync(MARKDOWN_OUT, feedbackToMarkdown([layoutDiagnostic, qaFeedback, explicitIssue]), "utf8");

assert(fs.existsSync(JSON_OUT), "feedback JSON report should be written for human review");
assert(fs.existsSync(MARKDOWN_OUT), "feedback Markdown report should be written for human review");

async function writeQaFailureFixture() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "feedback smoke";
  pptx.subject = "feedback smoke";
  pptx.title = "Feedback smoke QA failure fixture";
  pptx.company = "Huawei";
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
    lang: "zh-CN",
  };

  const cover = pptx.addSlide();
  cover.addText("反馈机制测试", {
    x: 0.7,
    y: 0.6,
    w: 8,
    h: 0.5,
    fontFace: "Microsoft YaHei",
    fontSize: 24,
    color: "C00000",
  });

  const content = pptx.addSlide();
  content.addText("缺失分析总结的内容页", {
    x: 0.7,
    y: 0.25,
    w: 8,
    h: 0.4,
    fontFace: "Microsoft YaHei",
    fontSize: 24,
    color: "C00000",
  });
  content.addText("这页故意缺少分析总结和视觉锚点，用来验证真实 QA 输出会接到 FeedbackIssue。", {
    x: 0.8,
    y: 2.2,
    w: 6,
    h: 0.8,
    fontFace: "Microsoft YaHei",
    fontSize: 14,
    color: "333333",
    breakLine: false,
  });

  await pptx.writeFile({ fileName: QA_PPTX_OUT });
}

async function assertQaCliWritesFeedbackReport() {
  await writeQaFailureFixture();
  const result = spawnSync("node", [
    "scripts/qa/check_huawei_pptx.js",
    path.relative(ROOT, QA_PPTX_OUT),
    "--out",
    path.relative(ROOT, QA_REPORT_OUT),
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert.notEqual(result.status, 0, "QA fixture should fail so feedback output contains actionable issues");
  assert(fs.existsSync(QA_REPORT_OUT), "QA JSON report should be written");
  assert(fs.existsSync(QA_FEEDBACK_OUT), "QA feedback Markdown should be written next to --out JSON");

  const report = JSON.parse(fs.readFileSync(QA_REPORT_OUT, "utf8"));
  assert(Array.isArray(report.issues) && report.issues.length > 0, "QA report should include legacy issues");
  assert(Array.isArray(report.feedback_issues) && report.feedback_issues.length === report.issues.length, "QA report should include normalized feedback issues");
  assert(report.feedback_issues.every((item) => item.code && item.phase === "qa" && item.target), "each QA issue should normalize to FeedbackIssue");
  assert(report.feedback_issues.find((item) => item.code === "analysis_summary_missing")?.repairs.length > 0, "analysis summary feedback should include repair guidance");
  assert(report.feedback_issues.find((item) => item.code === "section_indicator_missing")?.repairs.length > 0, "section indicator feedback should include repair guidance");
  assert(report.feedback_issues.find((item) => item.code === "line_spacing")?.repairs.length > 0, "line spacing feedback should include repair guidance");

  const qaMarkdown = fs.readFileSync(QA_FEEDBACK_OUT, "utf8");
  assert(qaMarkdown.includes("Feedback Issues"));
  assert(qaMarkdown.includes("Repairs:"));
  assert(qaMarkdown.includes("Phase: qa"));
  assert(/analysis_summary_missing|page_title|language_|line_spacing|section_indicator_missing/.test(qaMarkdown), "QA feedback Markdown should expose real QA issue codes");
}

assertQaCliWritesFeedbackReport().then(() => {
  console.log("FeedbackIssue contract smoke passed.");
  console.log(`Feedback JSON: ${JSON_OUT}`);
  console.log(`Feedback Markdown: ${MARKDOWN_OUT}`);
  console.log(`QA feedback Markdown: ${QA_FEEDBACK_OUT}`);
}).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
