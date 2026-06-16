"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createFeedbackCliError, feedbackToCliText } = require("../../pptx/feedback/feedback_reporter");
const { createHuaweiDeck } = require("../../pptx/hw_pptx_helpers");
const { addVisualAnchorContentSlide, collectBodyPipelinePages } = require("../../pptx/hw_visual_anchor_slide");
const { parseSlideBodyDsl } = require("../../pptx/dsl/jsx_dsl");
const { runMeasurementChecks } = require("../../pptx/qa/measurement_checks");
const { expectedPrimitive, measuredRecord, validMeasurementIr } = require("./fixtures/measurement_ir_fixtures");
const { assertIssueCliFeedback } = require("./assert_cli_feedback");

function has(code, ir) {
  return runMeasurementChecks(ir).issues.some((issue) => issue.code === code);
}

function issueFor(code, ir) {
  const issue = runMeasurementChecks(ir).issues.find((item) => item.code === code);
  assertIssueCliFeedback(issue);
  return issue;
}

assert.equal(runMeasurementChecks(validMeasurementIr()).issues.length, 0);
issueFor("measure_component_unmeasured", { expectedPrimitives: [expectedPrimitive()], records: [] });
issueFor("measure_component_unmeasurable", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { measureSupport: "UNSUPPORTED" })] });
issueFor("measure_component_mismatch", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { identity: { componentId: "main_evidence", blockType: "visual_anchor", kind: "Matrix", template: "table" } })] });
issueFor("measure_component_mismatch", {
  expectedPrimitives: [expectedPrimitive()],
  records: [measuredRecord("wrong_id", { dsl: expectedPrimitive().dsl })],
});
issueFor("measure_powerpoint_failed", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { status: "failed", measurement: { ok: false, error: "COM failed" } })] });
issueFor("measure_bounds_invalid", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { bounds: { w: 0, h: 2 } })] });
issueFor("measure_resize_contract_missing", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { resizePolicy: undefined, resizeLimits: undefined })] });
issueFor("measure_resize_range_invalid", { expectedPrimitives: [expectedPrimitive()], records: [measuredRecord("main_evidence", { resizeLimits: { preserveAspect: true, uniformScale: { min: 0.5, max: 1.3 } } })] });

const failed = runMeasurementChecks({
  expectedPrimitives: [expectedPrimitive()],
  records: [measuredRecord("main_evidence", { status: "failed", measurement: { ok: false, error: "COM failed" } })],
}).issues.find((issue) => issue.code === "measure_powerpoint_failed");
assert.equal(failed.location_quality, "dsl_mapped");
assert.equal(failed.target.selector, "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)");
assert.equal(failed.target.sourceSpan.line, 5);
assert(failed.target.semanticStack.some((frame) => frame.tag === "EvidenceFigure"));

const resizeIssue = runMeasurementChecks({
  expectedPrimitives: [expectedPrimitive()],
  records: [measuredRecord("main_evidence", { resizeLimits: { preserveAspect: true, uniformScale: { min: 0.5, max: 1.3 } } })],
}).issues.find((issue) => issue.code === "measure_resize_range_invalid");
assert.equal(resizeIssue.location_quality, "dsl_mapped");
assert.equal(resizeIssue.target.selector, "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)");

