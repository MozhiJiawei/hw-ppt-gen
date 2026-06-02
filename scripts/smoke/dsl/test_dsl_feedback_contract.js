"use strict";

const assert = require("assert");
const { parseSlideBodyDsl } = require("../../pptx/dsl/jsx_dsl");
const { compileSlideDsl } = require("../../pptx/dsl/compile_slide_dsl");
const { feedbackToMarkdown } = require("../../pptx/feedback/feedback_reporter");

function main() {
  const unknownDsl = parseSlideBodyDsl(`<Slide><TwoColumn><MysteryBox /></TwoColumn></Slide>`).bodyDsl;
  const unknown = compileSlideDsl(unknownDsl, { throwOnError: false });
  assert.equal(unknown.ok, false, "unknown component should fail compile");
  assert(unknown.feedbackIssues.some((issue) => issue.code === "dsl_component_prop_invalid" && issue.phase === "compile"), "unknown component should produce compile feedback");
  assert(unknown.feedbackIssues.some((issue) => issue.target.selector === "Slide > TwoColumn:nth-child(1) > MysteryBox:nth-child(1)"), "feedback should be JSX selector mapped");

  const tableOnlyDsl = parseSlideBodyDsl(`
    <Slide>
      <TwoColumn>
        <Module title="只有表格">
          <Table id="supporting_table" title="表格" claim="表格只是辅助读数。" rows={rows} />
        </Module>
        <Module title="说明">
          <InsightText body={body} />
        </Module>
      </TwoColumn>
    </Slide>
  `, {
    rows: [["项", "判断"], ["A", "B"]],
    body: ["判断：没有真实锚点。"],
  }).bodyDsl;
  const tableOnly = compileSlideDsl(tableOnlyDsl, { throwOnError: false });
  assert.equal(tableOnly.ok, false, "supporting-only DSL should fail");
  assert(tableOnly.feedbackIssues.some((issue) => issue.code === "dsl_component_tree_invalid"), "supporting-only failure should be DSL tree feedback");
  const markdown = feedbackToMarkdown(tableOnly.feedbackIssues);
  assert(markdown.includes("Phase: compile"), "feedback markdown should show compile phase");
  assert(markdown.includes("Selector:"), "feedback markdown should look like DOM inspector output");
  assert(markdown.includes("supporting components cannot satisfy"), "feedback markdown should carry actionable message");

  const badIntentDsl = parseSlideBodyDsl(`<Slide><TwoColumn style={style}></TwoColumn></Slide>`, { style: { display: "grid" } }).bodyDsl;
  const badIntent = compileSlideDsl(badIntentDsl, { throwOnError: false });
  assert.equal(badIntent.ok, false, "unsupported layout prop should fail before measurement");
  assert(badIntent.feedbackIssues.some((issue) => /style/.test(issue.message)), "style prop should be rejected in compile feedback");
  assert(badIntent.feedbackIssues.some((issue) => issue.target.selector === "Slide > TwoColumn:nth-child(1)"), "prop feedback should target the component selector");

  const validDsl = parseSlideBodyDsl(`
    <Slide>
      <TwoColumn>
        <Module title="主证据">
          <EvidenceFigure id="main_evidence" title="来源图" claim="来源图支撑判断。" source={source} priority="primary" fit="contain" />
          <InsightText body={body} maxLines={2} priority="supporting" />
        </Module>
        <Module title="结论">
          <InsightText body={body} />
        </Module>
      </TwoColumn>
    </Slide>
  `, {
    source: { path: ".tmp/source.png", caption: "source" },
    body: ["判断：保留语义级反馈。"],
  }).bodyDsl;
  const valid = compileSlideDsl(validDsl, { throwOnError: false });
  assert.equal(valid.ok, true, "valid DSL should compile");
  const evidencePrimitive = valid.renderModel.modules[0].componentPrimitives[0];
  assert.equal(evidencePrimitive.dsl.selector, "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)");
  assert.equal(evidencePrimitive.dsl.priority, "primary");
  assert.equal(evidencePrimitive.sourceComponent.selector, evidencePrimitive.dsl.selector);
  assert.deepEqual(evidencePrimitive.dsl.semanticStack.map((frame) => frame.tag), ["Columns", "Module", "EvidenceFigure"]);

  const semanticMarkdown = feedbackToMarkdown([{
    code: "layout_evidence_readable_area_floor",
    severity: "error",
    phase: "layout",
    target: {
      selector: evidencePrimitive.dsl.selector,
      semanticStack: evidencePrimitive.dsl.semanticStack,
    },
    message: "Evidence component cannot preserve a readable source area in the current DSL layout.",
  }]);
  assert(semanticMarkdown.includes("Semantic Stack:"), "feedback markdown should include compiler-like semantic stack");
  assert(semanticMarkdown.includes("at EvidenceFigure#main_evidence"), "semantic stack should identify the DSL component");

  console.log("DSL feedback contract tests passed");
}

main();
