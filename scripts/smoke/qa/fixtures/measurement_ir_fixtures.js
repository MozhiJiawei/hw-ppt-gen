"use strict";

function dslTarget(id = "main_evidence") {
  return {
    tag: "EvidenceFigure",
    role: "visual_anchor",
    path: "bodyDsl.children[0].children[0]",
    selector: `Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)`,
    sourceSpan: { start: 54, end: 155, line: 5, column: 7 },
    codeFrame: `<EvidenceFigure id="${id}" title="来源图" claim="来源图支撑判断。" source={source} priority="primary" />`,
    semanticStack: [
      { tag: "Columns", selector: "Slide > TwoColumn:nth-child(1)" },
      { tag: "Module", title: "主证据", selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1)" },
      { tag: "EvidenceFigure", id, selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)" },
    ],
    id,
  };
}

function expectedPrimitive(id = "main_evidence") {
  return {
    identity: {
      componentId: id,
      blockType: "visual_anchor",
      kind: "Evidence",
      template: "source_figure",
    },
    dsl: dslTarget(id),
  };
}

function measuredRecord(id = "main_evidence", overrides = {}) {
  return {
    identity: {
      componentId: id,
      blockType: "visual_anchor",
      kind: "Evidence",
      template: "source_figure",
    },
    dsl: dslTarget(id),
    status: "ok",
    measureSupport: "measured",
    bounds: { w: 3.2, h: 2.1 },
    measurement: { ok: true, shape_bounds: { w: 3.2, h: 2.1 } },
    ...overrides,
  };
}

function validMeasurementIr() {
  return {
    pageIndex: 0,
    pageId: "p1",
    expectedPrimitives: [expectedPrimitive()],
    records: [measuredRecord()],
  };
}

module.exports = {
  dslTarget,
  expectedPrimitive,
  measuredRecord,
  validMeasurementIr,
};
