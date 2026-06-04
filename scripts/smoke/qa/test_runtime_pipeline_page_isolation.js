"use strict";

const assert = require("assert");
const { runRuntimeQaPipeline } = require("../../pptx/qa/runtime_pipeline");
const { BAD_BODY_DSL, VALID_BODY_DSL, scope } = require("./fixtures/dsl_pages");

const report = runRuntimeQaPipeline({
  pages: [
    { pageId: "p1", bodyDsl: VALID_BODY_DSL, dslScope: scope },
    { pageId: "p2", bodyDsl: BAD_BODY_DSL, dslScope: scope },
    { pageId: "p3", bodyDsl: VALID_BODY_DSL, dslScope: scope },
  ],
  measurePage: okMeasurement,
  layoutPage: ({ compileIr, measurementIr }) => ({
    expectedPrimitives: compileIr.visiblePrimitives,
    measuredPrimitives: measurementIr.records,
    bodyBounds: { x: 0, y: 0, w: 10, h: 5 },
    records: measurementIr.records.map((record) => ({
      identity: record.identity,
      dsl: record.dsl,
      box: { x: 1, y: 1, w: 3, h: 2 },
      measuredBounds: record.bounds,
      style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333", fillColor: "FFFFFF", lineColor: "C00000", lineWidth: 0.5 },
    })),
  }),
});

assert.equal(report.pages.length, 3);
assert.equal(report.pages[0].phases.compile.status, "passed");
assert.equal(report.pages[0].ir.measurement.pageId, "p1");
assert.equal(report.pages[0].ir.layout.pageId, "p1");
assert.equal(report.pages[1].phases.dsl_input.status, "failed");
assert.equal(report.pages[1].phases.measure.status, "skipped_due_to_page_dependency");
assert.equal(report.pages[2].phases.layout.status, "passed");
assert.equal(report.pages[2].ir.measurement.pageId, "p3");
assert.equal(report.pages[2].ir.layout.pageId, "p3");
assert.equal(report.summary.totalPages, 3);
assert(report.summary.issueCountsByPhase.dsl_input >= 1);

const missingProducer = runRuntimeQaPipeline({
  pages: [
    { pageId: "needs-real-measurement", bodyDsl: VALID_BODY_DSL, dslScope: scope },
  ],
});
assert.equal(missingProducer.pages[0].phases.measure.status, "failed");
assert(missingProducer.pages[0].phases.measure.issues.some((issue) => issue.code === "measure_producer_missing"));
assert.equal(missingProducer.pages[0].phases.layout.status, "skipped_due_to_page_dependency");

const missingLayoutProducer = runRuntimeQaPipeline({
  pages: [
    { pageId: "needs-real-layout", bodyDsl: VALID_BODY_DSL, dslScope: scope },
  ],
  measurePage: okMeasurement,
});
assert.equal(missingLayoutProducer.pages[0].phases.layout.status, "failed");
assert(missingLayoutProducer.pages[0].phases.layout.issues.some((issue) => issue.code === "layout_producer_missing"));

const emptyMeasurement = runRuntimeQaPipeline({
  pages: [
    { pageId: "empty-measurement", bodyDsl: VALID_BODY_DSL, dslScope: scope },
  ],
  measurePage: () => ({}),
});
assert.equal(emptyMeasurement.pages[0].phases.measure.status, "failed");
assert(emptyMeasurement.pages[0].phases.measure.issues.some((issue) => issue.code === "measure_component_unmeasured"));
assert.equal(emptyMeasurement.pages[0].ir.measurement.expectedPrimitives.length, emptyMeasurement.pages[0].ir.compile.visiblePrimitives.length);

const emptyLayout = runRuntimeQaPipeline({
  pages: [
    { pageId: "empty-layout", bodyDsl: VALID_BODY_DSL, dslScope: scope },
  ],
  measurePage: okMeasurement,
  layoutPage: () => ({}),
});
assert.equal(emptyLayout.pages[0].phases.layout.status, "failed");
assert(emptyLayout.pages[0].phases.layout.issues.some((issue) => issue.code === "layout_component_unplaced"));
assert.equal(emptyLayout.pages[0].ir.layout.measuredPrimitives.length, emptyLayout.pages[0].ir.measurement.records.length);

const measureException = runRuntimeQaPipeline({
  pages: [
    { pageId: "measure-throws", bodyDsl: VALID_BODY_DSL, dslScope: scope },
  ],
  measurePage: () => {
    throw new Error("measurement hook exploded");
  },
});
assert.equal(measureException.pages[0].phases.measure.status, "failed");
assert(measureException.pages[0].phases.measure.issues.some((issue) => issue.code === "measure_runtime_exception"));
assert.equal(measureException.pages[0].phases.layout.status, "skipped_due_to_page_dependency");

const layoutException = runRuntimeQaPipeline({
  pages: [
    { pageId: "layout-throws", bodyDsl: VALID_BODY_DSL, dslScope: scope },
  ],
  measurePage: okMeasurement,
  layoutPage: () => {
    throw new Error("layout hook exploded");
  },
});
assert.equal(layoutException.pages[0].phases.layout.status, "failed");
assert(layoutException.pages[0].phases.layout.issues.some((issue) => issue.code === "layout_runtime_exception"));

console.log("Runtime QA page isolation passed.");

function okMeasurement({ compileIr }) {
  return {
    expectedPrimitives: compileIr.visiblePrimitives,
    records: compileIr.visiblePrimitives.map((primitive) => ({
      identity: primitive.identity,
      dsl: primitive.dsl,
      status: "ok",
      measureSupport: "measured",
      minSize: { w: 2.1, h: 1.4 },
      preferredSize: { w: 3, h: 2 },
      maxUsefulSize: { w: 3.9, h: 2.6 },
      resizePolicy: primitive.identity.blockType === "text" ? "shrink_text" : "preserve_aspect",
      resizeLimits: primitive.identity.blockType === "text"
        ? { preserveAspect: false, textScale: { min: 1, max: 1 } }
        : { preserveAspect: true, uniformScale: { min: 0.7, max: 1.3 } },
      bounds: { w: 3, h: 2 },
      measurement: { ok: true, shape_bounds: { w: 3, h: 2 } },
    })),
  };
}
