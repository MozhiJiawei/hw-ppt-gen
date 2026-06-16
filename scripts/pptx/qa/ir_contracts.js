"use strict";

const IR_VERSION = 1;
const VALID_PHASES = new Set(["dsl_input", "compile", "measure", "layout", "render_export"]);
const VALID_STATUS = new Set(["passed", "failed", "skipped_due_to_page_dependency"]);

function createSourceLocation(input = {}) {
  const sourceSpan = input.sourceSpan || input.source_span;
  const semanticStack = Array.isArray(input.semanticStack || input.semantic_stack)
    ? (input.semanticStack || input.semantic_stack)
    : [];
  const location = stripUndefined({
    path: input.path,
    selector: input.selector,
    sourceSpan,
    codeFrame: input.codeFrame || input.code_frame,
    semanticStack,
  });
  return {
    ...location,
    location_quality: input.location_quality || inferLocationQuality(location),
  };
}

function createPrimitiveIdentity(input = {}) {
  return stripUndefined({
    componentId: input.componentId || input.component_id || input.id,
    blockType: input.blockType || input.block_type || input.type,
    kind: input.kind,
    template: input.template,
  });
}

function createDslIr(input = {}) {
  return createIrBase("DslIr", input, {
    root: input.root || null,
    bodyDsl: input.bodyDsl || null,
    slideProps: input.slideProps || {},
    nodes: Array.isArray(input.nodes) ? input.nodes : [],
  });
}

function createCompileIr(input = {}) {
  const nodes = (input.visiblePrimitives || input.nodes || []).map((node, index) => createPrimitiveNode(node, index));
  return createIrBase("CompileIr", input, {
    tree: input.tree || null,
    renderModel: input.renderModel || null,
    nodes,
    visiblePrimitives: nodes,
    feedbackIssues: input.feedbackIssues || [],
  });
}

function createMeasurementIr(input = {}) {
  return createIrBase("MeasurementIr", input, {
    expectedPrimitives: (input.expectedPrimitives || []).map((node, index) => createPrimitiveNode(node, index)),
    records: (input.records || []).map(createMeasurementRecord),
  });
}

function createLayoutIr(input = {}) {
  return createIrBase("LayoutIr", input, {
    status: input.status || "ok",
    pageBounds: input.pageBounds || null,
    bodyBounds: input.bodyBounds || input.pageBounds || null,
    layoutType: input.layoutType || input.layout_type || null,
    containers: (input.containers || []).map(createLayoutContainer),
    constraints: (input.constraints || []).map(createLayoutConstraint),
    alignmentGroups: (input.alignmentGroups || input.alignment_groups || []).map(createAlignmentGroup),
    expectedPrimitives: (input.expectedPrimitives || []).map((node, index) => createPrimitiveNode(node, index)),
    measuredPrimitives: (input.measuredPrimitives || []).map(createMeasurementRecord),
    records: (input.records || []).map(createLayoutBox),
    diagnostics: input.diagnostics || [],
  });
}

function createPhaseResult(input = {}) {
  const diagnostics = input.diagnostics || input.issues || [];
  const phase = requirePhase(input.phase);
  const status = input.status || (diagnostics.some((issue) => issue.severity === "error") ? "failed" : "passed");
  if (!VALID_STATUS.has(status)) throw new Error(`Invalid phase result status: ${status}`);
  return {
    phase,
    status,
    ir: input.ir || null,
    diagnostics,
    issues: diagnostics,
  };
}

function serializeIrForReview(ir = {}) {
  return JSON.parse(JSON.stringify(ir));
}

function createPrimitiveNode(input = {}, index = 0) {
  const identity = createPrimitiveIdentity(input.identity || input);
  const source = createSourceLocation(input.source || input.dsl || input.target || {});
  return stripUndefined({
    nodeKind: "Primitive",
    nodeId: input.nodeId || input.node_id || primitiveNodeId(identity, index, source),
    identity,
    source,
    dsl: input.dsl || source,
    sourceComponent: input.sourceComponent,
    moduleIndex: input.moduleIndex,
    blockIndex: input.blockIndex,
    primitive: input.primitive,
    location_quality: input.location_quality || source.location_quality,
  });
}

function createMeasurementRecord(input = {}) {
  const identity = createPrimitiveIdentity(input.identity || input);
  const source = createSourceLocation(input.source || input.dsl || input.target || {});
  return stripUndefined({
    nodeKind: "MeasurementRecord",
    nodeId: input.nodeId || input.node_id || primitiveNodeId(identity, 0, source),
    identity,
    source,
    dsl: input.dsl || source,
    status: input.status || (input.measurement?.ok === false ? "failed" : "ok"),
    measureSupport: input.measureSupport || input.measure_support || input.primitive?.measureSupport,
    minSize: input.minSize || input.min_size || input.measure?.min_size,
    preferredSize: input.preferredSize || input.preferred_size || input.measure?.preferred_size,
    maxUsefulSize: input.maxUsefulSize || input.max_useful_size || input.measure?.max_useful_size,
    resizePolicy: input.resizePolicy || input.resize_policy || input.measure?.resize_policy,
    resizeLimits: input.resizeLimits || input.resize_limits || input.measure?.resize_limits,
    constraintBox: input.constraintBox || input.constraint_box,
    bounds: input.bounds || input.shape_bounds || input.text_bounds || input.measurement?.shape_bounds || input.measurement?.text_bounds,
    measurement: input.measurement,
    raw: input.raw,
  });
}

