"use strict";

const assert = require("assert");
const {
  createCompileIr,
  createDslIr,
  createLayoutIr,
  createMeasurementIr,
  createPhaseResult,
  createPrimitiveIdentity,
  createSourceLocation,
  serializeIrForReview,
} = require("../../pptx/qa/ir_contracts");
const { STANDARD_LINE_WIDTH_EMU, STANDARD_LINE_WIDTH_PT, fontSizePtToPptxXml, lineWidthPtToEmu } = require("../../pptx/contracts/huawei_style_contract");

const sourceLocation = createSourceLocation({
  selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)",
  path: "bodyDsl.children[0].children[0]",
  sourceSpan: { start: 10, end: 80, line: 5, column: 7 },
  codeFrame: "<EvidenceFigure id=\"main\" />",
  semanticStack: [{ tag: "EvidenceFigure", id: "main" }],
});
const identity = createPrimitiveIdentity({
  componentId: "main",
  blockType: "visual_anchor",
  kind: "Evidence",
  template: "source_figure",
});

assert.equal(sourceLocation.location_quality, "dsl_mapped");
assert.equal(identity.kind, "Evidence");
assert.equal(fontSizePtToPptxXml(14), 1400);
assert.equal(lineWidthPtToEmu(STANDARD_LINE_WIDTH_PT), STANDARD_LINE_WIDTH_EMU);
assert.equal(STANDARD_LINE_WIDTH_EMU, 6350);

const dslIr = createDslIr({
  pageIndex: 0,
  root: { tag: "Slide" },
  bodyDsl: { tag: "Columns" },
  sourceMap: [sourceLocation],
});
assert.equal(dslIr.irKind, "DslIr");
assert.equal(dslIr.version, 1);
assert(Array.isArray(dslIr.sourceMap));

const compileIr = createCompileIr({
  pageIndex: 0,
  renderModel: { type: "two_column" },
  visiblePrimitives: [{ identity, source: sourceLocation }],
  sourceMap: [sourceLocation],
});
assert.equal(compileIr.irKind, "CompileIr");
assert.equal(compileIr.nodes[0].nodeKind, "Primitive");
assert.equal(compileIr.nodes[0].identity.componentId, "main");

const measurementIr = createMeasurementIr({
  pageIndex: 0,
  expectedPrimitives: compileIr.nodes,
  records: [{ identity, source: sourceLocation, bounds: { w: 3, h: 2 }, status: "ok" }],
});
assert.equal(measurementIr.irKind, "MeasurementIr");
assert.equal(measurementIr.records[0].nodeKind, "MeasurementRecord");

const layoutIr = createLayoutIr({
  pageIndex: 0,
  expectedPrimitives: compileIr.nodes,
  measuredPrimitives: measurementIr.records,
  bodyBounds: { x: 0, y: 0, w: 10, h: 5 },
  records: [{ identity, source: sourceLocation, box: { x: 1, y: 1, w: 3, h: 2 } }],
});
assert.equal(layoutIr.irKind, "LayoutIr");
assert.equal(layoutIr.records[0].nodeKind, "LayoutBox");

const phaseResult = createPhaseResult({
  phase: "measure",
  ir: measurementIr,
  diagnostics: [],
});
assert.equal(phaseResult.status, "passed");
assert.equal(phaseResult.ir.irKind, "MeasurementIr");

const dump = serializeIrForReview(layoutIr);
assert.equal(dump.irKind, "LayoutIr");
assert.doesNotThrow(() => JSON.stringify(dump), "review serialization must be JSON-safe");

console.log("Runtime QA IR contracts passed.");
