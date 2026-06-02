"use strict";

const { dslTarget, expectedPrimitive, measuredRecord } = require("./measurement_ir_fixtures");

function validLayoutIr() {
  return {
    pageIndex: 0,
    pageId: "p1",
    pageBounds: { x: 0, y: 0, w: 13.333, h: 7.5 },
    bodyBounds: { x: 0.7, y: 1.4, w: 11.9, h: 5.4 },
    expectedPrimitives: [expectedPrimitive()],
    measuredPrimitives: [measuredRecord()],
    records: [{
      identity: expectedPrimitive().identity,
      dsl: dslTarget(),
      status: "ok",
      box: { x: 0.8, y: 1.5, w: 4.0, h: 2.4 },
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

module.exports = {
  validLayoutIr,
};
