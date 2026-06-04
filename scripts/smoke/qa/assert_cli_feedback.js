"use strict";

const assert = require("assert");
const { feedbackToCliText } = require("../../pptx/feedback/feedback_reporter");

function assertIssueCliFeedback(issue, options = {}) {
  assert.ok(issue, "expected runtime QA issue");
  const text = feedbackToCliText([issue], { title: options.title || "Runtime QA failed" });
  assert(text.includes(`${issue.phase}:${issue.code}`), text);
  assert(text.includes(issue.message), text);
  const target = issue.target || {};
  if (target.selector) assert(text.includes(`Selector: ${target.selector}`), text);
  if (target.sourceSpan) assert(text.includes(`Source: line ${target.sourceSpan.line}, column ${target.sourceSpan.column}`), text);
  if (target.codeFrame) assert(text.includes(`Code: ${target.codeFrame}`), text);
  if (target.componentId) assert(text.includes(`Component: ${target.componentId}`), text);
  if (target.pageIndex !== undefined && target.pageIndex !== null) {
    assert(text.includes(`Page: ${Number(target.pageIndex) + 1}`), text);
  }
  if (target.slide !== undefined && target.slide !== null) assert(text.includes(`Slide: ${target.slide}`), text);
  if (target.artifact) assert(text.includes(`Artifact: ${target.artifact}`), text);
  for (const expected of options.includes || []) assert(text.includes(expected), text);
  assert(!/^\s+at\s+\S+/m.test(text), text);
  return text;
}

module.exports = {
  assertIssueCliFeedback,
};
