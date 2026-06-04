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
    pageBounds: input.pageBounds || input.page_bounds,
    status: input.status || "ok",
    bodyBounds: input.bodyBounds || input.pageBounds || { x: 0, y: 0, w: 13.333, h: 7.5 },
    layoutType: input.layoutType || input.layout_type,
    containers: input.containers || [],
    constraints: input.constraints || [],
    alignmentGroups: input.alignmentGroups || input.alignment_groups || [],
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
    if (hasOverflow(record.overflow)) {
      issues.push(issue("layout_box_overflow", ir, record, "Layout box reports unresolved overflow before rendering.", { overflow: record.overflow }));
    }
    if (visualReadabilityFailed(record)) {
      issues.push(issue("layout_visual_slot_readability_failed", ir, record, "Visual slot is below the declared readability floor.", { readability: record.readability }));
    }
    if (evidenceStretched(record)) {
      issues.push(issue("layout_evidence_stretched", ir, record, "Evidence visual is configured to stretch instead of preserving source aspect ratio.", { fitPolicy: record.fitPolicy }));
    }
    if (visualScaleOutOfRange(record)) {
      issues.push(issue("layout_visual_scale_out_of_range", ir, record, "Visual element scale exceeds the measurement readability envelope.", {
        scale: record.scale,
        resizeLimits: record.resizeLimits,
      }));
    }
    if (visualAxisDistorted(record)) {
      issues.push(issue("layout_visual_axis_distortion", ir, record, "Visual element single-axis scaling exceeds the distortion envelope.", {
        scale: record.scale,
        resizeLimits: record.resizeLimits,
      }));
    }
    if (visualSlotUnderfilled(record)) {
      issues.push(issue("layout_visual_slot_underfilled", ir, record, "Visual element leaves excessive unused space inside its allocated slot. Preserve the current proof tier; when the anchor is source evidence, keep the original evidence. Review the source material for the module claim and add source-grounded visual or text content that supports that same viewpoint.", {
        unusedSpace: record.unusedSpace,
      }));
    }
  }

  for (const constraint of ir.constraints || []) {
    if (constraint.type === "spacing" && spacingInvalid(constraint)) {
      issues.push(issue("layout_spacing_token_invalid", ir, constraint, "Resolved spacing is not on the layout spacing scale or is below the minimum.", {
        token: constraint.token,
        value: constraint.value,
        allowedValues: constraint.allowedValues,
        min: constraint.min,
      }));
    }
    if (constraint.type === "distribution" && distributionInvalid(constraint)) {
      issues.push(issue("layout_distribution_failed", ir, constraint, "Resolved distribution gaps drift beyond tolerance.", {
        axis: constraint.axis,
        expectedGap: constraint.expectedGap,
        actualGaps: constraint.actualGaps,
        tolerance: constraint.tolerance,
      }));
    }
  }

  for (const group of ir.alignmentGroups || []) {
    if (alignmentInvalid(group)) {
      issues.push(issue("layout_alignment_group_failed", ir, group, "Alignment group members drift beyond tolerance.", {
        edge: group.edge,
        tolerance: group.tolerance,
        members: group.members,
      }));
    }
  }

  for (const container of ir.containers || []) {
    const blockGap = blockGapExcessive(container, ir.records || []);
    if (blockGap) {
      issues.push(issue("layout_block_gap_excessive", ir, blockGap.record, "Adjacent blocks inside one module are separated by excessive blank space. Preserve the module's current proof tier; if it uses source evidence, keep that original evidence. Review the source material for this module's claim and add source-grounded visual or text content that strengthens the same viewpoint.", {
        container: container.nodeId,
        bodyBox: container.bodyBox,
        previousBlock: blockGap.previousBlock,
        currentBlock: blockGap.currentBlock,
        gap: blockGap.gap,
        gapRatio: blockGap.gapRatio,
        maxGap: blockGap.maxGap,
        maxGapRatio: blockGap.maxGapRatio,
      }));
    }
    const textBudget = textColumnBudgetExceeded(container, ir.records || []);
    if (textBudget) {
      issues.push(issue("layout_text_column_budget_exceeded", ir, textBudget.record, "Editable text consumes too much of the column body slot. If the module already has source evidence, preserve it; compress the explanation into source-grounded conclusions or add a generated diagram only as secondary explanation.", {
        container: container.nodeId,
        bodyBox: container.bodyBox,
        textHeight: textBudget.textHeight,
        bodyHeight: textBudget.bodyHeight,
        ratio: textBudget.ratio,
        maxRatio: textBudget.maxRatio,
        textRecords: textBudget.textRecords,
      }));
    }
    if (moduleFillLow(container)) {
      issues.push(issue("layout_module_fill_low", ir, container, "Module visible content leaves excessive empty space inside the body slot. Review the source material for this module's claim and add source-grounded supporting content before weakening the evidence anchor.", {
        bodyBox: container.bodyBox,
        visibleOccupiedBox: container.visibleOccupiedBox,
        fill: container.fill,
      }));
    }
    if (moduleContentDensityLow(container)) {
      issues.push(issue("layout_content_density_low", ir, container, "Module content density is too low after layout. Review the original source text for this module's claim and add source-grounded conclusions, evidence boundaries, or supporting facts. Use KPI/table only when content semantics require metrics or row/column comparison.", {
        bodyBox: container.bodyBox,
        visibleOccupiedBox: container.visibleOccupiedBox,
        fill: container.fill,
      }));
    }
  }

  for (const diagnostic of ir.diagnostics || []) {
    if (diagnostic?.code === "layout_stack_forced_scale" || diagnostic?.code === "layout_row_forced_scale") {
      issues.push(issue("layout_forced_scale_present", ir, diagnostic, "Layout solver had to force-scale content below declared minimum sizes.", diagnostic));
    }
    if (diagnostic?.code === "layout_internal_gap_excessive" || (diagnostic?.code === "layout_stack_gap_expand" && internalGapExcessive(diagnostic))) {
      issues.push(issue("layout_internal_gap_excessive", ir, diagnostic, "Column content still has excessive internal blank space after adaptive layout. Preserve the current proof tier; if the module uses source evidence, keep it. Review the source material and add source-grounded visual or text content around the same claim.", diagnostic));
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

function hasOverflow(overflow = {}) {
  if (!overflow || typeof overflow !== "object") return false;
  return overflow.x === true
    || overflow.y === true
    || Number(overflow.amountX || overflow.amount_x || 0) > 0.01
    || Number(overflow.amountY || overflow.amount_y || 0) > 0.01;
}

function visualReadabilityFailed(record = {}) {
  if (!isVisual(record)) return false;
  const readability = record.readability || {};
  if (readability.ok === false) return true;
  const visible = record.visibleBox || record.visible_box || record.visibleArea || record.visible_area || record.box || record.area || {};
  const actualArea = Number(readability.actualArea || readability.actual_area || (Number(visible.w || 0) * Number(visible.h || 0)));
  const minArea = Number(readability.minArea || readability.min_area || 0);
  const minW = Number(readability.minW || readability.min_w || 0);
  const minH = Number(readability.minH || readability.min_h || 0);
  return (minArea > 0 && actualArea < minArea - 0.001)
    || (minW > 0 && Number(visible.w || 0) < minW - 0.001)
    || (minH > 0 && Number(visible.h || 0) < minH - 0.001);
}

function evidenceStretched(record = {}) {
  return isEvidence(record) && String(record.fitPolicy || record.fit_policy || "").toLowerCase() === "stretch";
}

function visualScaleOutOfRange(record = {}) {
  if (!isVisual(record)) return false;
  const limits = record.resizeLimits || record.resize_limits || {};
  const uniformLimit = limits.uniformScale || limits.uniform_scale;
  if (!uniformLimit) return false;
  const scale = Number(record.scale?.uniform ?? record.scale?.uniformScale ?? record.scale?.uniform_scale);
  if (!Number.isFinite(scale)) return false;
  return scale < Number(uniformLimit.min ?? 0.7) - 0.001 || scale > Number(uniformLimit.max ?? 1.3) + 0.001;
}

function visualAxisDistorted(record = {}) {
  if (!isVisual(record)) return false;
  const limits = record.resizeLimits || record.resize_limits || {};
  const axisLimit = limits.axisScale || limits.axis_scale;
  if (!axisLimit) return false;
  const scaleX = Number(record.scale?.x ?? record.scale?.scaleX ?? record.scale?.scale_x);
  const scaleY = Number(record.scale?.y ?? record.scale?.scaleY ?? record.scale?.scale_y);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return false;
  const distortion = Number(record.scale?.distortion || Math.max(scaleX / Math.max(0.001, scaleY), scaleY / Math.max(0.001, scaleX)));
  return distortion > Number(axisLimit.max ?? 1.2) + 0.001;
}

function visualSlotUnderfilled(record = {}) {
  if (!isVisual(record)) return false;
  const unused = record.unusedSpace || record.unused_space || {};
  const areaRatio = Number(unused.areaRatio ?? unused.area_ratio ?? 0);
  const xRatio = Number(unused.xRatio ?? unused.x_ratio ?? 0);
  const yRatio = Number(unused.yRatio ?? unused.y_ratio ?? 0);
  return areaRatio > 0.33 + 0.001 || xRatio > 0.28 + 0.001 || yRatio > 0.28 + 0.001;
}

function isVisual(record = {}) {
  const identity = record.identity || record;
  return identity.blockType === "visual_anchor"
    || identity.block_type === "visual_anchor"
    || identity.type === "visual_anchor"
    || identity.blockType === "supporting_component"
    || identity.block_type === "supporting_component"
    || identity.type === "supporting_component"
    || record.visual_role === "visual_anchor"
    || record.visual_role === "supporting_component";
}

function isEvidence(record = {}) {
  const identity = record.identity || record;
  return isVisual(record) && String(identity.kind || record.kind || "").toLowerCase() === "evidence";
}

function spacingInvalid(constraint = {}) {
  const value = Number(constraint.value);
  if (!Number.isFinite(value)) return true;
  if (constraint.min !== undefined && value < Number(constraint.min) - 0.001) return true;
  const allowed = Array.isArray(constraint.allowedValues) ? constraint.allowedValues : [];
  if (!allowed.length) return false;
  return !allowed.some((item) => Math.abs(Number(item) - value) <= 0.001);
}

function distributionInvalid(constraint = {}) {
  const tolerance = Number(constraint.tolerance ?? 0.03);
  const actualGaps = Array.isArray(constraint.actualGaps) ? constraint.actualGaps.map(Number) : [];
  if (actualGaps.length && Number.isFinite(Number(constraint.expectedGap))) {
    const expected = Number(constraint.expectedGap);
    return actualGaps.some((gap) => Math.abs(gap - expected) > tolerance);
  }
  const members = Array.isArray(constraint.members) ? constraint.members : [];
  if (members.length < 3) return false;
  const axis = constraint.axis || "x";
  const boxes = members.map((member) => member.box || member.area).filter(validBox);
  if (boxes.length < 3) return false;
  const gaps = sortedGaps(boxes, axis);
  if (gaps.length < 2) return false;
  const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  return gaps.some((gap) => Math.abs(gap - average) > tolerance);
}

function sortedGaps(boxes = [], axis = "x") {
  const start = axis === "y" ? "y" : "x";
  const size = axis === "y" ? "h" : "w";
  const sorted = [...boxes].sort((a, b) => Number(a[start]) - Number(b[start]));
  const gaps = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    gaps.push(Number(sorted[index + 1][start]) - (Number(sorted[index][start]) + Number(sorted[index][size])));
  }
  return gaps;
}

function alignmentInvalid(group = {}) {
  const tolerance = Number(group.tolerance ?? 0.03);
  const values = (group.members || [])
    .map((member) => alignmentValue(member.box || member.area, group.edge || group.axis))
    .filter((value) => Number.isFinite(value));
  if (values.length < 2) return false;
  return Math.max(...values) - Math.min(...values) > tolerance;
}

function alignmentValue(box = {}, edge = "top") {
  if (!validBox(box)) return NaN;
  if (edge === "bottom") return Number(box.y) + Number(box.h);
  if (edge === "left") return Number(box.x);
  if (edge === "right") return Number(box.x) + Number(box.w);
  if (edge === "center_x" || edge === "centerX" || edge === "x") return Number(box.x) + Number(box.w) / 2;
  if (edge === "center_y" || edge === "centerY" || edge === "y") return Number(box.y) + Number(box.h) / 2;
  return Number(box.y);
}

function moduleFillLow(container = {}) {
  if (container.role !== "module") return false;
  if (!validBox(container.bodyBox) || !validBox(container.visibleOccupiedBox)) return false;
  const minRatio = Number(container.fill?.minRatio ?? container.fill?.min_ratio ?? 0.75);
  const maxBottomSlack = Number(container.fill?.maxBottomSlack ?? container.fill?.max_bottom_slack ?? 0.45);
  const body = container.bodyBox;
  const occupied = container.visibleOccupiedBox;
  const ratio = Number(occupied.h || 0) / Math.max(0.001, Number(body.h || 0));
  const bottomSlack = Number(body.y || 0) + Number(body.h || 0) - (Number(occupied.y || 0) + Number(occupied.h || 0));
  return ratio < minRatio - 0.001 || bottomSlack > maxBottomSlack + 0.001;
}

function moduleContentDensityLow(container = {}) {
  if (container.role !== "module") return false;
  if (!validBox(container.bodyBox) || !validBox(container.visibleOccupiedBox)) return false;
  const minVisibleAreaRatio = Number(container.fill?.minVisibleAreaRatio ?? container.fill?.min_visible_area_ratio ?? 0);
  if (!minVisibleAreaRatio) return false;
  const body = container.bodyBox;
  const occupied = container.visibleOccupiedBox;
  const ratio = (Number(occupied.w || 0) * Number(occupied.h || 0))
    / Math.max(0.001, Number(body.w || 0) * Number(body.h || 0));
  return ratio < minVisibleAreaRatio - 0.001;
}

function internalGapExcessive(diagnostic = {}) {
  return Number(diagnostic.slack_h || diagnostic.slackH || 0) > 1.1
    || Number(diagnostic.gap || 0) > 0.85;
}

function blockGapExcessive(container = {}, records = []) {
  if (container.role !== "module") return null;
  if (!validBox(container.bodyBox)) return null;
  const maxGap = Number(container.fill?.maxBlockGap ?? container.fill?.max_block_gap ?? 0.45);
  const maxGapRatio = Number(container.fill?.maxBlockGapRatio ?? container.fill?.max_block_gap_ratio ?? 0.13);
  const bodyHeight = Number(container.bodyBox.h || 0);
  const members = records
    .filter((record) => recordInsideContainer(record, container))
    .map((record) => ({ record, box: record.visibleBox || record.visible_box || record.box || record.area || {} }))
    .filter((item) => validBox(item.box))
    .sort((a, b) => Number(a.box.y) - Number(b.box.y));
  if (members.length < 2) return null;
  let worst = null;
  for (let index = 0; index < members.length - 1; index += 1) {
    const previous = members[index];
    const current = members[index + 1];
    const previousBottom = Number(previous.box.y || 0) + Number(previous.box.h || 0);
    const gap = Number(current.box.y || 0) - previousBottom;
    if (gap <= 0.001) continue;
    const gapRatio = gap / Math.max(0.001, bodyHeight);
    const excessive = gap > maxGap + 0.001 || gapRatio > maxGapRatio + 0.001;
    if (!excessive) continue;
    if (!worst || gap > worst.gap) {
      worst = {
        record: current.record,
        previousBlock: blockGapRecord(previous.record, previous.box),
        currentBlock: blockGapRecord(current.record, current.box),
        gap: round(gap),
        gapRatio: round(gapRatio),
        maxGap,
        maxGapRatio,
      };
    }
  }
  return worst;
}

function blockGapRecord(record = {}, box = {}) {
  return {
    nodeId: record.nodeId,
    selector: record.dsl?.selector || record.source?.selector,
    componentId: record.identity?.componentId,
    blockType: record.identity?.blockType || record.identity?.block_type || record.type,
    box,
  };
}

function textColumnBudgetExceeded(container = {}, records = []) {
  if (container.role !== "module") return null;
  if (!validBox(container.bodyBox)) return null;
  const maxRatio = Number(container.fill?.maxTextHeightRatio ?? container.fill?.max_text_height_ratio ?? 0.6);
  const minTextHeight = Number(container.fill?.minLongTextHeight ?? container.fill?.min_long_text_height ?? 2.0);
  if (!Number.isFinite(maxRatio) || maxRatio <= 0) return null;
  const textRecords = records
    .filter(isText)
    .filter((record) => recordInsideContainer(record, container))
    .map((record) => ({ record, box: record.box || record.area || {} }))
    .filter((item) => validBox(item.box));
  if (!textRecords.length) return null;
  const textTop = Math.min(...textRecords.map((item) => Number(item.box.y || 0)));
  const textBottom = Math.max(...textRecords.map((item) => Number(item.box.y || 0) + Number(item.box.h || 0)));
  const textHeight = textBottom - textTop;
  const bodyHeight = Number(container.bodyBox.h || 0);
  const ratio = textHeight / Math.max(0.001, bodyHeight);
  if (textHeight < minTextHeight - 0.001) return null;
  if (ratio <= maxRatio + 0.001) return null;
  const largest = textRecords.reduce((best, item) => (Number(item.box.h || 0) > Number(best.box.h || 0) ? item : best), textRecords[0]);
  return {
    record: largest.record,
    textHeight: round(textHeight),
    textSpan: { y: round(textTop), bottom: round(textBottom) },
    bodyHeight: round(bodyHeight),
    ratio: round(ratio),
    maxRatio,
    minTextHeight,
    textRecords: textRecords.map((item) => ({
      selector: item.record.dsl?.selector || item.record.source?.selector,
      box: item.box,
    })),
  };
}

function recordInsideContainer(record = {}, container = {}) {
  const recordNode = String(record.nodeId || "");
  const containerNode = String(container.nodeId || "");
  if (recordNode && containerNode && recordNode.startsWith(`${containerNode}:`)) return true;
  const box = record.box || record.area || {};
  const body = container.bodyBox || {};
  if (!validBox(box) || !validBox(body)) return false;
  const center = { x: Number(box.x) + Number(box.w) / 2, y: Number(box.y) + Number(box.h) / 2 };
  return center.x >= Number(body.x) - 0.01
    && center.x <= Number(body.x) + Number(body.w) + 0.01
    && center.y >= Number(body.y) - 0.01
    && center.y <= Number(body.y) + Number(body.h) + 0.01;
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
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
