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
      resize_limits: measure.resizeLimits,
      priority: measure.priority,
    },
  };
}

module.exports = {
  measureDescriptorForIndex,
};
