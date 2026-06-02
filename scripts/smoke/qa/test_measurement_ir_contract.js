"use strict";

const assert = require("assert");
const { normalizeMeasurementIr } = require("../../pptx/qa/measurement_checks");
const { validMeasurementIr } = require("./fixtures/measurement_ir_fixtures");

const ir = normalizeMeasurementIr(validMeasurementIr());

assert.equal(ir.phase, "measure");
assert.equal(ir.pageId, "p1");
assert.equal(ir.expectedPrimitives[0].identity.componentId, "main_evidence");
assert.equal(ir.records[0].identity.template, "source_figure");
assert.equal(ir.records[0].dsl.selector, ir.expectedPrimitives[0].dsl.selector);
assert.doesNotThrow(() => JSON.parse(JSON.stringify(ir)), "measurement IR must serialize");

console.log("Runtime QA measurement IR contract passed.");
