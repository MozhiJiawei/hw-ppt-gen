"use strict";

const assert = require("assert");
const { spawnSync } = require("child_process");
const { runDslInputChecks } = require("../../pptx/qa/dsl_input_checks");
const { assertIssueCliFeedback } = require("./assert_cli_feedback");
const {
  BAD_BODY_DSL,
  SUPPORTING_ONLY_BODY_DSL,
  TRACELESS_ANCHOR_BODY_DSL,
  VALID_BODY_DSL,
  scope,
} = require("./fixtures/dsl_pages");

function codes(result) {
  return result.issues.map((issue) => issue.code).sort();
}

function assertCliForAll(result) {
  for (const issue of result.issues) assertIssueCliFeedback(issue);
}

const missingBody = runDslInputChecks({ pageIndex: 0 });
assert.deepStrictEqual(codes(missingBody), ["dsl_page_missing_body"]);
assertCliForAll(missingBody);

const bad = runDslInputChecks({ pageIndex: 1, bodyDsl: BAD_BODY_DSL, dslScope: scope });
assert.deepStrictEqual(codes(bad), ["dsl_body_not_compilable"]);
assert(bad.issues[0].details.compilerIssues.some((issue) => issue.code === "dsl_component_prop_invalid"));
assertCliForAll(bad);

const malformed = runDslInputChecks({ pageIndex: 5, bodyDsl: "<Slide>\n  <TwoColumn>\n    <Module>\n", dslScope: scope });
assert.deepStrictEqual(codes(malformed), ["dsl_body_not_compilable"]);
assert.equal(malformed.issues[0].location_quality, "dsl_mapped");
assert.equal(malformed.issues[0].target.sourceSpan.line, 3);
assert(malformed.issues[0].target.codeFrame.includes("<Module>"));
assertCliForAll(malformed);

const malformedProp = runDslInputChecks({ pageIndex: 6, bodyDsl: "<Slide>\n  <TwoColumn 123bad=\"x\" />\n</Slide>", dslScope: scope });
assert.deepStrictEqual(codes(malformedProp), ["dsl_body_not_compilable"]);
assert.equal(malformedProp.issues[0].target.sourceSpan.line, 2);
assert(malformedProp.issues[0].target.codeFrame.includes("123bad"));
assertCliForAll(malformedProp);

const multipleRoots = runDslInputChecks({ pageIndex: 7, bodyDsl: "<TwoColumn />\n<TwoColumn />", dslScope: scope });
assert.deepStrictEqual(codes(multipleRoots), ["dsl_body_not_compilable"]);
assert.equal(multipleRoots.issues[0].target.sourceSpan.line, 2);
assert(multipleRoots.issues[0].target.codeFrame.includes("<TwoColumn"));
assertCliForAll(multipleRoots);

const metaContaminatedBodyDsl = `
<Slide>
  <TwoColumn>
    <Module title="机制证据">
      <EvidenceFigure id="fig2" title="Figure 2" claim="Figure 2 支撑机制判断。" source={source} />
      <InsightText body={metaBody} />
    </Module>
    <Module title="结论">
      <EvidenceFigure id="secondary_evidence" title="补充来源图" claim="补充来源图让结论模块满足真实锚点规则。" source={source} fit="contain" />
      <InsightText body={body} />
    </Module>
  </TwoColumn>
</Slide>`;
const metaScope = {
  ...scope,
  metaBody: ["保留证据：Figure 2 原图在 Page 6 放大呈现。", "概览表达：Summary 只压缩机制顺序，不替代源图。"],
};
const metaContaminated = runDslInputChecks({ pageIndex: 8, bodyDsl: metaContaminatedBodyDsl, dslScope: metaScope });
assert(metaContaminated.issues.some((issue) => issue.code === "dsl_visible_text_meta_contamination"));
const contaminationIssue = metaContaminated.issues.find((issue) => issue.code === "dsl_visible_text_meta_contamination");
assert(contaminationIssue.target.selector.includes("InsightText"));
assert(contaminationIssue.details.text.includes("Figure 2"));
assert(contaminationIssue.repairs.join(" ").includes("business claim"));
assertCliForAll(metaContaminated);

