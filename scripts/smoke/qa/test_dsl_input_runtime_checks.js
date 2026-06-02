"use strict";

const assert = require("assert");
const { runDslInputChecks } = require("../../pptx/qa/dsl_input_checks");
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

assert.deepStrictEqual(codes(runDslInputChecks({ pageIndex: 0 })), ["dsl_page_missing_body"]);

const bad = runDslInputChecks({ pageIndex: 1, bodyDsl: BAD_BODY_DSL, dslScope: scope });
assert.deepStrictEqual(codes(bad), ["dsl_body_not_compilable"]);
assert(bad.issues[0].details.compilerIssues.some((issue) => issue.code === "dsl_component_prop_invalid"));

const malformed = runDslInputChecks({ pageIndex: 5, bodyDsl: "<Slide>\n  <TwoColumn>\n    <Module>\n", dslScope: scope });
assert.deepStrictEqual(codes(malformed), ["dsl_body_not_compilable"]);
assert.equal(malformed.issues[0].location_quality, "dsl_mapped");
assert.equal(malformed.issues[0].target.sourceSpan.line, 3);
assert(malformed.issues[0].target.codeFrame.includes("<Module>"));

const malformedProp = runDslInputChecks({ pageIndex: 6, bodyDsl: "<Slide>\n  <TwoColumn 123bad=\"x\" />\n</Slide>", dslScope: scope });
assert.deepStrictEqual(codes(malformedProp), ["dsl_body_not_compilable"]);
assert.equal(malformedProp.issues[0].target.sourceSpan.line, 2);
assert(malformedProp.issues[0].target.codeFrame.includes("123bad"));

const multipleRoots = runDslInputChecks({ pageIndex: 7, bodyDsl: "<TwoColumn />\n<TwoColumn />", dslScope: scope });
assert.deepStrictEqual(codes(multipleRoots), ["dsl_body_not_compilable"]);
assert.equal(multipleRoots.issues[0].target.sourceSpan.line, 2);
assert(multipleRoots.issues[0].target.codeFrame.includes("<TwoColumn"));

assert.deepStrictEqual(
  codes(runDslInputChecks({ pageIndex: 2, bodyDsl: SUPPORTING_ONLY_BODY_DSL, dslScope: scope })),
  ["dsl_body_not_compilable", "dsl_real_anchor_missing"]
);

const traceless = runDslInputChecks({ pageIndex: 3, bodyDsl: TRACELESS_ANCHOR_BODY_DSL, dslScope: scope });
assert(traceless.issues.some((issue) => issue.code === "dsl_source_trace_missing"));
const tracelessIssue = traceless.issues.find((issue) => issue.code === "dsl_source_trace_missing");
assert(tracelessIssue.target.selector.includes("EvidenceFigure"));
assert.equal(tracelessIssue.details.compilerIssue.details.componentTag, "EvidenceFigure");
assert.deepStrictEqual(tracelessIssue.details.compilerIssue.details.missingProps, ["source"]);

assert.deepStrictEqual(codes(runDslInputChecks({ pageIndex: 4, bodyDsl: VALID_BODY_DSL, dslScope: scope })), []);

console.log("Runtime QA DSL input checks passed.");
