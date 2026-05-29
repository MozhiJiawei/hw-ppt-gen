function diagnostic(code, severity, message, detail = {}) {
  return {
    code,
    severity,
    message,
    ...detail,
  };
}

function hasHardDiagnostics(diagnostics = []) {
  return diagnostics.some((item) => item && item.severity === "error");
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
  hasHardDiagnostics,
  round,
  roundRect,
};
