"use strict";

const assert = require("assert");
const { parseSlideBodyDsl } = require("../../pptx/dsl/jsx_dsl");
const { compileSlideDsl } = require("../../pptx/dsl/compile_slide_dsl");
const { VALID_BODY_DSL, scope } = require("./fixtures/dsl_pages");

const parsed = parseSlideBodyDsl(VALID_BODY_DSL, scope);
const evidence = parsed.bodyDsl.children[0].children[0];

assert.equal(parsed.bodyDsl.props.__dsl.selector, "Slide > TwoColumn:nth-child(1)");
assert.equal(evidence.props.__dsl.selector, "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)");
assert.deepStrictEqual(Object.keys(evidence.props.__dsl.sourceSpan).sort(), ["column", "end", "line", "start"].sort());
assert.equal(evidence.props.__dsl.sourceSpan.line, 5);
assert(evidence.props.__dsl.sourceSpan.column > 0, "source span should include one-based column");
assert(evidence.props.__dsl.codeFrame.includes("<EvidenceFigure"), "source span should carry a local code frame");

const invalidChild = parseSlideBodyDsl(`
<Slide>
  <TwoColumn>
    <EvidenceFigure id="bad_child" title="错位" claim="不能直接放在 Columns 下。" source={source} />
  </TwoColumn>
</Slide>`, scope).bodyDsl;
const invalid = compileSlideDsl(invalidChild, { throwOnError: false });
const childIssue = invalid.feedbackIssues.find((issue) => issue.code === "dsl_child_component_invalid");
assert(childIssue, "invalid child issue should be produced");
assert.equal(childIssue.target.selector, "Slide > TwoColumn:nth-child(1) > EvidenceFigure:nth-child(1)");
assert.equal(childIssue.target.sourceSpan.line, 4);
assert(childIssue.target.codeFrame.includes("<EvidenceFigure"), "invalid child issue should point at child code frame");

console.log("Runtime QA DSL source map contract passed.");
