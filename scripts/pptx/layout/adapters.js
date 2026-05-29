const { layoutModuleStack } = require("./stack_layout");

function resolveMeasuredBlockLayout(area, blocks, flow, options = {}) {
  return layoutModuleStack(area, blocks, flow, options);
}

function measureDescriptorForIndex(layoutResult, index) {
  const measure = layoutResult?.measures?.[index];
  if (!measure) return null;
  return {
    taxonomy: measure.primitive,
    measure: {
      min_size: measure.minSize,
      preferred_size: measure.preferredSize,
      max_useful_size: measure.maxUsefulSize,
      resize_policy: measure.resizePolicy,
      priority: measure.priority,
    },
    layout_diagnostics: measure.diagnostics || [],
  };
}

module.exports = {
  measureDescriptorForIndex,
  resolveMeasuredBlockLayout,
};
