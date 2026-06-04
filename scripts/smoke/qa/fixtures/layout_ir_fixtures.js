"use strict";

const { dslTarget, expectedPrimitive, measuredRecord } = require("./measurement_ir_fixtures");

function validLayoutIr() {
  const target = dslTarget();
  return {
    pageIndex: 0,
    pageId: "p1",
    pageBounds: { x: 0, y: 0, w: 13.333, h: 7.5 },
    bodyBounds: { x: 0.7, y: 1.4, w: 11.9, h: 5.4 },
    layoutType: "two_column",
    containers: [{
      nodeId: "module-0",
      role: "module",
      source: target,
      box: { x: 0.8, y: 1.5, w: 4.2, h: 3.0 },
      bodyBox: { x: 0.93, y: 1.98, w: 3.94, h: 2.38 },
      visibleOccupiedBox: { x: 0.93, y: 1.98, w: 3.94, h: 2.2 },
      fill: { minRatio: 0.75, minVisibleAreaRatio: 0.55, maxBottomSlack: 0.45 },
    }],
    constraints: [
      {
        type: "spacing",
        id: "module-0-stack-gap",
        token: "stack-gap",
        value: 0.12,
        allowedValues: [0.06, 0.08, 0.11, 0.12, 0.14, 0.18, 0.28, 0.38],
        min: 0.06,
        target,
      },
      {
        type: "distribution",
        id: "module-columns",
        axis: "x",
        expectedGap: 0.18,
        actualGaps: [0.18],
        tolerance: 0.03,
        target,
      },
    ],
    alignmentGroups: [{
      id: "module-row-top",
      edge: "top",
      tolerance: 0.03,
      target,
      members: [
        { nodeId: "module-0", box: { x: 0.8, y: 1.5, w: 4.2, h: 3.0 }, source: target.semanticStack[1] },
        { nodeId: "module-1", box: { x: 5.1, y: 1.5, w: 4.2, h: 3.0 }, source: target.semanticStack[1] },
      ],
    }],
    expectedPrimitives: [expectedPrimitive()],
    measuredPrimitives: [measuredRecord()],
    records: [{
      identity: expectedPrimitive().identity,
      dsl: target,
      status: "ok",
      fitPolicy: "contain",
      resizePolicy: "preserve_aspect",
      resizeLimits: {
        preserveAspect: true,
        uniformScale: { min: 0.7, max: 1.3 },
      },
      scale: {
        uniform: 1.08,
        x: 1.08,
        y: 1.08,
        distortion: 0,
      },
      unusedSpace: { xRatio: 0.06, yRatio: 0.08, areaRatio: 0.12 },
      readability: {
        role: "visual_anchor",
        minArea: 3.2,
        minW: 2.2,
        minH: 1.1,
        actualArea: 9.6,
        ok: true,
      },
      overflow: { x: false, y: false },
      box: { x: 0.8, y: 1.5, w: 4.0, h: 2.4 },
      visibleBox: { x: 0.92, y: 1.6, w: 3.46, h: 2.27 },
      measuredBounds: { w: 3.2, h: 2.1 },
      style: {
        fontSize: 14,
        fontFace: "Microsoft YaHei",
        textColor: "333333",
        fillColor: "FFFFFF",
        lineColor: "C00000",
        lineWidth: 0.5,
      },
    }],
  };
}

function issueFor(code, ir) {
  const { runLayoutChecks } = require("../../../pptx/qa/layout_checks");
  return runLayoutChecks(ir).issues.find((issue) => issue.code === code);
}

module.exports = {
  issueFor,
  validLayoutIr,
};
