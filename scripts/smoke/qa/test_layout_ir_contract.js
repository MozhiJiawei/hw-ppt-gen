"use strict";

const assert = require("assert");
const { normalizeLayoutIr } = require("../../pptx/qa/layout_checks");
const { validLayoutIr } = require("./fixtures/layout_ir_fixtures");

const ir = normalizeLayoutIr(validLayoutIr());

assert.equal(ir.phase, "layout");
assert.equal(ir.pageId, "p1");
assert.equal(ir.layoutType, "two_column");
assert.equal(ir.containers[0].role, "module");
assert.equal(ir.constraints[0].type, "spacing");
assert.equal(ir.alignmentGroups[0].edge, "top");
assert.equal(ir.records[0].identity.componentId, "main_evidence");
assert.equal(ir.records[0].box.w, 4.0);
assert.equal(ir.records[0].fitPolicy, "contain");
assert.equal(ir.records[0].resizePolicy, "preserve_aspect");
assert.equal(ir.records[0].resizeLimits.uniformScale.max, 1.3);
assert.equal(ir.records[0].scale.uniform, 1.08);
assert.equal(ir.records[0].visibleBox.w, 3.46);
assert.equal(ir.records[0].unusedSpace.areaRatio, 0.12);
assert.equal(ir.records[0].readability.ok, true);
assert.equal(ir.records[0].dsl.selector, ir.expectedPrimitives[0].dsl.selector);
assert.doesNotThrow(() => JSON.parse(JSON.stringify(ir)), "layout IR must serialize");

console.log("Runtime QA layout IR contract passed.");
