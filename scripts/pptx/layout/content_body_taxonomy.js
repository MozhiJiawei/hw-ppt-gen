const {
  ANCHOR_ELIGIBILITY,
  FAMILIES,
  MEASURE_SUPPORT,
  RESIZE_POLICY,
  TEMPLATE_CLASSIFICATION,
  getVisualTemplateContract,
  safeText,
} = require("../contracts/visual_templates");

const TEXT_TYPE = Object.freeze({
  RichBulletBlock: "RichBulletBlock",
  CalloutNote: "CalloutNote",
});

const VISUAL_ANCHOR_TAXONOMY = Object.freeze(Object.fromEntries(
  Object.keys(TEMPLATE_CLASSIFICATION).map((key) => {
    const [kind, template] = key.split("/");
    const contract = getVisualTemplateContract(kind, template);
    return [key, {
      family: contract.family,
      type: contract.type,
      anchorEligibility: contract.anchorEligibility,
      measureSupport: contract.measureSupport,
      resizePolicy: contract.resizePolicy,
      renderer: contract.renderer,
    }];
  })
));

function classifyVisualAnchor(visualAnchor) {
  const kind = safeText(visualAnchor?.kind);
  const template = safeText(visualAnchor?.template);
  const contract = getVisualTemplateContract(kind, template);
  if (contract) {
    return {
      family: contract.family,
      type: contract.type,
      kind,
      template,
      anchorEligibility: contract.anchorEligibility,
      measureSupport: contract.measureSupport,
      resizePolicy: contract.resizePolicy,
      renderer: contract.renderer,
    };
  }

  return {
    family: FAMILIES.MediaDecorative,
    type: "Unsupported",
    kind,
    template,
    anchorEligibility: ANCHOR_ELIGIBILITY.NOT_ANCHOR,
    measureSupport: MEASURE_SUPPORT.UNSUPPORTED,
    resizePolicy: RESIZE_POLICY.FAIL_BELOW_FLOOR,
  };
}

function classifyTextBlock(block = {}) {
  const body = Array.isArray(block.body || block.items || block.text)
    ? (block.body || block.items || block.text).join("\n")
    : safeText(block.body || block.items || block.text);
  return {
    family: FAMILIES.StructuredText,
    type: /^(\s*-\s*)/m.test(body) || body.includes("：") ? TEXT_TYPE.RichBulletBlock : TEXT_TYPE.CalloutNote,
    anchorEligibility: ANCHOR_ELIGIBILITY.NOT_ANCHOR,
    measureSupport: MEASURE_SUPPORT.MEASURED,
    resizePolicy: RESIZE_POLICY.SHRINK_TEXT,
  };
}

function taxonomyKey(classification = {}) {
  return `${classification.family || "Unknown"}.${classification.type || "Unknown"}`;
}

module.exports = {
  ANCHOR_ELIGIBILITY,
  FAMILIES,
  MEASURE_SUPPORT,
  RESIZE_POLICY,
  TEXT_TYPE,
  VISUAL_ANCHOR_TAXONOMY,
  classifyTextBlock,
  classifyVisualAnchor,
  safeText,
  taxonomyKey,
};
