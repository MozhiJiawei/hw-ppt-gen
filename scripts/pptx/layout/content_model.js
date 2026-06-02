const {
  isStructuredSupportingComponentSpec,
  safeText,
} = require("../contracts/visual_templates");

function countModuleVisualAnchors(module = {}) {
  return modulePrimitives(module).reduce((count, primitive) => {
    return count + (primitive.type === "visual_anchor" && primitive.visual_anchor ? 1 : 0);
  }, 0);
}

function normalizeTextPrimitiveBody(primitive = {}) {
  const body = primitive.body || "";
  return Array.isArray(body) ? body.map((line) => `- ${safeText(line)}`).join("\n") : safeText(body);
}

function modulePrimitives(module = {}) {
  const componentPrimitives = module.componentPrimitives;
  if (Array.isArray(componentPrimitives) && componentPrimitives.length) return componentPrimitives.filter(Boolean);
  return [];
}

function isTextBlock(block = {}) {
  return !getBlockVisualSpec(block) && (block.type || "text") === "text";
}

function getBlockVisualSpec(block = {}) {
  if (block.type === "visual_anchor") return block.visual_anchor;
  if (block.type === "supporting_component") return block.component;
  return null;
}

function isStructuredSupportingComponent(visualAnchor) {
  return isStructuredSupportingComponentSpec(visualAnchor);
}

function visualComponentRole(visualAnchor) {
  if (!visualAnchor) return undefined;
  return isStructuredSupportingComponent(visualAnchor) ? "supporting_component" : "visual_anchor";
}

module.exports = {
  countModuleVisualAnchors,
  isStructuredSupportingComponent,
  isTextBlock,
  getBlockVisualSpec,
  modulePrimitives,
  normalizeTextPrimitiveBody,
  visualComponentRole,
};
