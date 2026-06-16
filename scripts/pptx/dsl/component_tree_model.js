"use strict";

const { BODY_LAYOUT_TYPES } = require("../contracts/body_layout_types");
const {
  ANCHOR_ELIGIBILITY,
  isStructuredSupportingComponentSpec,
} = require("../contracts/visual_templates");
const {
  FAMILY,
  parseDrawId,
} = require("./component_registry");

function componentTreeToRenderModel(tree, options = {}) {
  if (!tree || tree.tag !== "Columns") {
    throw new Error("Body DSL root must be Columns.");
  }
  const type = tree.props.type || "two_column";
  const schema = BODY_LAYOUT_TYPES[type];
  if (!schema) {
    throw new Error(`Unsupported Columns.type: ${type || "(missing)"}.`);
  }
  const modules = tree.children.map((moduleNode, idx) => moduleNodeToRuntimeModule(moduleNode, {
    layoutType: type,
    moduleIndex: idx,
  }));
  validateRenderModel({ type, schema, modules });
  return {
    type,
    reference: tree.props.reference || schema.reference,
    schema,
    modules,
    visualWeight: tree.props.visualWeight || null,
    flowArrows: tree.props.flowArrows || null,
    source: options.source || "bodyDsl",
  };
}

function moduleNodeToRuntimeModule(node, context = {}) {
  if (!node || node.tag !== "Module") {
    throw new Error(`Columns children must be Module nodes; received ${node?.tag || "(missing)"}.`);
  }
  const componentPrimitives = node.children.map(componentNodeToPrimitive).filter(Boolean);
  return {
    role: context.layoutType === "biased_column" && context.moduleIndex === 0 ? "visual_anchor" : "content_panel",
    title: node.props.title || node.props.label || "模块",
    label: node.props.label,
    fill: node.props.fill,
    sourceComponent: node,
    componentPrimitives,
  };
}

function componentNodeToPrimitive(node) {
  if (!node) return null;
  if (node.role === FAMILY.VISUAL_ANCHOR) {
    return {
      type: "visual_anchor",
      visual_anchor: componentNodeToVisualSpec(node),
      visual_anchor_caption: node.props.caption || node.props.visual_anchor_caption,
      dsl: dslMeta(node),
      sourceComponent: summarizeNode(node),
    };
  }
  if (node.role === FAMILY.SUPPORTING_COMPONENT) {
    return {
      type: "supporting_component",
      component: componentNodeToVisualSpec(node),
      dsl: dslMeta(node),
      sourceComponent: summarizeNode(node),
    };
  }
  if (node.role === FAMILY.TEXT) {
    return {
      type: "text",
      body: node.props.body || node.props.items || node.props.text || [],
      emphasis: node.props.emphasis || node.props.redTerms || node.props.red_terms || [],
      fontSize: node.props.fontSize,
      maxLines: node.props.maxLines,
      dsl: dslMeta(node),
      sourceComponent: summarizeNode(node),
    };
  }
  if (node.role === FAMILY.ESCAPE_HATCH) {
    const spec = componentNodeToVisualSpec(node);
    const key = spec._anchorEligibility === ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT ? "component" : "visual_anchor";
    return {
      type: key === "component" ? "supporting_component" : "visual_anchor",
      [key]: stripBridgeMeta(spec),
      visual_anchor_caption: key === "visual_anchor" ? (node.props.caption || node.props.visual_anchor_caption) : undefined,
      dsl: dslMeta(node),
      sourceComponent: summarizeNode(node),
    };
  }
  return null;
}

function componentNodeToVisualSpec(node) {
  if (node.tag === "Visual") {
    const parsed = parseDrawId(node.props.draw);
    if (!parsed) throw new Error(`Unsupported Visual.draw: ${node.props.draw}`);
    return {
      id: node.props.id,
      title: node.props.title,
      claim: node.props.claim,
      source: node.props.source,
      kind: parsed.kind,
      template: parsed.template,
      visual_spec: node.props.model || {},
      highlight_reason: node.props.highlightReason || node.props.highlight_reason,
      _anchorEligibility: parsed.contract.anchorEligibility,
    };
  }
  const visual = node.contract?.visual;
  const props = node.props || {};
  return stripEmpty({
    id: props.id,
    title: props.title,
    claim: props.claim,
    kind: visual?.kind,
    template: visual?.template,
    source: props.source,
    visual_spec: props.visual_spec || buildVisualModelFromProps(node),
    highlight_reason: props.highlightReason || props.highlight_reason,
  });
}