assert.deepStrictEqual(
  codes(runDslInputChecks({ pageIndex: 2, bodyDsl: SUPPORTING_ONLY_BODY_DSL, dslScope: scope })),
  ["dsl_body_not_compilable"]
);
const supportingOnly = runDslInputChecks({ pageIndex: 2, bodyDsl: SUPPORTING_ONLY_BODY_DSL, dslScope: scope });
assert(supportingOnly.issues[0].details.compilerIssues.some((issue) => issue.code === "dsl_module_real_anchor_missing"));
assertCliForAll(supportingOnly);

const traceless = runDslInputChecks({ pageIndex: 3, bodyDsl: TRACELESS_ANCHOR_BODY_DSL, dslScope: scope });
assert(traceless.issues.some((issue) => issue.code === "dsl_source_trace_missing"));
const tracelessIssue = traceless.issues.find((issue) => issue.code === "dsl_source_trace_missing");
assert(tracelessIssue.target.selector.includes("EvidenceFigure"));
assert.equal(tracelessIssue.details.compilerIssue.details.componentTag, "EvidenceFigure");
assert.deepStrictEqual(tracelessIssue.details.compilerIssue.details.missingProps, ["source"]);
assertCliForAll(traceless);

assert.deepStrictEqual(codes(runDslInputChecks({ pageIndex: 4, bodyDsl: VALID_BODY_DSL, dslScope: scope })), []);

const cli = spawnSync(process.execPath, ["-e", `
const { createHuaweiDeck } = require("./scripts/pptx/hw_pptx_helpers");
const { addVisualAnchorContentSlide } = require("./scripts/pptx/hw_visual_anchor_slide");
const { parseSlideBodyDsl } = require("./scripts/pptx/dsl/jsx_dsl");
const bodyDsl = parseSlideBodyDsl(${JSON.stringify(TRACELESS_ANCHOR_BODY_DSL)}, {
  body: ["判断：真实生成入口必须阻断 DSL 输入错误。"],
}).bodyDsl;
const pptx = createHuaweiDeck({ title: "DSL gate CLI smoke" });
try {
  addVisualAnchorContentSlide(pptx, {
    page: "01",
    title: "DSL gate",
    sections: ["QA"],
    currentSection: "QA",
    summary: { body: [{ label: "检查", text: "DSL input QA must gate actual generation." }] },
    bodyDsl,
  });
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
`], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const cliOutput = `${cli.stdout || ""}${cli.stderr || ""}`;
assert.notEqual(cli.status, 0, "real content slide CLI path should fail on DSL input errors");
assert(cliOutput.includes("dsl_input:dsl_source_trace_missing"), cliOutput);
assert(cliOutput.includes("Selector: Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)"), cliOutput);
assert(cliOutput.includes("Source: line 5, column 7"), cliOutput);
assert(cliOutput.includes("Code: <EvidenceFigure"), cliOutput);
assert(!/^\s+at\s+\S+/m.test(cliOutput), cliOutput);

const metaCli = spawnSync(process.execPath, ["-e", `
const { createHuaweiDeck } = require("./scripts/pptx/hw_pptx_helpers");
const { addVisualAnchorContentSlide } = require("./scripts/pptx/hw_visual_anchor_slide");
const { parseSlideBodyDsl } = require("./scripts/pptx/dsl/jsx_dsl");
const bodyDsl = parseSlideBodyDsl(${JSON.stringify(metaContaminatedBodyDsl)}, {
  source: { path: ".tmp/source.png", caption: "source" },
  body: ["判断：真实生成入口必须阻断正文元话语。"],
  metaBody: ["保留证据：Figure 2 原图在 Page 6 放大呈现。"],
}).bodyDsl;
const pptx = createHuaweiDeck({ title: "DSL meta contamination smoke" });
try {
  addVisualAnchorContentSlide(pptx, {
    page: "01",
    title: "DSL meta contamination",
    sections: ["QA"],
    currentSection: "QA",
    summary: { body: [{ label: "检查", text: "DSL input QA must reject visible process meta commentary." }] },
    bodyDsl,
  });
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
`], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const metaCliOutput = `${metaCli.stdout || ""}${metaCli.stderr || ""}`;
assert.notEqual(metaCli.status, 0, "real content slide CLI path should fail on visible process meta text");
assert(metaCliOutput.includes("dsl_input:dsl_visible_text_meta_contamination"), metaCliOutput);
assert(metaCliOutput.includes("Visible PPT text contains generation"), metaCliOutput);
assert(metaCliOutput.includes("Selector: Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(2)"), metaCliOutput);
assert(!/^\s+at\s+\S+/m.test(metaCliOutput), metaCliOutput);

console.log("Runtime QA DSL input checks passed.");
