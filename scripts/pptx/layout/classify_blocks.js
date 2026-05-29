const {
  classifyTextBlock,
  classifyVisualAnchor,
  MEASURE_SUPPORT,
  safeText,
  taxonomyKey,
} = require("./content_body_taxonomy");

function classifyBlock(block = {}) {
  const visualAnchor = block.visual_anchor || block.visualAnchor;
  const type = block.type || block.role || block.kind || "text";
  const classification = visualAnchor
    ? classifyVisualAnchor(visualAnchor)
    : classifyTextBlock(block);
  const diagnostics = [];
  if (classification.measureSupport === MEASURE_SUPPORT.UNSUPPORTED) {
    diagnostics.push({
      code: "layout_taxonomy_unsupported",
      severity: "error",
      message: `Unsupported body-content component: ${safeText(visualAnchor?.kind)}/${safeText(visualAnchor?.template)}`,
    });
  } else if (classification.measureSupport === MEASURE_SUPPORT.LEGACY_FALLBACK) {
    diagnostics.push({
      code: "layout_taxonomy_legacy_fallback",
      severity: "error",
      message: `Component ${safeText(visualAnchor?.kind)}/${safeText(visualAnchor?.template)} is classified but still uses legacy layout fallback.`,
    });
  }
  return {
    blockType: type,
    family: classification.family,
    type: classification.type,
    taxonomy_key: taxonomyKey(classification),
    anchorEligibility: classification.anchorEligibility,
    measureSupport: classification.measureSupport,
    resizePolicy: classification.resizePolicy,
    kind: classification.kind,
    template: classification.template,
    diagnostics,
  };
}

function classifyBlocks(blocks = []) {
  return blocks.filter(Boolean).map((block, idx) => ({
    index: idx,
    ...classifyBlock(block),
  }));
}

module.exports = {
  classifyBlock,
  classifyBlocks,
};
