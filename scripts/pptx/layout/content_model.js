const { CONTENT_LAYOUT_TYPES } = require("../contracts/content_layout_types");
const {
  isStructuredSupportingComponentSpec,
  safeText,
} = require("../contracts/visual_templates");

function normalizeContentLayout(layout) {
  if (!layout) return null;
  const type = safeText(layout.type);
  const schema = CONTENT_LAYOUT_TYPES[type];
  if (!schema) {
    throw new Error(`Unsupported contentLayout.type: ${type || "(missing)"}.`);
  }
  const modules = (layout.modules || []).filter(Boolean);
  const minModuleCount = schema.minModuleCount || schema.moduleCount;
  const maxModuleCount = schema.maxModuleCount || schema.moduleCount;
  if (modules.length < minModuleCount || modules.length > maxModuleCount) {
    const expected = minModuleCount === maxModuleCount ? String(minModuleCount) : `${minModuleCount}-${maxModuleCount}`;
    throw new Error(`contentLayout.type ${type} requires ${expected} modules, received ${modules.length}.`);
  }
  if (schema.special === "large_visual_with_side_cards" && modules[0].role !== "visual_anchor") {
    throw new Error(`contentLayout.type ${type} requires the first module to be role "visual_anchor".`);
  }
  const strictAnchorCount = modules.reduce((count, module) => count + countModuleStrictVisualAnchors(module), 0);
  if (strictAnchorCount < 1) {
    throw new Error(`contentLayout.type ${type} requires at least one real visual_anchor block; supporting components cannot satisfy the anchor requirement.`);
  }
  return {
    type,
    reference: safeText(layout.reference || schema.reference),
    modules,
    schema,
    visualWeight: layout.visualWeight || null,
    flowArrows: layout.flowArrows || null,
  };
}

function countModuleVisualAnchors(module = {}) {
  if (module.role === "visual_anchor" && module.visual_anchor) return 1;
  const blocks = module.blocks || [];
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((count, block) => {
    return count + (block.type === "visual_anchor" && block.visual_anchor ? 1 : 0);
  }, 0);
}

function countModuleStrictVisualAnchors(module = {}) {
  const directAnchor = module.visual_anchor;
  if (module.role === "visual_anchor" && directAnchor && !isStructuredSupportingComponent(directAnchor)) return 1;
  const blocks = module.blocks || [];
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((count, block) => {
    const anchor = block.visual_anchor;
    return count + (block.type === "visual_anchor" && anchor && !isStructuredSupportingComponent(anchor) ? 1 : 0);
  }, 0);
}

function normalizeModuleBody(module = {}) {
  const body = module.body || "";
  return Array.isArray(body) ? body.map((line) => `- ${safeText(line)}`).join("\n") : safeText(body);
}

function normalizeModuleBlocks(module = {}) {
  const rawBlocks = module.blocks;
  if (Array.isArray(rawBlocks) && rawBlocks.length) return rawBlocks.filter(Boolean);
  const role = module.role || "text";
  if (role === "visual_anchor" && module.visual_anchor) {
    return [{
      type: "visual_anchor",
      visual_anchor: module.visual_anchor,
      visual_anchor_caption: module.visual_anchor_caption || module.caption,
      body: module.body,
    }];
  }
  return [{ type: "text", body: normalizeModuleBody(module), fontSize: module.fontSize || module.contentFontSize }];
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
  countModuleStrictVisualAnchors,
  countModuleVisualAnchors,
  isStructuredSupportingComponent,
  isTextBlock,
  getBlockVisualSpec,
  normalizeContentLayout,
  normalizeModuleBlocks,
  normalizeModuleBody,
  visualComponentRole,
};
