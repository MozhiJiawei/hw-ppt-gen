"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { parseSlideBodyDsl } = require("../../pptx/dsl/jsx_dsl");
const { compileSlideDsl } = require("../../pptx/dsl/compile_slide_dsl");
const { feedbackToJson, feedbackToMarkdown } = require("../../pptx/feedback/feedback_reporter");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "dsl_bad_case_feedback_matrix");

const scope = {
  source: { path: ".tmp/source.png", caption: "source" },
  rows: [["项", "判断"], ["A", "成立"]],
  cards: [{ label: "收益", value: "42%" }],
  levels: [{ label: "基础", value: "输入" }],
  body: ["判断：这是一个短句。"],
  style: { display: "grid" },
};

function twoColumn(innerA, innerB = withEvidence("", "fig_secondary")) {
  return `<Slide><TwoColumn><Module title="证据">${innerA}</Module><Module title="结论">${innerB}</Module></TwoColumn></Slide>`;
}

function withEvidence(extra = "", id = "fig_ok") {
  return `<EvidenceFigure id="${id}" title="来源图" claim="来源图支撑判断。" source={source} fit="contain" ${extra} />`;
}

const cases = [
  // Unknown or misplaced components.
  bad("unknown-root", `<Slide><GhostRoot /></Slide>`, "dsl_component_prop_invalid"),
  bad("unknown-under-layout", `<Slide><TwoColumn><MysteryBox /></TwoColumn></Slide>`, "dsl_component_prop_invalid"),
  bad("unknown-under-module", twoColumn(`<MysteryBox />`), "dsl_component_prop_invalid"),
  bad("unknown-nested", twoColumn(`<EvidenceFigure id="fig1" title="图" claim="证明" source={source}><MysteryBox /></EvidenceFigure>`), "dsl_component_prop_invalid"),
  bad("internal-raw-visual-missing-contract", twoColumn(`<RawVisualSpec />`), "dsl_module_real_anchor_missing"),

  // Forbidden manual layout/style props.
  ...["style", "x", "y", "w", "h", "width", "height", "left", "top", "right", "bottom", "margin", "padding", "zIndex", "z-index", "coordinates"].map((prop) => {
    const attr = prop.includes("-") ? `${prop}="1"` : `${prop}={style}`;
    return bad(`forbidden-${prop}`, twoColumn(`<EvidenceFigure id="fig_${prop.replace(/\W/g, "_")}" title="图" claim="证明" source={source} fit="contain" ${attr} />`), "dsl_component_prop_invalid");
  }),

  // Required prop omissions.
  bad("evidence-missing-id", twoColumn(`<EvidenceFigure title="来源图" claim="证明" source={source} fit="contain" />`), "dsl_component_prop_invalid"),
  bad("evidence-missing-title", twoColumn(`<EvidenceFigure id="fig1" claim="证明" source={source} fit="contain" />`), "dsl_component_prop_invalid"),
  bad("evidence-missing-claim", twoColumn(`<EvidenceFigure id="fig1" title="来源图" source={source} fit="contain" />`), "dsl_component_prop_invalid"),
  bad("evidence-missing-source", twoColumn(`<EvidenceFigure id="fig1" title="来源图" claim="证明" fit="contain" />`), "dsl_component_prop_invalid"),
  bad("chart-missing-source", twoColumn(`<EvidenceChart id="chart1" title="图表" claim="证明" fit="contain" />`), "dsl_component_prop_invalid"),
  bad("kpi-missing-id", twoColumn(`${withEvidence()}<KpiCards title="读数" claim="辅助" cards={cards} />`), "dsl_component_prop_invalid"),
  bad("kpi-missing-cards", twoColumn(`${withEvidence()}<KpiCards id="kpi1" title="读数" claim="辅助" />`), "dsl_component_prop_invalid"),
  bad("table-missing-rows", twoColumn(`${withEvidence()}<Table id="tbl1" title="表" claim="辅助" />`), "dsl_component_prop_invalid"),
  bad("capability-missing-levels", twoColumn(`${withEvidence()}<CapabilityStack id="stack1" title="能力" claim="辅助" />`), "dsl_component_prop_invalid"),
  bad("text-missing-body", twoColumn(`${withEvidence()}`, `<InsightText />`), "dsl_component_prop_invalid"),
  bad("visual-missing-draw", twoColumn(`<Visual id="v1" title="图" claim="证明" model={{}} />`), "dsl_component_prop_invalid"),
  bad("visual-missing-model", twoColumn(`<Visual id="v1" title="图" claim="证明" draw="Sequence/process" />`), "dsl_component_prop_invalid"),

  // Invalid enums and layout intent.
  bad("evidence-fit-cover", twoColumn(`<EvidenceFigure id="fig1" title="图" claim="证明" source={source} fit="cover" />`), "dsl_component_prop_invalid"),
  bad("evidence-fit-stretch", twoColumn(`<EvidenceFigure id="fig1" title="图" claim="证明" source={source} fit="stretch" />`), "dsl_component_prop_invalid"),
  bad("evidence-priority-urgent", twoColumn(`<EvidenceFigure id="fig1" title="图" claim="证明" source={source} fit="contain" priority="urgent" />`), "dsl_component_prop_invalid"),
  bad("evidence-density-tiny", twoColumn(`<EvidenceFigure id="fig1" title="图" claim="证明" source={source} fit="contain" density="tiny" />`), "dsl_component_prop_invalid"),
  bad("evidence-align-justify", twoColumn(`<EvidenceFigure id="fig1" title="图" claim="证明" source={source} fit="contain" align="justify" />`), "dsl_component_prop_invalid"),
  bad("evidence-valign-center", twoColumn(`<EvidenceFigure id="fig1" title="图" claim="证明" source={source} fit="contain" valign="center" />`), "dsl_component_prop_invalid"),
  bad("text-priority-main", twoColumn(`${withEvidence()}`, `<InsightText body={body} priority="main" />`), "dsl_component_prop_invalid"),
  bad("text-density-dense", twoColumn(`${withEvidence()}`, `<InsightText body={body} density="dense" />`), "dsl_component_prop_invalid"),
  bad("kpi-fit-stretch", twoColumn(`${withEvidence()}<KpiCards id="kpi1" title="读数" claim="辅助" cards={cards} fit="stretch" />`), "dsl_component_prop_invalid"),
  bad("columns-invalid-type", `<Slide><Columns type="grid"><Module title="证据">${withEvidence()}</Module><Module title="结论">${withEvidence("", "fig_secondary")}</Module></Columns></Slide>`, "dsl_component_prop_invalid"),

  // Numeric limits.
  bad("kpi-maxcards-too-high", twoColumn(`${withEvidence()}<KpiCards id="kpi1" title="读数" claim="辅助" cards={cards} maxCards={9} />`), "dsl_component_prop_invalid"),
  bad("kpi-maxcards-zero", twoColumn(`${withEvidence()}<KpiCards id="kpi1" title="读数" claim="辅助" cards={cards} maxCards={0} />`), "dsl_component_prop_invalid"),
  bad("table-maxitems-too-high", twoColumn(`${withEvidence()}<Table id="tbl1" title="表" claim="辅助" rows={rows} maxItems={20} />`), "dsl_component_prop_invalid"),
  bad("table-maxitems-zero", twoColumn(`${withEvidence()}<Table id="tbl1" title="表" claim="辅助" rows={rows} maxItems={0} />`), "dsl_component_prop_invalid"),
  bad("text-maxlines-not-number", twoColumn(`${withEvidence()}`, `<InsightText body={body} maxLines="many" />`), "dsl_component_prop_invalid"),
  bad("text-maxlines-zero", twoColumn(`${withEvidence()}`, `<InsightText body={body} maxLines={0} />`), "dsl_component_prop_invalid"),
  bad("text-maxlines-too-high", twoColumn(`${withEvidence()}`, `<InsightText body={body} maxLines={99} />`), "dsl_component_prop_invalid"),

  // Tree structure and semantic proof failures.
  bad("root-module", `<Slide><Module title="孤立模块">${withEvidence()}</Module></Slide>`, "dsl_root_invalid"),
  bad("empty-two-column", `<Slide><TwoColumn></TwoColumn></Slide>`, "dsl_modules_missing"),
  bad("two-column-one-module", `<Slide><TwoColumn><Module title="证据">${withEvidence()}</Module></TwoColumn></Slide>`, "dsl_component_tree_invalid"),
  bad("three-column-two-modules", `<Slide><ThreeColumn><Module title="证据">${withEvidence()}</Module><Module title="结论">${withEvidence("", "fig_secondary")}</Module></ThreeColumn></Slide>`, "dsl_component_tree_invalid"),
  bad("four-column-three-modules", `<Slide><FourColumn><Module title="一">${withEvidence()}</Module><Module title="二">${withEvidence("", "fig_secondary")}</Module><Module title="三">${withEvidence("", "fig_third")}</Module></FourColumn></Slide>`, "dsl_component_tree_invalid"),
  bad("columns-child-not-module", `<Slide><TwoColumn><EvidenceFigure id="fig1" title="图" claim="证明" source={source} fit="contain" /></TwoColumn></Slide>`, "dsl_child_component_invalid"),
  bad("supporting-only-table", twoColumn(`<Table id="tbl1" title="表" claim="辅助" rows={rows} />`), "dsl_module_real_anchor_missing"),
  bad("supporting-only-kpi", twoColumn(`<KpiCards id="kpi1" title="读数" claim="辅助" cards={cards} />`), "dsl_module_real_anchor_missing"),
  bad("text-only", twoColumn(`<InsightText body={body} />`), "dsl_module_real_anchor_missing"),

  // Official draw mistakes.
  bad("visual-bad-kind", twoColumn(`<Visual id="v1" title="坏图" claim="测试" draw="Nope/process" model={{}} />`), "dsl_component_prop_invalid"),
  bad("visual-bad-template", twoColumn(`<Visual id="v1" title="坏图" claim="测试" draw="Sequence/nope" model={{}} />`), "dsl_component_prop_invalid"),
  bad("visual-dot-bad-template", twoColumn(`<Visual id="v1" title="坏图" claim="测试" draw="Sequence.nope" model={{}} />`), "dsl_component_prop_invalid"),
  bad("visual-evidence-draw", twoColumn(`<Visual id="v1" title="坏图" claim="测试" draw="Evidence/source_figure" model={{}} />`), "dsl_component_prop_invalid"),
  bad("visual-empty-draw", twoColumn(`<Visual id="v1" title="坏图" claim="测试" draw="" model={{}} />`), "dsl_component_prop_invalid"),
];

