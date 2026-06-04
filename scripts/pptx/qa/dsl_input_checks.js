"use strict";

const { createFeedbackIssue } = require("../feedback/feedback_issue");
const { compilePageBodyDslToIr } = require("./compile_ir");
const { createPhaseResult } = require("./ir_contracts");

function runDslInputChecks(page = {}) {
  const issues = [];
  if (!page.bodyDsl) {
    return withPhaseResult({
      ok: false,
      dslIr: null,
      compileIr: null,
      issues: [issue("dsl_page_missing_body", page, {
        message: "Content page is missing bodyDsl for the runtime pipeline.",
        location_quality: "page_only",
      })],
    });
  }

  let ir;
  try {
    ir = compilePageBodyDslToIr(page);
  } catch (error) {
    issues.push(issue("dsl_body_not_compilable", page, {
      message: "Body DSL cannot be parsed or compiled into runtime IR.",
      target: error.target,
      details: { cause: error.message },
    }));
    return withPhaseResult({ ok: false, dslIr: null, compileIr: null, issues });
  }

  const compilerErrors = (ir.issues || []).filter((item) => item.severity === "error");
  if (compilerErrors.length) {
    issues.push(issue("dsl_body_not_compilable", page, {
      target: bestTarget(compilerErrors, page),
      message: "Body DSL cannot compile into a render model consumable by measurement/layout.",
      details: { compilerIssues: compilerErrors },
    }));
    for (const compilerIssue of compilerErrors.filter(isTraceCompilerIssue)) {
      issues.push(issue("dsl_source_trace_missing", page, {
        target: compilerIssue.target,
        message: "Visual anchor is missing traceability fields required by downstream evidence reporting.",
        details: { compilerIssue },
        repairs: ["Add id, claim, and source evidence to the visual anchor component."],
      }));
    }
  }

  const primitives = ir.compileIr?.visiblePrimitives || [];
  const anchors = primitives.filter((primitive) => primitive.identity.blockType === "visual_anchor");

  for (const anchor of anchors) {
    const visual = anchor.primitive?.visual_anchor || {};
    const missing = ["id", "claim", "source"].filter((key) => !visual[key]);
    if (missing.length) {
      issues.push(issue("dsl_source_trace_missing", page, {
        target: anchor.dsl,
        message: "Visual anchor is missing traceability fields required by downstream evidence reporting.",
        details: { componentId: anchor.identity.componentId, missing },
        repairs: ["Add id, claim, and source evidence to the visual anchor component."],
      }));
    }
  }

  issues.push(...applyVisualAnchorMemory(page, ir.compileIr));

  return withPhaseResult({
    ok: !issues.some((item) => item.severity === "error"),
    dslIr: ir.dslIr,
    compileIr: ir.compileIr,
    issues,
  });
}

function withPhaseResult(result = {}) {
  return {
    ...result,
    phaseResult: createPhaseResult({
      phase: "dsl_input",
      ir: result.dslIr || null,
      diagnostics: result.issues || [],
    }),
  };
}

function applyVisualAnchorMemory(page = {}, compileIr = {}) {
  const memory = page.anchorMemory;
  if (!memory || typeof memory !== "object") return [];
  if (!memory.entries) memory.entries = {};
  const pageKey = String(page.pageId || `page-${Number(page.pageIndex ?? 0) + 1}`);
  const anchors = collectPrimaryModuleAnchors(pageKey, compileIr);
  const out = [];
  for (const anchor of anchors) {
    const previous = memory.entries[anchor.key];
    if (!previous) {
      memory.entries[anchor.key] = anchor;
      out.push(issue("dsl_visual_anchor_memory_recorded", page, {
        severity: "info",
        target: anchor.target,
        message: `Visual anchor memory recorded for this block: ${anchor.proofClass}. Future edits must keep the same anchor type.`,
        details: { anchorMemory: anchor },
      }));
      continue;
    }
    if (previous.proofClass !== anchor.proofClass) {
      out.push(issue("dsl_visual_anchor_type_changed", page, {
        target: anchor.target,
        message: `Visual anchor type changed from ${previous.proofClass} to ${anchor.proofClass}. Anchor memory locks each block's proof type after the first successful DSL compile.`,
        details: { previousAnchor: previous, currentAnchor: anchor },
        repairs: [
          `Restore this block's ${previous.proofClass} anchor.`,
          "If the original evidence cannot fit, keep the source evidence and add source-grounded supporting content or report the layout as not fit instead of downgrading the anchor type.",
        ],
      }));
      continue;
    }
    memory.entries[anchor.key] = { ...previous, lastSeen: anchor };
    out.push(issue("dsl_visual_anchor_memory_checked", page, {
      severity: "info",
      target: anchor.target,
      message: `Visual anchor memory checked for this block: ${anchor.proofClass} remains locked.`,
      details: { previousAnchor: previous, currentAnchor: anchor },
    }));
  }
  return out;
}

function collectPrimaryModuleAnchors(pageKey, compileIr = {}) {
  const byModule = new Map();
  for (const primitive of compileIr.visiblePrimitives || []) {
    if (primitive.identity?.blockType !== "visual_anchor") continue;
    if (!byModule.has(primitive.moduleIndex)) byModule.set(primitive.moduleIndex, primitive);
  }
  return [...byModule.entries()].map(([moduleIndex, primitive]) => {
    const visual = primitive.primitive?.visual_anchor || {};
    const target = primitive.dsl || primitive.source || primitive.sourceComponent || {};
    return {
      key: `${pageKey}:module:${moduleIndex}:primary_visual_anchor`,
      pageKey,
      moduleIndex,
      proofClass: visual.kind === "Evidence" ? "source_evidence" : "generated_drawing",
      kind: visual.kind,
      template: visual.template,
      componentId: visual.id || primitive.identity?.componentId,
      sourceKey: sourceIdentity(visual.source),
      selector: target.selector,
      target,
    };
  });
}

function sourceIdentity(source) {
  if (!source) return "";
  if (typeof source === "string") return source;
  return source.path || source.caption || source.id || "";
}

function isTraceCompilerIssue(issue = {}) {
  const missingProps = issue.details?.missingProps || [];
  const componentTag = issue.details?.componentTag || issue.details?.tag;
  return issue.code === "dsl_component_prop_invalid"
    && /Evidence|Visual/.test(String(componentTag || ""))
    && missingProps.some((prop) => ["id", "claim", "source"].includes(prop));
}

function issue(code, page = {}, input = {}) {
  return createFeedbackIssue({
    code,
    phase: "dsl_input",
    severity: input.severity || "error",
    location_quality: input.location_quality || ((input.target?.selector || input.target?.sourceSpan) ? "dsl_mapped" : "page_only"),
    target: {
      pageIndex: page.pageIndex,
      pageId: page.pageId,
      ...(input.target || {}),
    },
    message: input.message || code,
    details: input.details || {},
    repairs: input.repairs || [],
  });
}

function bestTarget(compilerErrors = [], page = {}) {
  const target = compilerErrors.find((item) => item.target?.selector)?.target || compilerErrors[0]?.target || {};
  return { pageIndex: page.pageIndex, pageId: page.pageId, ...target };
}

module.exports = {
  runDslInputChecks,
};
