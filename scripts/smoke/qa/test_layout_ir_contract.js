"use strict";

const assert = require("assert");
const { normalizeLayoutIr } = require("../../pptx/qa/layout_checks");
const { validLayoutIr } = require("./fixtures/layout_ir_fixtures");

const ir = normalizeLayoutIr(validLayoutIr());

assert.equal(ir.phase, "layout");
assert.equal(ir.pageId, "p1");
assert.equal(ir.records[0].identity.componentId, "main_evidence");
assert.equal(ir.records[0].box.w, 4.0);
assert.equal(ir.records[0].dsl.selector, ir.expectedPrimitives[0].dsl.selector);
assert.doesNotThrow(() => JSON.parse(JSON.stringify(ir)), "layout IR must serialize");

console.log("Runtime QA layout IR contract passed.");
