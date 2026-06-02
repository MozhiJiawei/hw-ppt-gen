"use strict";

const { createFeedbackIssue } = require("../feedback/feedback_issue");
const { createLayoutIr, createPhaseResult } = require("./ir_contracts");
const {
  ALLOWED_FONT_FACES,
  ALLOWED_FONT_SIZES_PT,
  STANDARD_LINE_WIDTH_PT,
  isAllowedColor,
} = require("../contracts/huawei_style_contract");

const ALLOWED_FONT_SIZE_SET = new Set(ALLOWED_FONT_SIZES_PT);
const ALLOWED_FONT_FACE_SET = new Set(ALLOWED_FONT_FACES);

function normalizeLayoutIr(input = {}) {
  return createLayoutIr({
    pageIndex: input.pageIndex,
    pageId: input.pageId,
    status: input.status || "ok",
    bodyBounds: input.bodyBounds || input.pageBounds || { x: 0, y: 0, w: 13.333, h: 7.5 },
    expectedPrimitives: input.expectedPrimitives || [],
    measuredPrimitives: input.measuredPrimitives || [],
    records: input.records || input.placements || [],
    diagnostics: input.diagnostics || [],
  });
}

function runLayoutChecks(input = {}) {
  const ir = normalizeLayoutIr(input);
  const issues = [];
  if (["infeasible", "unsupported", "legacy_fallback"].includes(ir.status)) {
    issues.push(issue("layout_page_infeasible", ir, {}, "Page/module layout is not feasible for rendering."));
  }

  const recordsById = new Map(ir.records.map((record) => [nodeKey(record), record]));
  const placementSubjects = (ir.measuredPrimitives && ir.measuredPrimitives.length)
    ? ir.measuredPrimitives
    : (ir.expectedPrimitives || []);
  for (const expected of placementSubjects) {
    const record = recordsById.get(nodeKey(expected));
    if (!record) {
      issues.push(issue("layout_component_unplaced", ir, expected, "Measured visible primitive has no final layout box."));
    }
  }

  for (const record of ir.records) {
    if (!validBox(record.box || record.area)) {
      issues.push(issue("layout_box_invalid", ir, record, "Final layout box is missing or invalid."));
      continue;
    }
    const box = record.box || record.area;
    if (!inside(box, ir.bodyBounds)) {
      issues.push(issue("layout_component_out_of_bounds", ir, record, "Final layout box escapes the page/body bounds."));
    }
    if (isText(record) && textDoesNotFit(record)) {
      issues.push(issue("layout_text_does_not_fit", ir, record, "Measured text cannot fit inside the final text box."));
    }
    const style = record.style || {};
    if (isText(record) && style.fontSize !== undefined && !ALLOWED_FONT_SIZE_SET.has(Number(style.fontSize))) {
      issues.push(issue("layout_text_font_size_invalid", ir, record, "Resolved text font size is outside the Huawei allowlist.", { value: style.fontSize }));
    }
    if (isText(record) && style.fontFace && !ALLOWED_FONT_FACE_SET.has(style.fontFace)) {
      issues.push(issue("layout_text_font_face_invalid", ir, record, "Resolved text font face is outside the allowed font set.", { value: style.fontFace }));
    }
    if (isText(record) && style.textColor && !isAllowedColor(style.textColor)) {
      issues.push(issue("layout_text_color_invalid", ir, record, "Resolved text color is outside the allowed palette.", { value: style.textColor }));
    }
    if ((style.fillColor && !isAllowedColor(style.fillColor)) || (style.lineColor && !isAllowedColor(style.lineColor))) {
      issues.push(issue("layout_shape_color_invalid", ir, record, "Resolved shape fill or line color is outside the allowed palette.", { fillColor: style.fillColor, lineColor: style.lineColor }));
    }
    if (style.lineWidth !== undefined && Math.abs(Number(style.lineWidth) - STANDARD_LINE_WIDTH_PT) > 0.001) {
      issues.push(issue("layout_line_width_invalid", ir, record, "Resolved line width is not the standard value.", { value: style.lineWidth }));
    }
  }

  const phaseResult = createPhaseResult({ phase: "layout", ir, diagnostics: issues });
  return { ok: phaseResult.status === "passed", ir, issues, phaseResult };
}

function nodeKey(item = {}) {
  const identity = item.identity || item;
  return item.source?.selector
    || item.source?.path
    || item.dsl?.selector
    || item.dsl?.path
    || item.nodeId
    || [
      identity.componentId || identity.component_id || identity.id,
      identity.blockType || identity.block_type || identity.type,
      item.moduleIndex,
      item.blockIndex,
    ].filter((value) => value !== undefined && value !== null).join("::");
}

function validBox(box = {}) {
  return ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(box[key])))
    && Number(box.w) > 0 && Number(box.h) > 0;
}

function inside(box = {}, bounds = {}) {
  const slack = 0.03;
  return Number(box.x) >= Number(bounds.x || 0) - slack
    && Number(box.y) >= Number(bounds.y || 0) - slack
    && Number(box.x) + Number(box.w) <= Number(bounds.x || 0) + Number(bounds.w || 0) + slack
    && Number(box.y) + Number(box.h) <= Number(bounds.y || 0) + Number(bounds.h || 0) + slack;
}

function isText(record = {}) {
  const identity = record.identity || record;
  return identity.blockType === "text" || identity.block_type === "text" || identity.type === "text";
}

function textDoesNotFit(record = {}) {
  const box = record.box || record.area || {};
  const measured = record.measuredBounds || record.measured_bounds || {};
  return Number(measured.w || 0) > Number(box.w || 0) + 0.01 || Number(measured.h || 0) > Number(box.h || 0) + 0.01;
}

function issue(code, ir, item = {}, message, details = {}) {
  const dsl = item.source || item.dsl || item.target || {};
  return createFeedbackIssue({
    code,
    phase: "layout",
    severity: "error",
    location_quality: dsl.selector ? "dsl_mapped" : "page_only",
    target: {
      pageIndex: ir.pageIndex,
      pageId: ir.pageId,
      ...dsl,
      componentId: item.identity?.componentId || dsl.id,
    },
    message,
    details: {
      identity: item.identity,
      box: item.box || item.area,
      ...details,
    },
  });
}

module.exports = {
  normalizeLayoutIr,
  runLayoutChecks,
};
