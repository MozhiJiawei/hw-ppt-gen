"use strict";

const assert = require("assert");
const { createFeedbackIssue } = require("../../pptx/feedback/feedback_issue");
const { feedbackToMarkdown, normalizeFeedbackIssues } = require("../../pptx/feedback/feedback_reporter");

const issues = normalizeFeedbackIssues([
  createFeedbackIssue({
    code: "dsl_source_trace_missing",
    phase: "dsl_input",
    severity: "error",
    location_quality: "dsl_mapped",
    target: {
      pageIndex: 0,
      schemaPath: "slides[0].bodyDsl.children[0]",
      nodeId: "main_evidence:visual_anchor",
      kind: "Evidence",
      template: "source_figure",
      visual_role: "visual_anchor",
      selector: "Slide > TwoColumn:nth-child(1) > Module:nth-child(1) > EvidenceFigure:nth-child(1)",
      semanticStack: [{
        tag: "EvidenceFigure",
        id: "main_evidence",
        sourceSpan: { line: 5, column: 7, start: 10, end: 80 },
        codeFrame: "<EvidenceFigure id=\"main_evidence\" />",
      }],
    },
    details: { missing: ["source"] },
    repairs: ["Add source evidence to the Evidence component."],
  }),
  createFeedbackIssue({
    code: "dsl_page_missing_body",
    phase: "dsl_input",
    severity: "error",
    location_quality: "page_only",
    target: { pageIndex: 1 },
  }),
  createFeedbackIssue({
    code: "render_evidence_missing",
    phase: "render_export",
    severity: "error",
    location_quality: "artifact_only",
    target: { artifact: "png_export" },
  }),
]);

assert.equal(issues[0].phase, "dsl_input");
assert.equal(issues[0].location_quality, "dsl_mapped");
assert.equal(issues[0].target.pageIndex, 0);
assert.equal(issues[0].target.schemaPath, "slides[0].bodyDsl.children[0]");
assert.equal(issues[0].target.nodeId, "main_evidence:visual_anchor");
assert.equal(issues[0].target.kind, "Evidence");
assert.equal(issues[0].target.template, "source_figure");
assert.equal(issues[0].target.visual_role, "visual_anchor");
assert.equal(issues[0].target.semanticStack[0].sourceSpan.line, 5);
assert(issues[0].target.semanticStack[0].codeFrame.includes("EvidenceFigure"));
assert.equal(issues[1].location_quality, "page_only");
assert.equal(issues[2].location_quality, "artifact_only");

const markdown = feedbackToMarkdown(issues);
assert(markdown.includes("Location: dsl_mapped"));
assert(markdown.includes("Page: 1"));
assert(markdown.includes("Artifact: png_export"));
assert(markdown.includes("Schema: slides[0].bodyDsl.children[0]"));
assert(markdown.includes("Node: main_evidence:visual_anchor"));
assert(markdown.includes("line 5, column 7"));

console.log("Runtime QA report contract passed.");
