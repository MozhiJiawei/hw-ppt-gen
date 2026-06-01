const assert = require("assert");
const { diagnosticsToFeedbackIssues, hasHardDiagnostics } = require("../../pptx/layout/diagnostics");

const diagnostics = [
  { code: "layout_stack_shrink", severity: "info" },
  { code: "layout_stack_gap_shrink", severity: "info" },
];
assert.equal(hasHardDiagnostics(diagnostics), false);
assert.equal(hasHardDiagnostics([...diagnostics, { code: "layout_manager_fallback", severity: "error" }]), true);

const feedback = diagnosticsToFeedbackIssues([
  { code: "layout_manager_fallback", severity: "error", message: "fallback" },
], { slide: 3, moduleIndex: 1 });
assert.equal(feedback[0].phase, "layout");
assert.equal(feedback[0].target.slide, 3);
assert.equal(feedback[0].target.moduleIndex, 1);

console.log("Layout diagnostics smoke passed.");