function validateRenderModel(model) {
  const { type, schema, modules } = model;
  const minModuleCount = schema.minModuleCount || schema.moduleCount;
  const maxModuleCount = schema.maxModuleCount || schema.moduleCount;
  if (modules.length < minModuleCount || modules.length > maxModuleCount) {
    const expected = minModuleCount === maxModuleCount ? String(minModuleCount) : `${minModuleCount}-${maxModuleCount}`;
    throwFeedbackError(`Columns.type ${type} requires ${expected} Module children, received ${modules.length}.`, {
      expected_module_count: expected,
      actual_module_count: modules.length,
    });
  }
  if (schema.special === "large_visual_with_side_cards" && modules[0].role !== "visual_anchor") {
    throw new Error(`Columns.type ${type} requires the first Module to be the primary visual module.`);
  }
  const missingAnchors = modules
    .map((module, moduleIndex) => ({ module, moduleIndex }))
    .filter(({ module, moduleIndex }) => {
      if (schema.special === "large_visual_with_side_cards" && moduleIndex > 0) return false;
      return !moduleHasRealVisualAnchor(module);
    });
  if (missingAnchors.length) {
    const first = missingAnchors[0];
    const source = first.module.sourceComponent?.source || {};
    throwFeedbackError(`Module "${first.module.title}" must contain a real visual anchor; supporting components and text cannot satisfy module proof.`, {
      missing_modules: missingAnchors.map(({ module, moduleIndex }) => ({
        module_index: moduleIndex,
        title: module.title,
        selector: module.sourceComponent?.source?.selector,
        components: module.componentPrimitives.map((primitive, blockIndex) => ({
          block_index: blockIndex,
          tag: primitive.dsl?.tag,
          selector: primitive.dsl?.selector,
          role: primitive.dsl?.role || primitive.type,
          component_id: primitive.dsl?.id,
        })),
      })),
    }, {
      code: "dsl_module_real_anchor_missing",
      target: {
        path: source.path,
        selector: source.selector,
        sourceSpan: source.sourceSpan,
        codeFrame: source.codeFrame,
        semanticStack: source.semanticStack,
      },
      repairs: [
        "Add source evidence with <EvidenceFigure>/<EvidenceChart> when available; use a real-anchor <Visual draw=\"Kind/template\"> only as generated drawing when no readable source evidence exists or as secondary explanation.",
        "Keep KpiCards, Table, and InsightText after the module's real proof component.",
      ],
    });
  }
  const strictAnchorCount = modules.reduce((count, module) => {
    return count + module.componentPrimitives.filter(isRealVisualAnchorPrimitive).length;
  }, 0);
  if (strictAnchorCount < 1) {
    throwFeedbackError(`Columns.type ${type} requires at least one real visual component; supporting components cannot satisfy the anchor requirement.`, {
      found_components: modules.flatMap((module, moduleIndex) => module.componentPrimitives.map((primitive, blockIndex) => ({
        module_index: moduleIndex,
        block_index: blockIndex,
        tag: primitive.dsl?.tag,
        selector: primitive.dsl?.selector,
        role: primitive.dsl?.role || primitive.type,
        component_id: primitive.dsl?.id,
      }))),
    }, {
      repairs: [
        "Add source evidence with <EvidenceFigure>/<EvidenceChart> when available; otherwise add a generated-drawing <Visual draw=\"Kind/template\"> that preserves the same claim.",
        "Keep Table, KpiCards, and InsightText as secondary readouts after the real proof component.",
      ],
    });
  }
}

function throwFeedbackError(message, details = {}, options = {}) {
  const error = new Error(message);
  error.feedbackCode = options.code;
  error.feedbackTarget = options.target;
  error.feedbackDetails = details;
  error.feedbackRepairs = options.repairs;
  throw error;
}

function moduleHasRealVisualAnchor(module = {}) {
  return module.componentPrimitives.some(isRealVisualAnchorPrimitive);
}

function isRealVisualAnchorPrimitive(primitive = {}) {
  return primitive.type === "visual_anchor" && primitive.visual_anchor && !isStructuredSupportingComponentSpec(primitive.visual_anchor);
}

function buildVisualModelFromProps(node) {
  const props = node.props || {};
  if (node.tag === "KpiCards") return stripEmpty({ cards: props.cards, highlight: props.highlight });
  if (node.tag === "Table") return stripEmpty({ rows: props.rows });
  if (node.tag === "CapabilityStack") return stripEmpty({ levels: props.levels, highlight: props.highlight });
  return undefined;
}

function summarizeNode(node) {
  return {
    tag: node.tag,
    role: node.role,
    path: node.source?.path,
    selector: node.source?.selector,
    sourceSpan: node.source?.sourceSpan,
    codeFrame: node.source?.codeFrame,
    semanticStack: node.source?.semanticStack,
    id: node.props?.id,
  };
}

function dslMeta(node) {
  const props = node.props || {};
  return stripEmpty({
    tag: node.tag,
    role: node.role,
    path: node.source?.path,
    selector: node.source?.selector,
    sourceSpan: node.source?.sourceSpan,
    codeFrame: node.source?.codeFrame,
    semanticStack: node.source?.semanticStack,
    id: props.id,
    priority: props.priority,
    density: props.density,
    fit: props.fit,
    maxLines: props.maxLines,
    maxItems: props.maxItems,
    maxCards: props.maxCards,
  });
}

function stripBridgeMeta(spec) {
  const out = { ...spec };
  delete out._anchorEligibility;
  return stripEmpty(out);
}

function stripEmpty(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return false;
    return true;
  }));
}

module.exports = {
  componentNodeToPrimitive,
  componentNodeToVisualSpec,
  componentTreeToRenderModel,
  moduleNodeToRuntimeModule,
};
