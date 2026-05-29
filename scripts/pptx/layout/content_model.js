const { CONTENT_LAYOUT_TYPES } = require("../contracts/content_layout_types");
const {
  isStructuredSupportingComponentSpec,
  safeText,
} = require("../contracts/visual_templates");

function normalizeContentLayout(layout) {
  if (!layout) return null;
  const type = safeText(layout.type || layout.layout || layout.name);
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
  if (schema.special === "large_visual_with_side_cards" && (modules[0].role || modules[0].kind) !== "visual_anchor") {
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
    visualWeight: layout.visualWeight || layout.visual_weight || null,
    flowArrows: layout.flowArrows || layout.flow_arrows || null,
  };
}

function countModuleVisualAnchors(module = {}) {
  if ((module.role || module.kind) === "visual_anchor" || module.visual_anchor || module.visualAnchor) return 1;
  const blocks = module.blocks || module.children || module.items || [];
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((count, block) => {
    const type = block.type || block.role || block.kind;
    return count + (type === "visual_anchor" || block.visual_anchor || block.visualAnchor ? 1 : 0);
  }, 0);
}

function countModuleStrictVisualAnchors(module = {}) {
  const directAnchor = module.visual_anchor || module.visualAnchor;
  if (((module.role || module.kind) === "visual_anchor" || directAnchor) && !isStructuredSupportingComponent(directAnchor)) return 1;
  const blocks = module.blocks || module.children || module.items || [];
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((count, block) => {
    const type = block.type || block.role || block.kind;
    const anchor = block.visual_anchor || block.visualAnchor;
    return count + ((type === "visual_anchor" || anchor) && !isStructuredSupportingComponent(anchor) ? 1 : 0);
  }, 0);
}

function normalizeModuleBody(module = {}) {
  const body = module.body || module.items || module.text || "";
  return Array.isArray(body) ? body.map((line) => `- ${safeText(line)}`).join("\n") : safeText(body);
}

function normalizeModuleBlocks(module = {}, data = {}) {
  const rawBlocks = module.blocks || module.children;
  if (Array.isArray(rawBlocks) && rawBlocks.length) return rawBlocks.filter(Boolean);
  const role = module.role || module.kind || "text";
  if (role === "visual_anchor") {
    return [{
      type: "visual_anchor",
      visual_anchor: module.visual_anchor || module.visualAnchor || data.visual_anchor,
      visualAnchorCaption: module.visualAnchorCaption || module.visual_anchor_caption || module.caption,
      body: module.body,
    }].filter((block) => block.visual_anchor);
  }
  return [{ type: "text", body: normalizeModuleBody(module), fontSize: module.fontSize || module.contentFontSize }];
}

function isTextBlock(block = {}) {
  const type = block.type || block.role || block.kind || "text";
  return !(block.visual_anchor || block.visualAnchor) && type === "text";
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
  normalizeContentLayout,
  normalizeModuleBlocks,
  normalizeModuleBody,
  visualComponentRole,
};
