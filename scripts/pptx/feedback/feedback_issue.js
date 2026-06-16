"use strict";

const VALID_SEVERITIES = new Set(["error", "warning", "info"]);
const VALID_PHASES = new Set(["dsl_input", "compile", "measure", "layout", "render", "render_export"]);
const VALID_LOCATION_QUALITIES = new Set(["dsl_mapped", "page_only", "artifact_only"]);

function createFeedbackIssue(input = {}) {
  const code = safeText(input.code || input.type || "feedback_issue");
  const severity = VALID_SEVERITIES.has(input.severity) ? input.severity : "info";
  const phase = VALID_PHASES.has(input.phase) ? input.phase : inferPhase(input);
  const target = normalizeTarget(input.target, input);
  const details = normalizeDetails(input.details, input);
  const repairs = normalizeRepairs(input.repairs);
  const locationQuality = VALID_LOCATION_QUALITIES.has(input.location_quality || input.locationQuality)
    ? (input.location_quality || input.locationQuality)
    : inferLocationQuality(target, input);

  return {
    code,
    severity,
    phase,
    location_quality: locationQuality,
    target,
    message: safeText(input.message || code),
    details,
    repairs,
  };
}

function normalizeLayoutDiagnostic(diagnostic = {}, context = {}) {
  return createFeedbackIssue({
    code: diagnostic.code,
    severity: diagnostic.severity,
    phase: "layout",
    target: {
      ...normalizeTarget(diagnostic.target, diagnostic),
      ...stripUndefined({
        slide: context.slide,
        moduleIndex: context.moduleIndex,
        moduleTitle: context.moduleTitle,
        blockIndex: context.blockIndex,
        componentId: context.componentId,
      }),
      moduleIndex: context.moduleIndex ?? diagnostic.moduleIndex ?? diagnostic.module_index ?? diagnostic.target?.moduleIndex ?? diagnostic.target?.module_index,
      moduleTitle: context.moduleTitle || diagnostic.moduleTitle || diagnostic.module_title || diagnostic.target?.moduleTitle || diagnostic.target?.module_title,
      blockIndex: context.blockIndex ?? diagnostic.blockIndex ?? diagnostic.block_index ?? diagnostic.index ?? diagnostic.target?.blockIndex ?? diagnostic.target?.block_index,
      componentId: context.componentId || diagnostic.componentId || diagnostic.component_id || diagnostic.visual_component_id || diagnostic.target?.componentId || diagnostic.target?.component_id,
    },
    message: diagnostic.message,
    details: {
      ...stripFeedbackKeys(diagnostic),
      ...stripUndefined({
        layout_type: context.layoutType,
        box: context.box || diagnostic.box,
      }),
    },
    repairs: diagnostic.repairs,
  });
}

function normalizeTarget(target = {}, fallback = {}) {
  const normalized = stripUndefined({
    slide: target.slide ?? fallback.slide,
    pageIndex: target.pageIndex ?? target.page_index ?? fallback.pageIndex ?? fallback.page_index,
    pageId: target.pageId ?? target.page_id ?? fallback.pageId ?? fallback.page_id,
    artifact: target.artifact ?? fallback.artifact,
    schemaPath: target.schemaPath ?? target.schema_path ?? fallback.schemaPath ?? fallback.schema_path,
    nodeId: target.nodeId ?? target.node_id ?? fallback.nodeId ?? fallback.node_id,
    moduleIndex: target.moduleIndex ?? target.module_index ?? fallback.moduleIndex ?? fallback.module_index,
    moduleTitle: target.moduleTitle ?? target.module_title ?? fallback.moduleTitle ?? fallback.module_title,
    blockIndex: target.blockIndex ?? target.block_index ?? fallback.blockIndex ?? fallback.block_index,
    componentId: target.componentId ?? target.component_id ?? target.visual_component_id ?? fallback.componentId ?? fallback.component_id ?? fallback.visual_component_id,
    path: target.path ?? fallback.path,
    selector: target.selector ?? fallback.selector,
    sourceSpan: target.sourceSpan ?? target.source_span ?? fallback.sourceSpan ?? fallback.source_span,
    codeFrame: target.codeFrame ?? target.code_frame ?? fallback.codeFrame ?? fallback.code_frame,
    semanticStack: normalizeSemanticStack(target.semanticStack ?? target.semantic_stack ?? fallback.semanticStack ?? fallback.semantic_stack),
    prop: target.prop ?? fallback.prop,
    kind: target.kind ?? fallback.kind,
    template: target.template ?? fallback.template,
    visual_role: target.visual_role ?? target.visualRole ?? fallback.visual_role ?? fallback.visualRole,
  });
  return normalized;
}

function normalizeSemanticStack(stack) {
  if (!Array.isArray(stack)) return undefined;
  const frames = stack
    .map((frame) => {
      if (!frame || typeof frame !== "object") return null;
      return stripUndefined({
        tag: safeText(frame.tag),
        id: safeText(frame.id),
        title: safeText(frame.title),
        path: safeText(frame.path),
        selector: safeText(frame.selector),
        sourceSpan: frame.sourceSpan ?? frame.source_span,
        codeFrame: safeText(frame.codeFrame ?? frame.code_frame),
      });
    })
    .filter((frame) => frame && frame.tag);
  return frames.length ? frames : undefined;
}

function normalizeDetails(details, source = {}) {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return stripUndefined({ ...details });
  }
  return stripFeedbackKeys(source);
}

function normalizeRepairs(repairs) {
  if (!Array.isArray(repairs)) return [];
  return repairs.map((item) => safeText(item)).filter(Boolean);
}

function inferPhase(input = {}) {
  if (input.diagnostic || input.layout_type || input.layoutType) return "layout";
  return "compile";
}

function inferLocationQuality(target = {}, input = {}) {
  if (input.artifact || target.artifact) return "artifact_only";
  if (target.selector || target.path || target.semanticStack) return "dsl_mapped";
  return "page_only";
}

function stripFeedbackKeys(input = {}) {
  const omitted = new Set([
    "code",
    "type",
    "severity",
    "phase",
    "target",
    "sourceSpan",
    "source_span",
    "codeFrame",
    "code_frame",
    "message",
    "details",
    "repairs",
    "feedback",
  ]);
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!omitted.has(key) && value !== undefined) out[key] = value;
  }
  return out;
}

function stripUndefined(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
}

function safeText(value) {
  return String(value ?? "").trim();
}

module.exports = {
  createFeedbackIssue,
  normalizeLayoutDiagnostic,
};
