const assert = require("assert");
const { hasHardDiagnostics } = require("../../pptx/layout/diagnostics");

const diagnostics = [
  { code: "layout_stack_shrink", severity: "info" },
  { code: "layout_stack_gap_shrink", severity: "info" },
];
assert.equal(hasHardDiagnostics(diagnostics), false);
assert.equal(hasHardDiagnostics([...diagnostics, { code: "layout_manager_fallback", severity: "error" }]), true);

console.log("Layout diagnostics smoke passed.");
