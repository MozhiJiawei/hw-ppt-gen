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
  const contaminatedText = primitives
    .filter((primitive) => primitive.identity.blockType === "text")
    .flatMap((primitive) => visibleTextMetaContamination(primitive));

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

  for (const contamination of contaminatedText) {
    issues.push(issue("dsl_visible_text_meta_contamination", page, {
      target: contamination.target,
      message: "Visible PPT text contains generation, QA-repair, or cross-page presentation meta commentary instead of source-grounded business content.",
      details: {
        text: contamination.text,
        matchedPattern: contamination.pattern,
      },
      repairs: [
        "Replace process-meta commentary with the business claim proved by this module's evidence.",
        "Do not explain that another page contains the source image; place the source evidence here or remove the meta sentence.",
      ],
    }));
  }

  return withPhaseResult({
    ok: issues.length === 0,
    dslIr: ir.dslIr,
    compileIr: ir.compileIr,
    issues,
  });
}

const META_TEXT_PATTERNS = Object.freeze([
  { name: "cross_page_figure_reference", regex: /\bFigure\s*\d+[\s\S]{0,24}\bPage\s*\d+\b/i },
  { name: "cross_page_chinese_reference", regex: /(?:原图|源图|证据图)[\s\S]{0,12}(?:Page|第?\s*\d+\s*页|本页|另[一个]页|放大呈现)/i },
  { name: "summary_process_meta", regex: /\bSummary\b[\s\S]{0,24}(?:压缩|概览|呈现|替代)/i },
  { name: "repair_rationale_visible", regex: /(?:不替代|保留证据|保留源图|QA|runtime|修复|降级|proof tier|source evidence|generated drawing)/i },
]);

function visibleTextMetaContamination(primitive = {}) {
  const body = primitive.primitive?.body;
  const lines = Array.isArray(body) ? body : [body].filter(Boolean);
  const out = [];
  for (const line of lines) {
    const text = String(line || "").trim();
    if (!text) continue;
    const match = META_TEXT_PATTERNS.find((entry) => entry.regex.test(text));
    if (match) {
      out.push({
        text,
        pattern: match.name,
        target: primitive.dsl || primitive.source || primitive.sourceComponent,
      });
    }
  }
  return out;
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
    severity: "error",
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
