"use strict";

const { createFeedbackIssue } = require("./feedback_issue");

function normalizeFeedbackIssues(items = []) {
  return items.map((item) => {
    if (item?.feedback) return createFeedbackIssue(item.feedback);
    return createFeedbackIssue(item);
  });
}

function feedbackToJson(items = []) {
  return JSON.stringify(normalizeFeedbackIssues(items), null, 2);
}

function feedbackToMarkdown(items = []) {
  const issues = normalizeFeedbackIssues(items);
  if (!issues.length) return "No feedback issues.";

  const grouped = new Map();
  for (const issue of issues) {
    const key = targetLabel(issue.target);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(issue);
  }

  const lines = ["# Feedback Issues", ""];
  for (const [target, targetIssues] of grouped.entries()) {
    lines.push(`## ${target}`, "");
    for (const issue of sortBySeverity(targetIssues)) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
      if (issue.repairs.length) {
        lines.push(`  Repairs: ${issue.repairs.join(" / ")}`);
      }
      lines.push(`  Phase: ${issue.phase}`);
      lines.push(`  Location: ${issue.location_quality}`);
      const targetDetails = targetDetailLines(issue.target);
      for (const line of targetDetails) lines.push(`  ${line}`);
      const stackLines = semanticStackLines(issue.target?.semanticStack);
      for (const line of stackLines) lines.push(`  ${line}`);
      const detailLines = summarizeDetails(issue.details);
      for (const line of detailLines) lines.push(`  ${line}`);
      const box = issue.details?.box || issue.details?.layout_budget || issue.details?.diagnostic?.box;
      if (box) {
        lines.push(`  Box: ${JSON.stringify(box)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function feedbackToCliText(items = [], options = {}) {
  const issues = sortBySeverity(normalizeFeedbackIssues(items));
  if (!issues.length) return "No feedback issues.";
  const limit = Number(options.limit || 6);
  const shown = issues.slice(0, limit);
  const lines = [options.title || "Runtime QA failed", ""];
  shown.forEach((issue, index) => {
    lines.push(`${index + 1}. [${issue.severity}] ${issue.phase}:${issue.code}`);
    lines.push(`   ${issue.message}`);
    const target = issue.target || {};
    if (target.selector) lines.push(`   Selector: ${target.selector}`);
    if (target.sourceSpan) lines.push(`   Source: line ${target.sourceSpan.line}, column ${target.sourceSpan.column}`);
    if (target.codeFrame) lines.push(`   Code: ${target.codeFrame}`);
    if (target.componentId) lines.push(`   Component: ${target.componentId}`);
    if (target.pageIndex !== undefined && target.pageIndex !== null) lines.push(`   Page: ${Number(target.pageIndex) + 1}`);
    if (target.slide !== undefined && target.slide !== null) lines.push(`   Slide: ${target.slide}`);
    if (target.artifact) lines.push(`   Artifact: ${target.artifact}`);
    if (issue.repairs?.length) lines.push(`   Repair: ${issue.repairs.join(" / ")}`);
    const usefulDetails = cliDetailLines(issue.details);
    usefulDetails.forEach((line) => lines.push(`   ${line}`));
    lines.push("");
  });
  if (issues.length > shown.length) {
    lines.push(`... ${issues.length - shown.length} more issue(s) omitted. Fix the shown issues, then rerun.`);
  }
  return lines.join("\n").trimEnd();
}

function createFeedbackCliError(message, metadata = {}) {
  const error = new Error(message);
  error.name = "FeedbackError";
  error.stack = `${error.name}: ${message}`;
  for (const [key, value] of Object.entries(metadata)) {
    Object.defineProperty(error, key, {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    });
  }
  return error;
}

function targetLabel(target = {}) {
  const parts = [];
  if (target.slide !== undefined && target.slide !== null) parts.push(`slide ${target.slide}`);
  if (target.pageIndex !== undefined && target.pageIndex !== null) parts.push(`page ${Number(target.pageIndex) + 1}`);
  if (target.pageId) parts.push(String(target.pageId));
  if (target.artifact) parts.push(String(target.artifact));
  if (target.moduleIndex !== undefined) parts.push(`module ${target.moduleIndex}`);
  if (target.blockIndex !== undefined) parts.push(`block ${target.blockIndex}`);
  if (target.componentId) parts.push(String(target.componentId));
  if (!parts.length && target.path) parts.push(String(target.path));
  if (!parts.length && target.selector) parts.push(String(target.selector));
  return parts.length ? parts.join(" / ") : "deck";
}

function targetDetailLines(target = {}) {
  const lines = [];
  if (target.selector) lines.push(`Selector: ${target.selector}`);
  if (target.schemaPath) lines.push(`Schema: ${target.schemaPath}`);
  if (target.nodeId) lines.push(`Node: ${target.nodeId}`);
  if (target.sourceSpan) lines.push(`Source: line ${target.sourceSpan.line}, column ${target.sourceSpan.column}`);
  if (target.codeFrame) lines.push(`Code: ${target.codeFrame}`);
  if (target.pageIndex !== undefined && target.pageIndex !== null) lines.push(`Page: ${Number(target.pageIndex) + 1}`);
  if (target.pageId) lines.push(`Page ID: ${target.pageId}`);
  if (target.artifact) lines.push(`Artifact: ${target.artifact}`);
  if (target.path) lines.push(`Path: ${target.path}`);
  if (target.prop) lines.push(`Prop: ${target.prop}`);
  if (target.moduleTitle) lines.push(`Module: ${target.moduleTitle}`);
  if (target.componentId) lines.push(`Component: ${target.componentId}`);
  if (target.kind || target.template) lines.push(`Visual: ${[target.kind, target.template].filter(Boolean).join("/")}`);
  if (target.visual_role) lines.push(`Visual Role: ${target.visual_role}`);
  return lines;
}

function semanticStackLines(stack = []) {
  if (!Array.isArray(stack) || !stack.length) return [];
  const lines = ["Semantic Stack:"];
  for (const frame of stack) {
    const label = stackFrameLabel(frame);
    const location = frame.selector || frame.path;
    const source = frame.sourceSpan ? ` line ${frame.sourceSpan.line}, column ${frame.sourceSpan.column}` : "";
    lines.push(`  at ${label}${location ? ` (${location})` : ""}${source}`);
    if (frame.codeFrame) lines.push(`    code: ${frame.codeFrame}`);
  }
  return lines;
}

function stackFrameLabel(frame = {}) {
  const id = frame.id ? `#${frame.id}` : "";
  const title = frame.title ? ` "${frame.title}"` : "";
  return `${frame.tag || "Unknown"}${id}${title}`;
}

function summarizeDetails(details = {}) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const lines = [];
  if (Array.isArray(details.found_components)) {
    lines.push("Found Components:");
    for (const component of details.found_components) {
      const label = component.component_id ? `${component.tag || component.role}#${component.component_id}` : (component.tag || component.role || "component");
      const role = component.role ? ` role=${component.role}` : "";
      const location = component.selector ? ` (${component.selector})` : "";
      lines.push(`  found ${label}${role}${location}`);
    }
  }
  for (const key of [
    "expected",
    "actual",
    "expected_output",
    "actual_output",
    "expected_body_layout_type",
    "actual_body_layout_type",
    "layout_type",
    "value",
    "visual_component_id",
    "taxonomy_key",
    "expected_module_count",
    "actual_module_count",
  ]) {
    if (details[key] !== undefined && details[key] !== "") lines.push(`${labelFor(key)}: ${formatDetail(details[key])}`);
  }
  return lines;
}

function labelFor(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDetail(value) {
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sortBySeverity(issues) {
  const order = { error: 0, warning: 1, info: 2 };
  return [...issues].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.code.localeCompare(b.code));
}

function cliDetailLines(details = {}) {
  const lines = [];
  if (!details || typeof details !== "object" || Array.isArray(details)) return lines;
  for (const key of ["unusedSpace", "overflow", "readability", "scale", "resizeLimits", "box"]) {
    if (details[key] !== undefined) lines.push(`${labelFor(key)}: ${formatDetail(details[key])}`);
  }
  return lines;
}

module.exports = {
  createFeedbackCliError,
  feedbackToCliText,
  feedbackToJson,
  feedbackToMarkdown,
  normalizeFeedbackIssues,
  targetLabel,
};
