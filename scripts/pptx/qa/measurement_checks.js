"use strict";

const { createFeedbackIssue } = require("../feedback/feedback_issue");
const { createMeasurementIr, createPhaseResult } = require("./ir_contracts");

function normalizeMeasurementIr(input = {}) {
  return createMeasurementIr({
    pageIndex: input.pageIndex,
    pageId: input.pageId,
    expectedPrimitives: (input.expectedPrimitives || []).map(normalizeExpectedPrimitive),
    records: (input.records || input.measurements || []).map(normalizeMeasurementRecord),
  });
}

function runMeasurementChecks(input = {}) {
  const ir = normalizeMeasurementIr(input);
  const issues = [];
  const recordsById = new Map(ir.records.map((record) => [nodeKey(record), record]));

  for (const expected of ir.expectedPrimitives) {
    const record = recordsById.get(nodeKey(expected));
    if (!record) {
      issues.push(issue("measure_component_unmeasured", ir, expected, "Visible DSL primitive has no corresponding measurement record."));
      continue;
    }
    if (isUnmeasurable(record)) {
      issues.push(issue("measure_component_unmeasurable", ir, record, "Primitive entered an unsupported or legacy fallback measurement path."));
    }
    if (!identityMatches(expected.identity, record.identity)) {
      issues.push(issue("measure_component_mismatch", ir, record, "Measurement record identity does not match the DSL primitive."));
    }
    if (record.status === "failed" || record.measurement?.ok === false) {
      issues.push(issue("measure_powerpoint_failed", ir, record, "PowerPoint-backed measurement failed for this primitive."));
    }
    if (!validBounds(record.bounds || record.measurement?.shape_bounds || record.measurement?.text_bounds)) {
      issues.push(issue("measure_bounds_invalid", ir, record, "Measurement bounds are missing, zero, negative, NaN, or unusable."));
    }
    if (!hasResizeContract(record)) {
      issues.push(issue("measure_resize_contract_missing", ir, record, "Measurement record is missing resizePolicy, size range, or resize limits required by layout."));
    } else if (resizeRangeInvalid(record)) {
      issues.push(issue("measure_resize_range_invalid", ir, record, "Measurement resize range violates visual readability or distortion limits."));
    }
  }

  const phaseResult = createPhaseResult({ phase: "measure", ir, diagnostics: issues });
  return { ok: phaseResult.status === "passed", ir, issues, phaseResult };
}

function normalizeExpectedPrimitive(item = {}) {
  return {
    nodeId: item.nodeId || item.node_id,
    identity: normalizeIdentity(item.identity || item),
    source: item.source || item.dsl || item.target || null,
    dsl: item.dsl || item.target || null,
    moduleIndex: item.moduleIndex,
    blockIndex: item.blockIndex,
    raw: item,
  };
}

function normalizeMeasurementRecord(item = {}) {
  return {
    nodeId: item.nodeId || item.node_id,
    identity: normalizeIdentity(item.identity || item),
    source: item.source || item.dsl || item.target || null,
    dsl: item.dsl || item.target || null,
    moduleIndex: item.moduleIndex,
    blockIndex: item.blockIndex,
    status: item.status || (item.measurement?.ok === false ? "failed" : "ok"),
    measureSupport: item.measureSupport || item.measure_support || item.primitive?.measureSupport,
    minSize: item.minSize || item.min_size || item.measure?.min_size,
    preferredSize: item.preferredSize || item.preferred_size || item.measure?.preferred_size,
    maxUsefulSize: item.maxUsefulSize || item.max_useful_size || item.measure?.max_useful_size,
    resizePolicy: item.resizePolicy || item.resize_policy || item.measure?.resize_policy,
    resizeLimits: item.resizeLimits || item.resize_limits || item.measure?.resize_limits,
    constraintBox: item.constraintBox || item.constraint_box,
    bounds: item.bounds || item.shape_bounds || item.text_bounds || item.measurement?.shape_bounds || item.measurement?.text_bounds,
    measurement: item.measurement,
    raw: item,
  };
}

function normalizeIdentity(identity = {}) {
  return {
    componentId: identity.componentId || identity.component_id || identity.id,
    blockType: identity.blockType || identity.block_type || identity.type,
    kind: identity.kind,
    template: identity.template,
  };
}

function nodeKey(item = {}) {
  const identity = item.identity || {};
  return item.source?.selector
    || item.source?.path
    || item.dsl?.selector
    || item.dsl?.path
    || item.nodeId
    || [identity.componentId, identity.blockType, item.moduleIndex, item.blockIndex].filter((value) => value !== undefined && value !== null).join("::");
}

function identityMatches(expected = {}, actual = {}) {
  return ["componentId", "blockType", "kind", "template"].every((key) => {
    if (expected[key] === undefined || expected[key] === null) return true;
    return expected[key] === actual[key];
  });
}

function isUnmeasurable(record = {}) {
  return ["UNSUPPORTED", "LEGACY_FALLBACK", "unsupported", "legacy_fallback"].includes(record.measureSupport);
}

function validBounds(bounds = {}) {
  return Number.isFinite(Number(bounds.w)) && Number(bounds.w) > 0
    && Number.isFinite(Number(bounds.h)) && Number(bounds.h) > 0;
}

function hasResizeContract(record = {}) {
  return Boolean(record.resizePolicy)
    && validBounds(record.minSize)
    && validBounds(record.preferredSize)
    && validBounds(record.maxUsefulSize)
    && record.resizeLimits
    && typeof record.resizeLimits === "object";
}

function resizeRangeInvalid(record = {}) {
  if (!validBounds(record.minSize) || !validBounds(record.preferredSize) || !validBounds(record.maxUsefulSize)) return true;
  if (Number(record.minSize.w) > Number(record.preferredSize.w) + 0.001) return true;
  if (Number(record.minSize.h) > Number(record.preferredSize.h) + 0.001) return true;
  if (Number(record.preferredSize.w) > Number(record.maxUsefulSize.w) + 0.001) return true;
  if (Number(record.preferredSize.h) > Number(record.maxUsefulSize.h) + 0.001) return true;
  const limits = record.resizeLimits || {};
  const uniform = limits.uniformScale || limits.uniform_scale;
  if (uniform && (Number(uniform.min) < 0.67 - 0.001 || Number(uniform.max) > 1.33 + 0.001)) return true;
  const axis = limits.axisScale || limits.axis_scale;
  if (axis && (Number(axis.min) < 0.8 - 0.001 || Number(axis.max) > 1.2 + 0.001)) return true;
  if (limits.preserveAspect === true || limits.preserve_aspect === true) {
    return !uniform || Number(uniform.min) < 0.67 - 0.001 || Number(uniform.max) > 1.33 + 0.001;
  }
  return false;
}

function issue(code, ir, item = {}, message) {
  return createFeedbackIssue({
    code,
    phase: "measure",
    severity: "error",
    location_quality: (item.source || item.dsl)?.selector ? "dsl_mapped" : "page_only",
    target: {
      pageIndex: ir.pageIndex,
      pageId: ir.pageId,
      ...(item.source || item.dsl || {}),
      componentId: item.identity?.componentId || item.dsl?.id,
    },
    message,
    details: {
      expected: item.identity,
      measurement: item.raw || item.source,
      resizePolicy: item.resizePolicy,
      resizeLimits: item.resizeLimits,
    },
  });
}

module.exports = {
  normalizeMeasurementIr,
  runMeasurementChecks,
};
