"use strict";

const assert = require("assert");
const { runLayoutChecks } = require("../../pptx/qa/layout_checks");
const { validLayoutIr } = require("./fixtures/layout_ir_fixtures");

function mutate(mutator) {
  const ir = validLayoutIr();
  mutator(ir);
  return ir;
}

function has(code, ir) {
  return runLayoutChecks(ir).issues.some((issue) => issue.code === code);
}

assert.equal(runLayoutChecks(validLayoutIr()).issues.length, 0);
assert(has("layout_page_infeasible", mutate((ir) => { ir.status = "infeasible"; })));
assert(has("layout_component_unplaced", mutate((ir) => { ir.records = []; })));
assert(has("layout_box_invalid", mutate((ir) => { ir.records[0].box.w = 0; })));
assert(has("layout_component_out_of_bounds", mutate((ir) => { ir.records[0].box.x = 99; })));
assert(has("layout_text_does_not_fit", mutate((ir) => { ir.records[0].identity.blockType = "text"; ir.records[0].measuredBounds = { w: 3, h: 3 }; ir.records[0].box = { x: 1, y: 2, w: 2, h: 1 }; })));
assert(has("layout_text_font_size_invalid", mutate((ir) => { ir.records[0].identity.blockType = "text"; ir.records[0].style.fontSize = 9; })));
assert(has("layout_text_font_face_invalid", mutate((ir) => { ir.records[0].identity.blockType = "text"; ir.records[0].style.fontFace = "Arial"; })));
assert(has("layout_text_color_invalid", mutate((ir) => { ir.records[0].identity.blockType = "text"; ir.records[0].style.textColor = "12345678"; })));
assert(has("layout_shape_color_invalid", mutate((ir) => { ir.records[0].style.fillColor = "00FF00"; })));
assert(has("layout_line_width_invalid", mutate((ir) => { ir.records[0].style.lineWidth = 2; })));

const anonymousExpected = [
  {
    nodeId: "module-0:block-0:text",
    identity: { blockType: "text", kind: "Text", template: "body_text" },
    dsl: { selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(1)" },
  },
  {
    nodeId: "module-0:block-1:text",
    identity: { blockType: "text", kind: "Text", template: "body_text" },
    dsl: { selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(2)" },
  },
];
assert(has("layout_component_unplaced", {
  bodyBounds: { x: 0, y: 0, w: 10, h: 5 },
  measuredPrimitives: anonymousExpected,
  records: [{ ...anonymousExpected[0], box: { x: 1, y: 1, w: 2, h: 1 } }],
}));

console.log("Runtime QA layout checks passed.");
