"use strict";

const { runDslInputChecks } = require("./dsl_input_checks");
const { normalizeMeasurementIr, runMeasurementChecks } = require("./measurement_checks");
const { normalizeLayoutIr, runLayoutChecks } = require("./layout_checks");
const { runRenderExportChecks } = require("./render_export_checks");
const {
  collectVisiblePrimitives,
  compilePageBodyDslToIr,
  compileResultToIr,
} = require("./compile_ir");
const { createPhaseResult } = require("./ir_contracts");

const PHASES = ["dsl_input", "compile", "measure", "layout"];

function runRuntimeQaPipeline(input = {}) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const pageReports = pages.map((page, pageIndex) => runPage(page, pageIndex, input));
  const renderExport = input.artifacts ? runRenderExportChecks(input.artifacts) : { issues: [] };
  return {
    pages: pageReports,
    renderExport,
    summary: summarize(pageReports, renderExport.issues),
  };
}

function runPage(page = {}, pageIndex, hooks = {}) {
  const pageContext = { ...page, pageIndex: page.pageIndex ?? pageIndex };
  const report = {
    pageIndex: pageContext.pageIndex,
    pageId: pageContext.pageId,
    phases: emptyPhases(),
    issues: [],
    ir: {},
  };

  const dslResult = runDslInputChecks(pageContext);
  setPhase(report, "dsl_input", dslResult.phaseResult);
  report.issues.push(...dslResult.issues);
  report.ir.dsl = dslResult.dslIr;
  report.ir.compile = dslResult.compileIr;

  if (dslResult.issues.some((issue) => issue.severity === "error")) {
    skipAfter(report, "dsl_input");
    return report;
  }

  setPhase(report, "compile", createPhaseResult({ phase: "compile", ir: dslResult.compileIr, diagnostics: [] }));

  try {
    if (typeof hooks.measurePage !== "function") {
      const issue = phaseProducerMissingIssue("measure", pageContext);
      setPhase(report, "measure", createPhaseResult({ phase: "measure", ir: null, diagnostics: [issue] }));
      report.issues.push(issue);
      skipAfter(report, "measure");
      return report;
    }
    const measurement = hooks.measurePage({ page: pageContext, compileIr: dslResult.compileIr, dslIr: dslResult.dslIr });
    const measurementIr = normalizeMeasurementIr({
      ...measurement,
      pageIndex: pageContext.pageIndex,
      pageId: pageContext.pageId,
      expectedPrimitives: dslResult.compileIr?.visiblePrimitives || [],
    });
    const measurementResult = runMeasurementChecks(measurementIr);
    report.ir.measurement = measurementIr;
    setPhase(report, "measure", measurementResult.phaseResult);
    report.issues.push(...measurementResult.issues);
    if (measurementResult.issues.some((issue) => issue.severity === "error")) {
      skipAfter(report, "measure");
      return report;
    }

    if (typeof hooks.layoutPage !== "function") {
      const issue = phaseProducerMissingIssue("layout", pageContext);
      setPhase(report, "layout", createPhaseResult({ phase: "layout", ir: null, diagnostics: [issue] }));
      report.issues.push(issue);
      return report;
    }
    const layout = hooks.layoutPage({ page: pageContext, compileIr: dslResult.compileIr, measurementIr });
    const layoutIr = normalizeLayoutIr({
      ...layout,
      pageIndex: pageContext.pageIndex,
      pageId: pageContext.pageId,
      expectedPrimitives: dslResult.compileIr?.visiblePrimitives || [],
      measuredPrimitives: measurementIr.records || [],
    });
    const layoutResult = runLayoutChecks(layoutIr);
    report.ir.layout = layoutIr;
    setPhase(report, "layout", layoutResult.phaseResult);
    report.issues.push(...layoutResult.issues);
  } catch (error) {
    const phase = report.phases.measure.status === "pending" ? "measure" : "layout";
    const issue = phaseExceptionIssue(phase, pageContext, error);
    setPhase(report, phase, createPhaseResult({ phase, ir: null, diagnostics: [issue] }));
    report.issues.push(issue);
    skipAfter(report, phase);
  }

  return report;
}

function emptyPhases() {
  return Object.fromEntries(PHASES.map((phase) => [phase, { status: "pending", issues: [] }]));
}

function setPhase(report, phase, phaseResultOrIssues = []) {
  const phaseResult = Array.isArray(phaseResultOrIssues)
    ? createPhaseResult({ phase, diagnostics: phaseResultOrIssues })
    : phaseResultOrIssues;
  report.phases[phase] = {
    status: phaseResult.status,
    issues: phaseResult.diagnostics,
    diagnostics: phaseResult.diagnostics,
    irKind: phaseResult.ir?.irKind,
  };
}

function skipAfter(report, phase) {
  const start = PHASES.indexOf(phase) + 1;
  PHASES.slice(start).forEach((name) => {
    if (report.phases[name]?.status === "pending") {
      report.phases[name] = { status: "skipped_due_to_page_dependency", issues: [] };
    }
  });
}

function summarize(pageReports = [], renderIssues = []) {
  const issueCountsByPhase = {};
  for (const report of pageReports) {
    for (const issue of report.issues || []) {
      issueCountsByPhase[issue.phase] = (issueCountsByPhase[issue.phase] || 0) + 1;
    }
  }
  for (const issue of renderIssues) {
    issueCountsByPhase[issue.phase] = (issueCountsByPhase[issue.phase] || 0) + 1;
  }
  return {
    totalPages: pageReports.length,
    issueCountsByPhase,
  };
}

function phaseExceptionIssue(phase, page, error) {
  const { createFeedbackIssue } = require("../feedback/feedback_issue");
  return createFeedbackIssue({
    code: `${phase}_runtime_exception`,
    phase,
    severity: "error",
    location_quality: "page_only",
    target: { pageIndex: page.pageIndex, pageId: page.pageId },
    message: error.message || String(error),
    details: { stack: error.stack },
  });
}

function phaseProducerMissingIssue(phase, page) {
  const { createFeedbackIssue } = require("../feedback/feedback_issue");
  return createFeedbackIssue({
    code: `${phase}_producer_missing`,
    phase,
    severity: "error",
    location_quality: "page_only",
    target: { pageIndex: page.pageIndex, pageId: page.pageId },
    message: `${phase} phase requires an explicit producer; runtime QA cannot synthesize passing IR.`,
    details: { expectedProducer: phase === "measure" ? "measurePage" : "layoutPage" },
  });
}

module.exports = {
  collectVisiblePrimitives,
  compilePageBodyDslToIr,
  compileResultToIr,
  runRuntimeQaPipeline,
};
