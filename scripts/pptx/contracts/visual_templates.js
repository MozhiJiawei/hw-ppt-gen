const RENDER_PATH = Object.freeze({
  EVIDENCE: "evidence",
  PPT_NATIVE: "ppt_native",
  ROUGH_SVG: "rough_svg",
});

const ANCHOR_ELIGIBILITY = Object.freeze({
  REAL_ANCHOR: "real_anchor",
  SUPPORTING_COMPONENT: "supporting_component",
  NOT_ANCHOR: "not_anchor",
});

const MEASURE_SUPPORT = Object.freeze({
  MEASURED: "measured",
  ESTIMATED: "estimated",
  LEGACY_FALLBACK: "legacy_fallback",
  UNSUPPORTED: "unsupported",
});

const RESIZE_POLICY = Object.freeze({
  FIXED: "fixed",
  PRESERVE_ASPECT: "preserve_aspect",
  FLEXIBLE: "flexible",
  SHRINK_TEXT: "shrink_text",
  SIMPLIFY: "simplify",
  FAIL_BELOW_FLOOR: "fail_below_floor",
});

const FAMILIES = Object.freeze({
  LayoutContainer: "LayoutContainer",
  Evidence: "Evidence",
  QuantitativeReadout: "QuantitativeReadout",
  StructuredText: "StructuredText",
  RelationshipDiagram: "RelationshipDiagram",
  MatrixTable: "MatrixTable",
  MediaDecorative: "MediaDecorative",
});

const OFFICIAL_TEMPLATES_BY_KIND = Object.freeze({
  Evidence: Object.freeze(["source_figure", "source_chart"]),
  Quantity: Object.freeze(["data_cards", "bar_chart", "line_chart", "proportion_chart", "heatmap"]),
  Sequence: Object.freeze(["process", "timeline", "swimlane"]),
  Loop: Object.freeze(["closed_loop", "dual_loop", "spiral_iteration_ladder"]),
  Hierarchy: Object.freeze(["tree", "layered_architecture", "capability_stack"]),
  Matrix: Object.freeze(["table", "quadrant_matrix", "capability_matrix", "heatmap"]),
  Network: Object.freeze(["hub_spoke_network", "dependency_graph", "module_interaction_map", "causal_influence_graph"]),
});

const TEMPLATE_LAYOUTS = Object.freeze(Object.fromEntries(
  Object.values(OFFICIAL_TEMPLATES_BY_KIND)
    .flat()
    .map((template) => [template, "16:9"])
));

const TEMPLATE_RENDERERS = Object.freeze({
  source_figure: RENDER_PATH.EVIDENCE,
  source_chart: RENDER_PATH.EVIDENCE,

  data_cards: RENDER_PATH.PPT_NATIVE,
  heatmap: RENDER_PATH.PPT_NATIVE,
  process: RENDER_PATH.PPT_NATIVE,
  timeline: RENDER_PATH.PPT_NATIVE,
  capability_stack: RENDER_PATH.PPT_NATIVE,
  capability_matrix: RENDER_PATH.PPT_NATIVE,
  table: RENDER_PATH.PPT_NATIVE,

  bar_chart: RENDER_PATH.ROUGH_SVG,
  line_chart: RENDER_PATH.ROUGH_SVG,
  proportion_chart: RENDER_PATH.ROUGH_SVG,
  swimlane: RENDER_PATH.PPT_NATIVE,
  closed_loop: RENDER_PATH.ROUGH_SVG,
  dual_loop: RENDER_PATH.ROUGH_SVG,
  spiral_iteration_ladder: RENDER_PATH.ROUGH_SVG,
  tree: RENDER_PATH.ROUGH_SVG,
  layered_architecture: RENDER_PATH.ROUGH_SVG,
  quadrant_matrix: RENDER_PATH.ROUGH_SVG,
  hub_spoke_network: RENDER_PATH.ROUGH_SVG,
  dependency_graph: RENDER_PATH.ROUGH_SVG,
  module_interaction_map: RENDER_PATH.ROUGH_SVG,
  causal_influence_graph: RENDER_PATH.ROUGH_SVG,
});

const SUPPORTING_COMPONENT_KEYS = Object.freeze(new Set([
  "Quantity/data_cards",
  "Quantity/heatmap",
  "Matrix/table",
  "Matrix/capability_matrix",
  "Matrix/heatmap",
  "Hierarchy/capability_stack",
]));