function createLayoutBox(input = {}) {
  const identity = createPrimitiveIdentity(input.identity || input);
  const source = createSourceLocation(input.source || input.dsl || input.target || {});
  return stripUndefined({
    nodeKind: "LayoutBox",
    nodeId: input.nodeId || input.node_id || primitiveNodeId(identity, 0, source),
    identity,
    source,
    dsl: input.dsl || source,
    status: input.status || "ok",
    box: input.box || input.area,
    visibleBox: input.visibleBox || input.visible_box || input.visibleArea || input.visible_area,
    measuredBounds: input.measuredBounds || input.measured_bounds,
    measurementRef: input.measurementRef || input.measurement_ref,
    fitPolicy: input.fitPolicy || input.fit_policy,
    resizePolicy: input.resizePolicy || input.resize_policy || input.measure?.resize_policy,
    resizeLimits: input.resizeLimits || input.resize_limits || input.measure?.resize_limits,
    scale: input.scale,
    unusedSpace: input.unusedSpace || input.unused_space,
    readability: input.readability,
    overflow: input.overflow,
    style: input.style || {},
  });
}

function createLayoutContainer(input = {}) {
  const source = createSourceLocation(input.source || input.dsl || input.target || {});
  return stripUndefined({
    nodeKind: "LayoutContainer",
    nodeId: input.nodeId || input.node_id || input.id,
    role: input.role || input.type,
    source,
    dsl: input.dsl || source,
    box: input.box || input.area || input.frame_area,
    bodyBox: input.bodyBox || input.body_box || input.module_body_slot,
    visibleOccupiedBox: input.visibleOccupiedBox || input.visible_occupied_box || input.visibleOccupiedArea || input.visible_occupied_area,
    fill: input.fill,
    parentId: input.parentId || input.parent_id,
    constraints: input.constraints || [],
  });
}

function createLayoutConstraint(input = {}) {
  const target = createSourceLocation(input.target || input.source || input.dsl || {});
  return stripUndefined({
    id: input.id,
    type: input.type,
    axis: input.axis,
    token: input.token,
    value: input.value,
    min: input.min,
    max: input.max,
    expectedGap: input.expectedGap || input.expected_gap,
    actualGaps: input.actualGaps || input.actual_gaps,
    tolerance: input.tolerance,
    allowedValues: input.allowedValues || input.allowed_values,
    members: input.members,
    target,
  });
}

function createAlignmentGroup(input = {}) {
  const target = createSourceLocation(input.target || input.source || input.dsl || {});
  return stripUndefined({
    id: input.id,
    edge: input.edge,
    axis: input.axis,
    tolerance: input.tolerance,
    target,
    members: (input.members || []).map((member) => ({
      nodeId: member.nodeId || member.node_id || member.id,
      source: createSourceLocation(member.source || member.dsl || member.target || {}),
      dsl: member.dsl,
      box: member.box || member.area,
    })),
  });
}

function createIrBase(irKind, input = {}, body = {}) {
  return {
    irKind,
    version: IR_VERSION,
    phase: phaseForIrKind(irKind),
    pageIndex: input.pageIndex,
    pageId: input.pageId,
    sourceMap: (input.sourceMap || []).map(createSourceLocation),
    ...body,
  };
}

function phaseForIrKind(irKind) {
  return {
    DslIr: "dsl_input",
    CompileIr: "compile",
    MeasurementIr: "measure",
    LayoutIr: "layout",
  }[irKind];
}

function primitiveNodeId(identity = {}, index = 0, source = {}) {
  const blockType = identity.blockType || "primitive";
  if (identity.componentId) return `${identity.componentId}:${blockType}`;
  if (source.selector) return source.selector;
  if (source.path) return source.path;
  return [`anonymous-${index}`, blockType].join(":");
}

function requirePhase(phase) {
  if (!VALID_PHASES.has(phase)) throw new Error(`Invalid runtime QA phase: ${phase}`);
  return phase;
}

function inferLocationQuality(input = {}) {
  if (input.artifact) return "artifact_only";
  if (input.selector || input.path || input.sourceSpan) return "dsl_mapped";
  return "page_only";
}

function stripUndefined(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

module.exports = {
  IR_VERSION,
  createCompileIr,
  createDslIr,
  createLayoutIr,
  createMeasurementIr,
  createPhaseResult,
  createPrimitiveIdentity,
  createSourceLocation,
  serializeIrForReview,
};
