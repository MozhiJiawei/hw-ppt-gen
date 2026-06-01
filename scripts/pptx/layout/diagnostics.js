const {
  createFeedbackIssue,
  normalizeLayoutDiagnostic,
} = require("../feedback/feedback_issue");

function diagnostic(code, severity, message, detail = {}) {
  const item = {
    code,
    severity,
    phase: detail.phase || "layout",
    message,
    ...detail,
  };
  return {
    ...item,
    feedback: normalizeLayoutDiagnostic(item, detail.context || {}),
  };
}

function hasHardDiagnostics(diagnostics = []) {
  return diagnostics.some((item) => item && item.severity === "error");
}

function diagnosticsToFeedbackIssues(diagnostics = [], context = {}) {
  return diagnostics.map((item) => item?.feedback || normalizeLayoutDiagnostic(item, context)).map(createFeedbackIssue);
}

function roundRect(area) {
  if (!area) return null;
  return {
    x: round(area.x),
    y: round(area.y),
    w: round(area.w),
    h: round(area.h),
  };
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

module.exports = {
  diagnostic,
  diagnosticsToFeedbackIssues,
  hasHardDiagnostics,
  round,
  roundRect,
};