function bad(name, markup, expectedCode) {
  return { name, markup, expectedCode };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  assert(cases.length >= 50, "bad-case matrix should cover at least 50 failure cases");

  const summary = [];
  for (const item of cases) {
    const bodyDsl = parseSlideBodyDsl(item.markup, scope).bodyDsl;
    const result = compileSlideDsl(bodyDsl, { throwOnError: false });
    assert.equal(result.ok, false, `${item.name} should fail compile`);
    assert(result.feedbackIssues.some((issue) => issue.code === item.expectedCode), `${item.name} should include ${item.expectedCode}`);
    assert(result.feedbackIssues.length > 0, `${item.name} should return feedback issues`);

    result.feedbackIssues.forEach((issue) => assertActionableIssue(item.name, issue));

    const markdown = feedbackToMarkdown(result.feedbackIssues);
    assert(markdown.includes("Phase: compile"), `${item.name} feedback markdown should include phase`);
    assert(markdown.includes("Selector:") || markdown.includes("Path:"), `${item.name} feedback markdown should include location`);
    assert(markdown.includes("Semantic Stack:"), `${item.name} feedback markdown should include semantic stack`);

    const base = safeFileName(item.name);
    fs.writeFileSync(path.join(OUT_DIR, `${base}.json`), feedbackToJson(result.feedbackIssues), "utf8");
    fs.writeFileSync(path.join(OUT_DIR, `${base}.md`), markdown, "utf8");
    summary.push({
      name: item.name,
      expectedCode: item.expectedCode,
      issueCodes: result.feedbackIssues.map((issue) => issue.code),
      primaryTarget: result.feedbackIssues[0].target,
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`DSL bad-case feedback matrix passed: ${cases.length} cases, ${OUT_DIR}`);
}

function assertActionableIssue(caseName, issue) {
  assert(issue.code, `${caseName} issue should have code`);
  assert(issue.message, `${caseName} issue should have message`);
  assert.equal(issue.phase, "compile", `${caseName} issue should be compile phase`);
  assert(issue.repairs && issue.repairs.length > 0, `${caseName} issue should include repair hints`);
  assert(issue.target && (issue.target.selector || issue.target.path), `${caseName} issue should include selector or path`);
  assert(Array.isArray(issue.target.semanticStack) && issue.target.semanticStack.length > 0, `${caseName} issue should include semantic stack`);
  const top = issue.target.semanticStack[0];
  assert(top.tag, `${caseName} semantic stack frames should include tags`);
}

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
}

main();
