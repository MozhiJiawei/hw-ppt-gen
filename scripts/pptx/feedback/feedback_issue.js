"use strict";

const VALID_SEVERITIES = new Set(["error", "warning", "info"]);
const VALID_PHASES = new Set(["compile", "layout", "render", "qa"]);

function createFeedbackIssue(input = {}) {
  const code = safeText(input.code || input.type || "feedback_issue");
  const severity = VALID_SEVERITIES.has(input.severity) ? input.severity : "info";
  const phase = VALID_PHASES.has(input.phase) ? input.phase : inferPhase(input);
  const target = normalizeTarget(input.target, input);
  const details = normalizeDetails(input.details, input);
  const repairs = normalizeRepairs(input.repairs);

  return {
    code,
    severity,
    phase,
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

function normalizeQaIssue(issue = {}) {
  return createFeedbackIssue({
    code: issue.type || issue.code,
    severity: issue.severity,
    phase: issue.phase || "qa",
    target: issue.target || {
      slide: issue.slide,
      moduleIndex: issue.module_index,
      moduleTitle: issue.module_title,
      blockIndex: issue.block_index,
      componentId: issue.visual_component_id || issue.component_id,
    },
    message: issue.message,
    details: issue.details || stripFeedbackKeys(issue),
    repairs: issue.repairs || repairsForIssueType(issue.type || issue.code),
  });
}

function attachFeedbackIssue(legacyIssue = {}, feedbackIssue) {
  const input = feedbackIssue || {
    ...legacyIssue,
    phase: legacyIssue.phase || "qa",
  };
  const feedback = createFeedbackIssue(input);
  return {
    ...legacyIssue,
    phase: legacyIssue.phase || feedback.phase,
    target: legacyIssue.target || feedback.target,
    details: legacyIssue.details || feedback.details,
    repairs: legacyIssue.repairs || feedback.repairs,
    feedback,
  };
}

function repairsForIssueType(type) {
  const key = safeText(type);
  const repairs = {
    text_overflow_estimate: [
      "Shorten the text, split it across blocks, or enlarge the measured text box.",
      "Prefer structured bullets or a compact table instead of prose-heavy paragraphs.",
    ],
    body_layout_text_too_long: [
      "Compress the block into short claim lines.",
      "Move dense comparisons into Matrix/table or KPI readout components.",
    ],
    body_layout_table_frame_too_short: [
      "Increase the table block height.",
      "Reduce rows or cell text, or split the table into another structured block.",
    ],
    body_layout_evidence_too_small: [
      "Give the evidence visual more height or move supporting text out of the module.",
      "Choose a layout with a larger visual slot for the source aspect ratio.",
    ],
    content_visual_anchor_missing: [
      "Add at least one real visual_anchor for the content slide.",
      "Use supporting components only as secondary readouts, not as the proof anchor.",
    ],
    body_layout_infeasible: [
      "Reduce body density, split the module, or move detail to another slide.",
      "Check measured min/preferred sizes before choosing the layout.",
    ],
    analysis_summary_missing: [
      "Render the slide through the fixed Huawei content shell so the 分析总结 band is present.",
      "Populate the slide summary with meaning-specific labels and concise text before rendering.",
    ],
    section_indicator_missing: [
      "Provide sections and currentSection so the fixed top-right section indicator can render.",
      "Route the page through the Huawei content-slide helper instead of hand-drawing the chrome.",
    ],
    line_spacing: [
      "Use the standard 1.5x text line spacing for generated text boxes.",
      "Prefer the repository text helpers instead of custom text box options.",
    ],
    line_width: [
      "Use the standard 0.5pt line width, 6350 EMU, for Huawei chrome and component outlines.",
      "Check custom component line options before rendering.",
    ],
    content_visual_anchor_plan_missing: [
      "Add the missing visual anchor or supporting component to the deck plan.",
      "Ensure planned visual ids, kind, and template match the rendered manifest.",
    ],
    content_visual_anchor_plan_mismatch: [
      "Align the plan visual anchor id, kind, and template with the manifest entry.",
      "Do not silently substitute another visual template during rendering.",
    ],
    content_visual_anchor_manifest_mismatch: [
      "Render the visual through the fixed template implementation selected by kind/template.",
      "Regenerate the manifest after correcting renderer output.",
    ],
    body_layout_schema_invalid: [
      "Use an official Body DSL layout family and matching Module count.",
      "Keep layout tags as placement structure, not visual semantics.",
    ],
  };
  return repairs[key] || [];
}

function normalizeTarget(target = {}, fallback = {}) {
  const normalized = stripUndefined({
    slide: target.slide ?? fallback.slide,
    moduleIndex: target.moduleIndex ?? target.module_index ?? fallback.moduleIndex ?? fallback.module_index,
    moduleTitle: target.moduleTitle ?? target.module_title ?? fallback.moduleTitle ?? fallback.module_title,
    blockIndex: target.blockIndex ?? target.block_index ?? fallback.blockIndex ?? fallback.block_index,
    componentId: target.componentId ?? target.component_id ?? target.visual_component_id ?? fallback.componentId ?? fallback.component_id ?? fallback.visual_component_id,
    path: target.path ?? fallback.path,
    selector: target.selector ?? fallback.selector,
    semanticStack: normalizeSemanticStack(target.semanticStack ?? target.semantic_stack ?? fallback.semanticStack ?? fallback.semantic_stack),
    prop: target.prop ?? fallback.prop,
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
  if (input.type || input.slide !== undefined) return "qa";
  if (input.diagnostic || input.layout_type || input.layoutType) return "layout";
  return "qa";
}

function stripFeedbackKeys(input = {}) {
  const omitted = new Set([
    "code",
    "type",
    "severity",
    "phase",
    "target",
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
  attachFeedbackIssue,
  createFeedbackIssue,
  normalizeLayoutDiagnostic,
  normalizeQaIssue,
  repairsForIssueType,
};