const anonymousTextA = {
  nodeId: "module-0:block-0:text",
  identity: { blockType: "text", kind: "Text", template: "body_text" },
  dsl: { selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(1)", path: "bodyDsl.children[0].children[0]" },
};
const anonymousTextB = {
  nodeId: "module-0:block-1:text",
  identity: { blockType: "text", kind: "Text", template: "body_text" },
  dsl: { selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > InsightText:nth-child(2)", path: "bodyDsl.children[0].children[1]" },
};
issueFor("measure_component_unmeasured", {
  expectedPrimitives: [anonymousTextA, anonymousTextB],
  records: [{ ...anonymousTextA, bounds: { w: 2, h: 1 }, measurement: { ok: true, text_bounds: { w: 2, h: 1 } } }],
});

{
  const issues = runMeasurementChecks({
    expectedPrimitives: [expectedPrimitive()],
    records: [measuredRecord("main_evidence", { resizePolicy: undefined, resizeLimits: undefined })],
  }).issues;
  const error = createFeedbackCliError(feedbackToCliText(issues, { title: "Runtime measure QA failed for page 1" }), { feedbackIssues: issues });
  assert(error.message.includes("measure:measure_resize_contract_missing"), error.message);
  assert(error.message.includes("Selector: Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)"), error.message);
  assert(error.message.includes("Source: line 5, column 7"), error.message);
  assert(error.message.includes("Code: <EvidenceFigure"), error.message);
}

{
  const outDir = path.resolve(__dirname, "..", "..", "..", ".tmp", "measurement_runtime_checks");
  fs.mkdirSync(outDir, { recursive: true });
  const sourcePath = path.join(outDir, "source.svg");
  fs.writeFileSync(sourcePath, `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420">
  <rect width="800" height="420" fill="#fff"/>
  <rect x="24" y="24" width="752" height="372" fill="#f7f7f7" stroke="#C00000" stroke-width="6"/>
  <text x="400" y="220" text-anchor="middle" font-size="42" font-family="Arial">source evidence</text>
</svg>`, "utf8");
  const source = { path: sourcePath, caption: "source" };
  const bodyDsl = parseSlideBodyDsl(`
<Slide>
  <TwoColumn>
    <Module title="主证据">
      <EvidenceFigure id="main_evidence" title="来源图" claim="来源图支撑判断。" source={source} priority="primary" />
      <InsightText body={["判断：真实生成路径必须保留完整 MeasurementIR。"]} />
    </Module>
    <Module title="补充证据">
      <EvidenceFigure id="secondary_evidence" title="补充来源图" claim="补充来源图支撑判断。" source={source} priority="secondary" />
      <InsightText body={["判断：测量产物要供 layout 正向消费。"]} />
    </Module>
  </TwoColumn>
</Slide>`, { source }).bodyDsl;
  const pptx = createHuaweiDeck({ title: "Measurement IR smoke" });
  addVisualAnchorContentSlide(pptx, {
    page: "01",
    title: "Measurement IR",
    sections: ["QA"],
    currentSection: "QA",
    summary: { body: [{ label: "检查", text: "MeasurementIR must be produced before layout." }] },
    bodyDsl,
  });
  const page = collectBodyPipelinePages(pptx)[0];
  assert(page, "content slide should record a pipeline page");
  assert(page.measurementIr, "content slide should record MeasurementIR");
  assert(page.measurementIr.records.length >= page.compileIr.visiblePrimitives.length, "MeasurementIR should cover compiled primitives");
  for (const record of page.measurementIr.records) {
    assert(record.minSize && record.preferredSize && record.maxUsefulSize, `missing size contract for ${record.identity?.componentId || record.nodeId}`);
    assert(record.resizePolicy, `missing resizePolicy for ${record.identity?.componentId || record.nodeId}`);
    assert(record.resizeLimits, `missing resizeLimits for ${record.identity?.componentId || record.nodeId}`);
    assert(record.constraintBox, `MeasurementIR should record the measurement constraint box for ${record.identity?.componentId || record.nodeId}`);
    assert(!record.box, `MeasurementIR must not contain final layout box for ${record.identity?.componentId || record.nodeId}`);
    assert(!record.visibleBox, `MeasurementIR must not contain final visible layout box for ${record.identity?.componentId || record.nodeId}`);
  }
  assert(page.layoutIr, "content slide should record LayoutIR");
  assert.equal(page.layoutIr.measuredPrimitives.length, page.measurementIr.records.length, "LayoutIR should consume MeasurementIR records");
  assert(page.layoutIr.records.every((record) => record.box), "LayoutIR records should own final layout boxes");
  assert(page.measurementIr.records.some((record) => record.addedByLayout), "layout should be able to append on-demand MeasurementIR records for final constraint boxes");
  assert(page.layoutIr.records.every((record) => record.measurementRef), "LayoutIR records should reference consumed MeasurementIR records");
  assert(page.layoutIr.records.some((record) => record.measurementRef?.addedByLayout), "LayoutIR should be able to consume layout-added measurement facts");
  assert.equal(runMeasurementChecks(page.measurementIr).issues.length, 0);
}

console.log("Runtime QA measurement checks passed.");
