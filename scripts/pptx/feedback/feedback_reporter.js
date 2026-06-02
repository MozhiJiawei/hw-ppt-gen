"use strict";

const { createFeedbackIssue, normalizeQaIssue } = require("./feedback_issue");

function normalizeFeedbackIssues(items = []) {
  return items.map((item) => {
    if (item?.feedback) return createFeedbackIssue(item.feedback);
    if (item?.phase) return createFeedbackIssue(item);
    return normalizeQaIssue(item);
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

function targetLabel(target = {}) {
  const parts = [];
  if (target.slide !== undefined && target.slide !== null) parts.push(`slide ${target.slide}`);
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
  if (target.path) lines.push(`Path: ${target.path}`);
  if (target.prop) lines.push(`Prop: ${target.prop}`);
  if (target.moduleTitle) lines.push(`Module: ${target.moduleTitle}`);
  if (target.componentId) lines.push(`Component: ${target.componentId}`);
  return lines;
}

function semanticStackLines(stack = []) {
  if (!Array.isArray(stack) || !stack.length) return [];
  const lines = ["Semantic Stack:"];
  for (const frame of stack) {
    const label = stackFrameLabel(frame);
    const location = frame.selector || frame.path;
    lines.push(`  at ${label}${location ? ` (${location})` : ""}`);
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

module.exports = {
  feedbackToJson,
  feedbackToMarkdown,
  normalizeFeedbackIssues,
  targetLabel,
};
