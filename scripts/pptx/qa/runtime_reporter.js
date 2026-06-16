"use strict";

const fs = require("fs");
const path = require("path");

function writeRuntimeQaReport(reportPayload = {}, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "runtime_qa_report.json");
  const markdownPath = path.join(outputDir, "runtime_qa_report.md");
  fs.writeFileSync(jsonPath, JSON.stringify(reportPayload, null, 2), "utf8");
  fs.writeFileSync(markdownPath, runtimeQaReportToMarkdown(reportPayload), "utf8");
  return { jsonPath, markdownPath };
}

function writeIrArtifacts(reportPayload = {}, outputDir, input = {}) {
  fs.mkdirSync(outputDir, { recursive: true });
  const dslPage = findPage(reportPayload, input.dslPageId || input.pageId);
  const compilePage = findPage(reportPayload, input.compilePageId || input.pageId);
  const measurementPage = findPage(reportPayload, input.measurementPageId || input.pageId);
  const layoutPage = findPage(reportPayload, input.layoutPageId || input.pageId);
  const prefix = input.prefix || "runtime";
  const paths = {
    dslIrPath: path.join(outputDir, input.dslFileName || `${prefix}.dsl-ir.json`),
    compileIrPath: path.join(outputDir, input.compileFileName || `${prefix}.compile-ir.json`),
    measurementIrPath: path.join(outputDir, input.measurementFileName || `${prefix}.measurement-ir.json`),
    layoutIrPath: path.join(outputDir, input.layoutFileName || `${prefix}.layout-ir.json`),
  };
  fs.writeFileSync(paths.dslIrPath, JSON.stringify(dslPage?.ir?.dsl || null, null, 2), "utf8");
  fs.writeFileSync(paths.compileIrPath, JSON.stringify(compilePage?.ir?.compile || null, null, 2), "utf8");
  fs.writeFileSync(paths.measurementIrPath, JSON.stringify(measurementPage?.ir?.measurement || null, null, 2), "utf8");
  fs.writeFileSync(paths.layoutIrPath, JSON.stringify(layoutPage?.ir?.layout || null, null, 2), "utf8");
  return paths;
}

function runtimeQaReportToMarkdown(reportPayload = {}) {
  const lines = [
    "# Runtime QA Pipeline Report",
    "",
    `Pages: ${reportPayload.summary?.totalPages ?? 0}`,
    "",
    "## Summary",
    "",
  ];
  const counts = reportPayload.summary?.issueCountsByPhase || {};
  for (const [phase, count] of Object.entries(counts)) lines.push(`- ${phase}: ${count}`);

  for (const page of reportPayload.pages || []) {
    lines.push("", `## Page ${Number(page.pageIndex) + 1}${page.pageId ? ` (${page.pageId})` : ""}`, "");
    for (const [phase, phaseReport] of Object.entries(page.phases || {})) {
      lines.push(`### ${phase}: ${phaseReport.status}`);
      for (const issue of phaseReport.issues || []) pushIssue(lines, issue);
      lines.push("");
    }
  }

  lines.push("", "## Render / Export Fallback", "");
  for (const issue of reportPayload.renderExport?.issues || []) pushIssue(lines, issue);
  return lines.join("\n").trimEnd() + "\n";
}

function pushIssue(lines, issue = {}) {
  const target = issue.target || {};
  lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
  lines.push(`  - phase: ${issue.phase}`);
  lines.push(`  - location: ${issue.location_quality}`);
  if (target.pageIndex !== undefined) lines.push(`  - page: ${Number(target.pageIndex) + 1}`);
  if (target.selector) lines.push(`  - selector: ${target.selector}`);
  if (target.schemaPath) lines.push(`  - schema: ${target.schemaPath}`);
  if (target.nodeId) lines.push(`  - node: ${target.nodeId}`);
  if (target.sourceSpan) lines.push(`  - source: line ${target.sourceSpan.line}, column ${target.sourceSpan.column}`);
  if (target.codeFrame) lines.push(`  - code: ${target.codeFrame}`);
  if (target.componentId) lines.push(`  - component: ${target.componentId}`);
  if (target.artifact) lines.push(`  - artifact: ${target.artifact}`);
  const stack = Array.isArray(target.semanticStack) ? target.semanticStack : [];
  if (stack.length) lines.push(`  - stack: ${stack.map(stackFrameLabel).join(" > ")}`);
  if (issue.repairs?.length) lines.push(`  - repairs: ${issue.repairs.join(" / ")}`);
  if (issue.details && Object.keys(issue.details).length) {
    lines.push(`  - details: ${JSON.stringify(compactDetails(issue.details))}`);
  }
}

function stackFrameLabel(frame = {}) {
  return `${frame.tag || "Unknown"}${frame.id ? `#${frame.id}` : ""}`;
}

function compactDetails(details = {}) {
  if (Array.isArray(details.compilerIssues)) {
    return {
      compilerIssues: details.compilerIssues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        selector: issue.target?.selector,
      })),
    };
  }
  if (details.compilerIssue) {
    return {
      compilerIssue: {
        code: details.compilerIssue.code,
        message: details.compilerIssue.message,
        selector: details.compilerIssue.target?.selector,
      },
    };
  }
  if (details.measurement) {
    return {
      identity: details.expected || details.measurement.identity,
      status: details.measurement.status,
      measureSupport: details.measurement.measureSupport,
      bounds: details.measurement.bounds,
      error: details.measurement.measurement?.error,
    };
  }
  if (details.identity || details.box || details.value !== undefined) {
    return {
      identity: details.identity,
      box: details.box,
      value: details.value,
    };
  }
  return details;
}

function findPage(reportPayload = {}, pageId) {
  if (pageId !== undefined) return (reportPayload.pages || []).find((page) => page.pageId === pageId);
  return (reportPayload.pages || []).find((page) => page.ir?.dsl || page.ir?.compile || page.ir?.measurement || page.ir?.layout);
}

module.exports = {
  runtimeQaReportToMarkdown,
  writeIrArtifacts,
  writeRuntimeQaReport,
};
