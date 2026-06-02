"use strict";

const assert = require("assert");
const { runMeasurementChecks } = require("../../pptx/qa/measurement_checks");
const { expectedPrimitive, measuredRecord, validMeasurementIr } = require("./fixtures/measurement_ir_fixtures");

function has(code, ir) {
  return runMeasurementChecks(ir).issues.some((issue) => issue.code === code);
}

assert.equal(runMeasurementChecks(validMeasurementIr()).issues.length, 0);
assert(has("measure_component_unmeasured", { expectedPrimitives: [expectedPrimitive()], records: [] }));
assert(has("measure_component_unmeasurable", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { measureSupport: "UNSUPPORTED" })] }));
assert(has("measure_component_mismatch", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { identity: { componentId: "main_evidence", blockType: "visual_anchor", kind: "Matrix", template: "table" } })] }));
assert(has("measure_component_mismatch", {
  expectedPrimitives: [expectedPrimitive()],
  records: [measuredRecord("wrong_id", { dsl: expectedPrimitive().dsl })],
}));
assert(has("measure_powerpoint_failed", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { status: "failed", measurement: { ok: false, error: "COM failed" } })] }));
assert(has("measure_bounds_invalid", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { bounds: { w: 0, h: 2 } })] }));

const failed = runMeasurementChecks({
  expectedPrimitives: [expectedPrimitive()],
  records: [measuredRecord("main_evidence", { status: "failed", measurement: { ok: false, error: "COM failed" } })],
}).issues.find((issue) => issue.code === "measure_powerpoint_failed");
assert.equal(failed.location_quality, "dsl_mapped");
assert.equal(failed.target.selector, "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)");
assert.equal(failed.target.sourceSpan.line, 5);
assert(failed.target.semanticStack.some((frame) => frame.tag === "EvidenceFigure"));

const anonymousTextA = {
  nodeId: "module-0:block-0:text",
  identity: { blockType: "text", kind: "Text", template: "body_text" },
  dsl: { selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(1)", path: "bodyDsl.children[0].children[0]" },
};
const anonymousTextB = {
  nodeId: "module-0:block-1:text",
  identity: { blockType: "text", kind: "Text", template: "body_text" },
  dsl: { selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(2)", path: "bodyDsl.children[0].children[1]" },
};
assert(has("measure_component_unmeasured", {
  expectedPrimitives: [anonymousTextA, anonymousTextB],
  records: [{ ...anonymousTextA, bounds: { w: 2, h: 1 }, measurement: { ok: true, text_bounds: { w: 2, h: 1 } } }],
}));

console.log("Runtime QA measurement checks passed.");
