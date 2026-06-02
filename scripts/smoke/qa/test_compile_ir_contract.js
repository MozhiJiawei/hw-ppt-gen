"use strict";

const assert = require("assert");
const { compilePageBodyDslToIr } = require("../../pptx/qa/runtime_pipeline");
const { VALID_BODY_DSL, scope } = require("./fixtures/dsl_pages");

const ir = compilePageBodyDslToIr({ pageIndex: 0, pageId: "p1", bodyDsl: VALID_BODY_DSL, dslScope: scope });

assert.equal(ir.ok, true);
assert.equal(ir.phase, "compile");
assert.equal(ir.dslIr.bodyDsl.props.__dsl.selector, "Slide > TwoColumn:nth-child(1)");
assert.equal(ir.compileIr.renderModel.type, "two_column");
const primitive = ir.compileIr.visiblePrimitives.find((item) => item.identity.componentId === "main_evidence");
assert(primitive, "compile IR should expose visible primitive identity");
assert.equal(primitive.identity.kind, "Evidence");
assert.equal(primitive.identity.template, "source_figure");
assert.equal(primitive.dsl.selector, "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)");
assert.equal(primitive.location_quality, "dsl_mapped");
assert.doesNotThrow(() => JSON.parse(JSON.stringify(ir.compileIr)), "compile IR must be serializable");

console.log("Runtime QA compile IR contract passed.");
