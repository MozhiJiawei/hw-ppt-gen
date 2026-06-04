"use strict";

const { createFeedbackIssue } = require("../feedback/feedback_issue");
const { createPhaseResult } = require("./ir_contracts");
const { ANCHOR_ELIGIBILITY, getVisualTemplateContract } = require("../contracts/visual_templates");
const {
  ALLOWED_FONT_FACES,
  ALLOWED_FONT_SIZES_PT,
  STANDARD_LINE_WIDTH_EMU,
  fontSizePtToPptxXml,
  isAllowedColor,
} = require("../contracts/huawei_style_contract");

const ALLOWED_FONT_SIZE_XML_SET = new Set(ALLOWED_FONT_SIZES_PT.map(fontSizePtToPptxXml));
const ALLOWED_FONT_FACE_SET = new Set(ALLOWED_FONT_FACES);

function runRenderExportChecks(artifacts = {}) {
  const issues = [];
  const requiresRenderEvidence = artifacts.requireRenderEvidence === true
    || (Array.isArray(artifacts.contentSlides) && artifacts.contentSlides.length > 0)
    || (Array.isArray(artifacts.planVisuals) && artifacts.planVisuals.length > 0);
  if (!Array.isArray(artifacts.exportedPngs) || (requiresRenderEvidence && !artifacts.renderEvidence)) {
    issues.push(issue("render_evidence_missing", "Required PNG export evidence or rendered visual evidence is missing.", { artifact: "render_evidence" }));
  } else if (Number(artifacts.slideCount || 0) && artifacts.exportedPngs.length !== Number(artifacts.slideCount)) {
    issues.push(issue("render_evidence_incomplete", "Exported PNG count does not match PPT slide count.", {
      details: { expected: artifacts.slideCount, actual: artifacts.exportedPngs.length },
      artifact: "png_export",
    }));
  }

  for (const entry of artifacts.pptxXml || []) {
    const xml = String(entry.xml || "");
    if (/<p:(timing|anim)\b|<p:anim\b/.test(xml)) issues.push(issue("render_animation_forbidden", "PPTX XML contains forbidden animation nodes.", { slide: entry.slide }));
    if (/<p:transition\b/.test(xml)) issues.push(issue("render_transition_forbidden", "PPTX XML contains forbidden transition nodes.", { slide: entry.slide }));
    if (textStyleInvalid(xml)) issues.push(issue("render_text_style_invalid", "PPTX XML contains invalid text style.", { slide: entry.slide }));
    if (shapeStyleInvalid(xml)) issues.push(issue("render_shape_style_invalid", "PPTX XML contains invalid shape style.", { slide: entry.slide }));
  }

  if (artifacts.renderEvidence && !renderEvidenceValid(artifacts.renderEvidence, artifacts)) {
    issues.push(issue("render_visual_evidence_invalid", "Rendered visual evidence is missing, invalid, or contains unrendered entries.", { artifact: "render_evidence" }));
  }
  if (artifacts.renderEvidence && Array.isArray(artifacts.planVisuals) && renderEvidenceMismatch(artifacts.renderEvidence, artifacts.planVisuals)) {
    issues.push(issue("render_visual_evidence_mismatch", "Rendered visual evidence and plan disagree on id, kind, or template.", { artifact: "render_evidence" }));
  }

  for (const [slide, text] of Object.entries(artifacts.visibleTextBySlide || {})) {
    if (/(TODO|TBD|Lorem|待补充|XX)/i.test(text)) {
      issues.push(issue("render_placeholder_present", "Visible slide text contains unfinished placeholder content.", { slide: Number(slide) }));
    }
  }
  for (const required of artifacts.brief?.requiredVisibleText || []) {
    const actual = artifacts.visibleTextBySlide?.[required.slide] || "";
    if (!actual.includes(required.text)) {
      issues.push(issue("render_brief_visible_text_mismatch", "Required brief-backed text is missing from visible slide text.", {
        slide: required.slide,
        details: { expected: required.text, actual },
      }));
    }
  }

  const phaseResult = createPhaseResult({ phase: "render_export", ir: null, diagnostics: issues });
  return { ok: phaseResult.status === "passed", issues, phaseResult };
}

function textStyleInvalid(xml) {
  const sizes = [...xml.matchAll(/\bsz="(\d+)"/g)].map((match) => Number(match[1]));
  if (sizes.some((size) => !ALLOWED_FONT_SIZE_XML_SET.has(size))) return true;
  const faces = [...xml.matchAll(/\btypeface="([^"]+)"/g)].map((match) => match[1]);
  if (faces.some((face) => !ALLOWED_FONT_FACE_SET.has(face))) return true;
  return [...xml.matchAll(/<a:srgbClr val="([0-9A-Fa-f]+)"/g)].some((match) => !isAllowedColor(match[1]));
}

function shapeStyleInvalid(xml) {
  if (!/<p:spPr\b/.test(xml)) return false;
  const colors = [...xml.matchAll(/<a:srgbClr val="([0-9A-Fa-f]+)"/g)].map((match) => match[1]);
  if (colors.some((color) => !isAllowedColor(color))) return true;
  const widths = [...xml.matchAll(/<a:ln w="(\d+)"/g)].map((match) => Number(match[1]));
  return widths.some((width) => width !== STANDARD_LINE_WIDTH_EMU);
}

function renderEvidenceValid(renderEvidence = {}, artifacts = {}) {
  if (!Array.isArray(renderEvidence.slides) || renderEvidence.slides.length === 0) return false;
  if (!renderEvidence.slides.every(isRenderedVisualEvidenceEntry)) return false;
  const contentSlides = Array.isArray(artifacts.contentSlides) ? artifacts.contentSlides : [];
  return contentSlides.every((slide) => renderEvidence.slides.some((entry) => {
    return Number(entry.slide ?? entry.page) === Number(slide)
      && isRealVisualAnchorEntry(entry);
  }));
}

function isRenderedVisualEvidenceEntry(entry) {
  const contract = entry && typeof entry === "object" && !Array.isArray(entry)
    ? getVisualTemplateContract(entry.kind, entry.template)
    : null;
  return entry
    && typeof entry === "object"
    && !Array.isArray(entry)
    && entry.rendered !== false
    && (entry.visual_component_id || entry.id)
    && entry.kind
    && entry.template
    && contract
    && entry.renderer === contract.renderer;
}

function isRealVisualAnchorEntry(entry = {}) {
  const contract = getVisualTemplateContract(entry.kind, entry.template);
  return Boolean(contract)
    && contract.anchorEligibility === ANCHOR_ELIGIBILITY.REAL_ANCHOR
    && entry.visual_role === "visual_anchor"
    && entry.visual_anchor
    && entry.renderer === contract.renderer;
}

function renderEvidenceMismatch(renderEvidence = {}, planVisuals = []) {
  return planVisuals.some((planned) => {
    const entry = (renderEvidence.slides || []).find((item) => {
      const sameId = item.visual_component_id === planned.id || item.id === planned.id;
      const sameSlide = planned.slide === undefined || Number(item.slide ?? item.page) === Number(planned.slide);
      return sameId && sameSlide;
    });
    return !entry
      || entry.kind !== planned.kind
      || entry.template !== planned.template
      || (planned.renderer && entry.renderer !== planned.renderer);
  });
}

function issue(code, message, input = {}) {
  return createFeedbackIssue({
    code,
    phase: "render_export",
    severity: "error",
    location_quality: "artifact_only",
    target: {
      slide: input.slide,
      artifact: input.artifact,
    },
    message,
    details: input.details || {},
  });
}

module.exports = {
  runRenderExportChecks,
};