const TEMPLATE_CLASSIFICATION = Object.freeze({
  "Evidence/source_figure": { family: FAMILIES.Evidence, type: "SourceFigure", resizePolicy: RESIZE_POLICY.PRESERVE_ASPECT },
  "Evidence/source_chart": { family: FAMILIES.Evidence, type: "SourceChart", resizePolicy: RESIZE_POLICY.PRESERVE_ASPECT },
  "Quantity/data_cards": { family: FAMILIES.QuantitativeReadout, type: "KpiCardRow", resizePolicy: RESIZE_POLICY.FIXED },
  "Quantity/bar_chart": { family: FAMILIES.QuantitativeReadout, type: "MiniBarChart", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Quantity/line_chart": { family: FAMILIES.QuantitativeReadout, type: "MiniLineChart", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Quantity/proportion_chart": { family: FAMILIES.QuantitativeReadout, type: "DonutReadout", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Quantity/heatmap": { family: FAMILIES.MatrixTable, type: "HeatmapMatrix", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Sequence/process": { family: FAMILIES.RelationshipDiagram, type: "ProcessFlow", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Sequence/timeline": { family: FAMILIES.RelationshipDiagram, type: "Timeline", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Sequence/swimlane": { family: FAMILIES.RelationshipDiagram, type: "ProcessFlow", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Loop/closed_loop": { family: FAMILIES.RelationshipDiagram, type: "CycleLoop", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Loop/dual_loop": { family: FAMILIES.RelationshipDiagram, type: "CycleLoop", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Loop/spiral_iteration_ladder": { family: FAMILIES.RelationshipDiagram, type: "CycleLoop", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Hierarchy/tree": { family: FAMILIES.RelationshipDiagram, type: "TreeHierarchy", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Hierarchy/layered_architecture": { family: FAMILIES.RelationshipDiagram, type: "ArchitectureMap", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Hierarchy/capability_stack": { family: FAMILIES.RelationshipDiagram, type: "LayerStack", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Matrix/table": { family: FAMILIES.MatrixTable, type: "NativeTable", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Matrix/capability_matrix": { family: FAMILIES.MatrixTable, type: "CapabilityMatrix", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Matrix/heatmap": { family: FAMILIES.MatrixTable, type: "HeatmapMatrix", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Matrix/quadrant_matrix": { family: FAMILIES.MatrixTable, type: "QuadrantMatrix", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Network/hub_spoke_network": { family: FAMILIES.RelationshipDiagram, type: "NetworkGraph", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Network/dependency_graph": { family: FAMILIES.RelationshipDiagram, type: "ConstraintMap", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Network/module_interaction_map": { family: FAMILIES.RelationshipDiagram, type: "ArchitectureMap", resizePolicy: RESIZE_POLICY.FLEXIBLE },
  "Network/causal_influence_graph": { family: FAMILIES.RelationshipDiagram, type: "CausalChain", resizePolicy: RESIZE_POLICY.FLEXIBLE },
});

function visualTemplateKey(kind, template) {
  return `${safeText(kind)}/${safeText(template)}`;
}

function getVisualTemplateContract(kind, template) {
  const key = visualTemplateKey(kind, template);
  const base = TEMPLATE_CLASSIFICATION[key];
  if (!base) return null;
  return {
    key,
    kind: safeText(kind),
    template: safeText(template),
    ...base,
    renderer: TEMPLATE_RENDERERS[safeText(template)],
    layout: TEMPLATE_LAYOUTS[safeText(template)] || "16:9",
    anchorEligibility: SUPPORTING_COMPONENT_KEYS.has(key)
      ? ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT
      : ANCHOR_ELIGIBILITY.REAL_ANCHOR,
    measureSupport: MEASURE_SUPPORT.MEASURED,
  };
}

function isOfficialVisualTemplate(kind, template) {
  return Boolean(getVisualTemplateContract(kind, template));
}

function isStructuredSupportingComponentSpec(spec = {}) {
  return SUPPORTING_COMPONENT_KEYS.has(visualTemplateKey(spec.kind, spec.template));
}

function officialVisualTemplateRows() {
  return Object.entries(OFFICIAL_TEMPLATES_BY_KIND).flatMap(([kind, templates]) => (
    templates.map((template) => getVisualTemplateContract(kind, template))
  ));
}

function safeText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean).join("\n");
  return String(value).trim();
}

module.exports = {
  ANCHOR_ELIGIBILITY,
  FAMILIES,
  MEASURE_SUPPORT,
  OFFICIAL_TEMPLATES_BY_KIND,
  RENDER_PATH,
  RESIZE_POLICY,
  SUPPORTING_COMPONENT_KEYS,
  TEMPLATE_CLASSIFICATION,
  TEMPLATE_LAYOUTS,
  TEMPLATE_RENDERERS,
  getVisualTemplateContract,
  isOfficialVisualTemplate,
  isStructuredSupportingComponentSpec,
  officialVisualTemplateRows,
  safeText,
  visualTemplateKey,
};
