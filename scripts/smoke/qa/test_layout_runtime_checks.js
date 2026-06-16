"use strict";

const assert = require("assert");
const { runLayoutChecks } = require("../../pptx/qa/layout_checks");
const { issueFor, validLayoutIr } = require("./fixtures/layout_ir_fixtures");
const { assertIssueCliFeedback } = require("./assert_cli_feedback");

function mutate(mutator) {
  const ir = validLayoutIr();
  mutator(ir);
  return ir;
}

function has(code, ir) {
  return runLayoutChecks(ir).issues.some((issue) => issue.code === code);
}

function assertDslMapped(issue) {
  assert.ok(issue, "expected issue");
  assertIssueCliFeedback(issue);
  assert.equal(issue.location_quality, "dsl_mapped");
  assert.ok(issue.target.selector, "expected DSL selector");
  assert.ok(issue.target.sourceSpan, "expected DSL source span");
  assert.ok(issue.target.codeFrame, "expected DSL code frame");
  assert.ok(issue.target.semanticStack, "expected DSL semantic stack");
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

assertDslMapped(issueFor("layout_spacing_token_invalid", mutate((ir) => {
  ir.constraints[0].value = 0.031;
})));
assertDslMapped(issueFor("layout_alignment_group_failed", mutate((ir) => {
  ir.alignmentGroups[0].members[1].box.y = 1.61;
})));
assertDslMapped(issueFor("layout_distribution_failed", mutate((ir) => {
  ir.constraints[1].actualGaps = [0.31];
})));
assertDslMapped(issueFor("layout_visual_slot_readability_failed", mutate((ir) => {
  ir.records[0].readability.ok = false;
  ir.records[0].readability.actualArea = 2.2;
})));
assertDslMapped(issueFor("layout_visual_slot_readability_failed", mutate((ir) => {
  ir.records[0].box = { x: 0.8, y: 1.5, w: 4.0, h: 2.4 };
  ir.records[0].visibleBox = { x: 0.92, y: 1.6, w: 3.46, h: 0.92 };
  ir.records[0].readability = {
    role: "visual_anchor",
    minArea: 3.2,
    minW: 2.2,
    minH: 1.1,
    ok: true,
  };
})));
assertDslMapped(issueFor("layout_box_overflow", mutate((ir) => {
  ir.records[0].overflow = { x: false, y: true, amountY: 0.22 };
})));
assertDslMapped(issueFor("layout_evidence_stretched", mutate((ir) => {
  ir.records[0].fitPolicy = "stretch";
})));
assertDslMapped(issueFor("layout_visual_scale_out_of_range", mutate((ir) => {
  ir.records[0].scale.uniform = 1.42;
})));
assertDslMapped(issueFor("layout_visual_axis_distortion", mutate((ir) => {
  ir.records[0].resizeLimits = { preserveAspect: false, axisScale: { min: 0.8, max: 1.2 } };
  ir.records[0].scale = { x: 1.24, y: 0.96, distortion: 1.292 };
})));
assertDslMapped(issueFor("layout_visual_slot_underfilled", mutate((ir) => {
  ir.records[0].unusedSpace = { xRatio: 0.05, yRatio: 0.34, areaRatio: 0.36 };
})));
assertDslMapped(issueFor("layout_forced_scale_present", mutate((ir) => {
  ir.diagnostics = [{
    code: "layout_stack_forced_scale",
    severity: "error",
    target: ir.records[0].dsl,
    overflow_h: 0.44,
    scale: 0.88,
  }];
})));
assertDslMapped(issueFor("layout_internal_gap_excessive", mutate((ir) => {
  ir.diagnostics = [{
    code: "layout_stack_gap_expand",
    severity: "info",
    target: ir.records[0].dsl,
    gap: 0.92,
    slack_h: 1.34,
  }];
})));
assertDslMapped(issueFor("layout_module_fill_low", mutate((ir) => {
  ir.containers[0].visibleOccupiedBox = { x: 0.93, y: 1.98, w: 3.94, h: 1.1 };
})));
assertDslMapped(issueFor("layout_content_density_low", mutate((ir) => {
  ir.containers[0].visibleOccupiedBox = { x: 1.9, y: 2.1, w: 1.4, h: 1.0 };
})));
assertDslMapped(issueFor("layout_block_gap_excessive", mutate((ir) => {
  ir.records[0].box = { x: 0.93, y: 1.98, w: 3.94, h: 0.78 };
  ir.records[0].visibleBox = { x: 0.93, y: 1.98, w: 3.94, h: 0.78 };
  ir.records.push({
    nodeId: "module-0:block-1:text",
    identity: { componentId: "gap_text", blockType: "text", kind: "Text", template: "body_text" },
    dsl: {
      ...ir.records[0].dsl,
      selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(1)",
    },
    status: "ok",
    box: { x: 0.93, y: 3.72, w: 3.94, h: 0.34 },
    visibleBox: { x: 0.93, y: 3.72, w: 3.94, h: 0.34 },
    measuredBounds: { w: 3.2, h: 0.28 },
    style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
  });
})));
assertDslMapped(issueFor("layout_block_gap_excessive", mutate((ir) => {
  ir.containers[0].bodyBox = { x: 0.68, y: 2.77, w: 3.697, h: 3.86 };
  ir.records[0].box = { x: 0.68, y: 2.77, w: 3.697, h: 1.95 };
  ir.records[0].visibleBox = { x: 0.68, y: 2.77, w: 3.697, h: 1.95 };
  ir.records.push({
    nodeId: "module-0:block-1:text",
    identity: { componentId: "gap_text", blockType: "text", kind: "Text", template: "body_text" },
    dsl: {
      ...ir.records[0].dsl,
      selector: "Slide > ThreeColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(2)",
    },
    status: "ok",
    box: { x: 0.68, y: 5.33, w: 3.697, h: 1.3 },
    visibleBox: { x: 0.68, y: 5.33, w: 3.697, h: 1.3 },
    measuredBounds: { w: 3.697, h: 1.3 },
    style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
  });
})));
{
  const issue = issueFor("layout_block_gap_excessive", mutate((ir) => {
    ir.records[0].box = { x: 0.93, y: 1.98, w: 3.94, h: 0.78 };
    ir.records[0].visibleBox = { x: 0.93, y: 1.98, w: 3.94, h: 0.78 };
    ir.records.push({
      nodeId: "module-0:block-1:text",
      identity: { componentId: "gap_text", blockType: "text", kind: "Text", template: "body_text" },
      dsl: {
        ...ir.records[0].dsl,
        selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(1)",
      },
      status: "ok",
      box: { x: 0.93, y: 3.72, w: 3.94, h: 0.34 },
      visibleBox: { x: 0.93, y: 3.72, w: 3.94, h: 0.34 },
      measuredBounds: { w: 3.2, h: 0.28 },
      style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
    });
  }));
  assert.ok(issue.message.includes("Preserve the module's current proof tier"), "block gap repair should preserve proof tier");
  assert.ok(issue.message.includes("keep that original evidence"), "block gap repair should preserve source evidence identity");
  assert.ok(issue.message.includes("source-grounded visual or text content"), "block gap repair should suggest adding grounded visual/text content");
  assert.ok(!/replace.*Evidence|Sequence\/process|KPI|table/i.test(issue.message), "block gap repair should not imply replacing evidence with filler components");
  assert.ok(!/split|change layout|拆页|换布局/i.test(issue.message), "block gap repair should not suggest split page or layout changes");
}
{
  const issue = issueFor("layout_visual_slot_underfilled", mutate((ir) => {
    ir.records[0].unusedSpace = { xRatio: 0.05, yRatio: 0.34, areaRatio: 0.36 };
  }));
  assert.ok(issue.message.includes("Preserve the current proof tier"), "slot underfill repair should preserve proof tier");
  assert.ok(issue.message.includes("keep the original evidence"), "slot underfill repair should keep source evidence");
  assert.ok(issue.message.includes("source-grounded visual or text content"), "slot underfill repair should allow content fill without downgrading proof");
}
{
  const issue = issueFor("layout_text_column_budget_exceeded", mutate((ir) => {
    const textDsl = {
      ...ir.records[0].dsl,
      selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(1)",
    };
    ir.records.push({
      identity: { componentId: "dense_text_a", blockType: "text", kind: "Text", template: "body_text" },
      dsl: textDsl,
      status: "ok",
      box: { x: 1.0, y: 2.02, w: 3.6, h: 1.12 },
      measuredBounds: { w: 3.2, h: 1.06 },
      style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
    });
    ir.records.push({
      identity: { componentId: "dense_text_b", blockType: "text", kind: "Text", template: "body_text" },
      dsl: textDsl,
      status: "ok",
      box: { x: 1.0, y: 3.18, w: 3.6, h: 1.02 },
      measuredBounds: { w: 3.2, h: 0.96 },
      style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
    });
  }));
  assert.ok(issue.message.includes("preserve it"), "text budget repair should preserve source evidence when present");
  assert.ok(issue.message.includes("secondary explanation"), "text budget repair should keep generated diagrams secondary");
}
assertDslMapped(issueFor("layout_text_column_budget_exceeded", mutate((ir) => {
  const textDsl = {
    ...ir.records[0].dsl,
    selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(1)",
  };
  ir.records.push({
    identity: { componentId: "dense_text_a", blockType: "text", kind: "Text", template: "body_text" },
    dsl: textDsl,
    status: "ok",
    box: { x: 1.0, y: 2.02, w: 3.6, h: 1.12 },
    measuredBounds: { w: 3.2, h: 1.06 },
    style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
  });
  ir.records.push({
    identity: { componentId: "dense_text_b", blockType: "text", kind: "Text", template: "body_text" },
    dsl: textDsl,
    status: "ok",
    box: { x: 1.0, y: 3.18, w: 3.6, h: 1.02 },
    measuredBounds: { w: 3.2, h: 0.96 },
    style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
  });
})));
assertDslMapped(issueFor("layout_text_column_budget_exceeded", mutate((ir) => {
  const textDsl = {
    ...ir.records[0].dsl,
    selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(1)",
  };
  ir.records.push({
    identity: { componentId: "spaced_text_a", blockType: "text", kind: "Text", template: "body_text" },
    dsl: textDsl,
    status: "ok",
    box: { x: 1.0, y: 2.02, w: 3.6, h: 0.42 },
    measuredBounds: { w: 3.2, h: 0.36 },
    style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
  });
  ir.records.push({
    identity: { componentId: "spaced_text_b", blockType: "text", kind: "Text", template: "body_text" },
    dsl: textDsl,
    status: "ok",
    box: { x: 1.0, y: 3.9, w: 3.6, h: 0.22 },
    measuredBounds: { w: 3.2, h: 0.18 },
    style: { fontSize: 14, fontFace: "Microsoft YaHei", textColor: "333333" },
  });
})));

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
