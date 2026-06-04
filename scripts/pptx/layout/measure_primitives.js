const { classifyBlock } = require("./classify_blocks");
const { getBlockVisualSpec } = require("./content_model");
const { MEASURE_SUPPORT, RESIZE_POLICY } = require("./content_body_taxonomy");
const { diagnostic } = require("./diagnostics");
const { measureBlockWithPowerPoint, premeasureBlocksWithPowerPoint } = require("./powerpoint_measurement_provider");

function measurePrimitive(block = {}, area = {}, options = {}) {
  const classification = classifyBlock(block);
  const visualAnchor = getBlockVisualSpec(block);
  const base = {
    primitive: classification,
    minSize: { w: Number(area.w || 0), h: 0.3 },
    preferredSize: { w: Number(area.w || 0), h: 0.3 },
    maxUsefulSize: { w: Number(area.w || 0), h: Number(area.h || 0) },
    resizePolicy: classification.resizePolicy,
    resizeLimits: resizeLimitsFor(classification),
    priority: primitivePriority(classification, block),
    diagnostics: withDslContext([...classification.diagnostics], block),
    dsl: block.dsl || null,
  };

  if (classification.measureSupport === MEASURE_SUPPORT.UNSUPPORTED) return base;
  if (!visualAnchor) return measureTextPrimitive(base, block, area, options);
  if (classification.family === "Evidence") return measureEvidencePrimitive(base, block, visualAnchor, area, options);
  if (classification.type === "KpiCardRow") return measureDataCardsPrimitive(base, visualAnchor, area, options);
  if (classification.type === "NativeTable") return measureTablePrimitive(base, visualAnchor, area, options);
  return measureVisualPrimitive(base, measurableVisualBlock(block, visualAnchor), area, options);
}

function premeasurePrimitives(blocks = [], area = {}, options = {}) {
  const items = collectPremeasurePrimitiveItems(blocks, area, options);
  premeasureBlocksWithPowerPoint(items, options);
}

function collectPremeasurePrimitiveItems(blocks = [], area = {}, options = {}) {
  const items = [];
  blocks.filter(Boolean).forEach((block) => {
    const classification = classifyBlock(block);
    const visualAnchor = getBlockVisualSpec(block);
    if (classification.measureSupport === MEASURE_SUPPORT.UNSUPPORTED) return;
    if (!visualAnchor) {
      items.push({ block, area, classification });
      return;
    }
    if (classification.type === "KpiCardRow") {
      kpiProbeWidths(visualAnchor, area).forEach((width) => {
        items.push({
          block: { type: "supporting_component", component: visualAnchor },
          area: { ...area, w: width },
          classification,
        });
      });
      return;
    }
    if (classification.type === "NativeTable") {
      items.push({ block: { type: "supporting_component", component: visualAnchor }, area, classification });
      return;
    }
    items.push({ block: measurableVisualBlock(block, visualAnchor), area, classification });
  });
  return items;
}

function measurableVisualBlock(block = {}, visualSpec = {}) {
  if (block.type === "supporting_component") return { type: "supporting_component", component: visualSpec };
  return { type: block.type || "visual_anchor", visual_anchor: visualSpec };
}

function measureTextPrimitive(base, block, area, options = {}) {
  const measured = powerPointMeasureOrError(base, block, area, options);
  if (!measured.ok) return measured.result;
  const textBounds = measured.result.text_bounds || {};
  const measuredHeight = Math.ceil((Number(textBounds.h || 0) + 0.12) * 20) / 20;
  const measuredWidth = Math.ceil((Number(textBounds.w || 0) + 0.16) * 20) / 20;
  const availableWidth = Number(area.w || measuredWidth || 0);
  const minWidth = Math.max(0.85, Math.min(availableWidth, measuredWidth));
  return {
    ...base,
    minSize: { w: minWidth, h: measuredHeight },
    preferredSize: { w: Math.max(availableWidth, minWidth), h: measuredHeight },
    maxUsefulSize: { w: Math.max(availableWidth, minWidth), h: measuredHeight },
    resizePolicy: RESIZE_POLICY.SHRINK_TEXT,
    resizeLimits: resizeLimitsFor({ resizePolicy: RESIZE_POLICY.SHRINK_TEXT }),
    measurement: measured.result,
    diagnostics: base.diagnostics,
  };
}

function measureEvidencePrimitive(base, block, visualAnchor, area, options) {
  const measured = powerPointMeasureOrError(base, { type: "visual_anchor", visual_anchor: visualAnchor }, area, options);
  if (!measured.ok) return measured.result;
  const bounds = measured.result.shape_bounds || {};
  const measuredHeight = Math.ceil((Number(bounds.h || 0.9) + 0.12) * 20) / 20;
  const measuredWidth = Math.ceil((Number(bounds.w || Number(area.w || 0)) + 0.12) * 20) / 20;
  const availableWidth = Number(area.w || measuredWidth || 0);
  const availableHeight = Number(area.h || measuredHeight || 0);
  const readable = evidenceReadableFloor(block, visualAnchor, area);
  const minWidth = Math.max(readable.minWidth, Math.min(availableWidth || measuredWidth, measuredWidth * 0.7));
  const minHeight = Math.max(readable.minHeight, Math.min(availableHeight || measuredHeight, measuredHeight * 0.7));
  const preferredWidth = Math.max(minWidth, Math.min(availableWidth || measuredWidth, measuredWidth));
  const preferredHeight = Math.max(minHeight, Math.min(availableHeight || measuredHeight, measuredHeight));
  const resizeLimits = resizeLimitsFor(base.primitive);
  const axisMax = Number(resizeLimits.axisScale?.max || 1);
  return {
    ...base,
    minSize: { w: minWidth, h: minHeight },
    preferredSize: { w: preferredWidth, h: preferredHeight },
    maxUsefulSize: {
      w: Math.max(preferredWidth, Math.min(availableWidth || preferredWidth, preferredWidth * axisMax)),
      h: Math.max(preferredHeight, Math.min(availableHeight || preferredHeight, preferredHeight * axisMax)),
    },
    resizePolicy: RESIZE_POLICY.PRESERVE_ASPECT,
    resizeLimits,
    measurement: measured.result,
    diagnostics: [
      ...base.diagnostics,
      ...readable.diagnostics,
    ],
  };
}

function measureTablePrimitive(base, visualAnchor, area = {}, options = {}) {
  const measured = powerPointMeasureOrError(base, { type: "supporting_component", component: visualAnchor }, area, options);
  if (!measured.ok) return measured.result;
  const bounds = measured.result.shape_bounds || {};
  const measuredHeight = Math.ceil((Number(bounds.h || 0) + 0.12) * 20) / 20;
  const visual = visualAnchor?.visual_spec || {};
  const rows = Array.isArray(visual.rows) ? visual.rows.length : 0;
  return {
    ...base,
    minSize: { w: Math.max(1.1, Math.min(Number(area.w || 0), Number(bounds.w || 0) + 0.12)), h: measuredHeight },
    preferredSize: { w: Math.max(Number(area.w || 0), Number(bounds.w || 0) + 0.12), h: measuredHeight },
    maxUsefulSize: { w: Math.max(Number(area.w || 0), Number(bounds.w || 0) + 0.12), h: measuredHeight + 0.18 },
    resizeLimits: resizeLimitsFor(base.primitive),
    table: { rows, measuredHeight },
    measurement: measured.result,
  };
}

function measureDataCardsPrimitive(base, visualAnchor, area = {}, options = {}) {
  const fit = measureDataCardsFit(base, visualAnchor, area, options);
  if (!fit.ok) return fit.result;
  const bounds = fit.measurement.shape_bounds || {};
  const measuredHeight = Math.ceil((Number(bounds.h || 0) + 0.1) * 20) / 20;
  const measuredWidth = Math.ceil((Number(bounds.w || 0) + 0.12) * 20) / 20;
  const availableWidth = Number(area.w || 0);
  const diagnostics = [...base.diagnostics];
  if (measuredWidth > availableWidth + 0.001) {
    diagnostics.push(diagnostic(
      "layout_kpi_row_width_too_small",
      "error",
      "KPI row cannot render inside the available width.",
      {
        available_width: round(availableWidth),
        measured_width: round(measuredWidth),
        probed_width: round(fit.width),
        target: dslTarget({ dsl: base.dsl }, visualAnchor),
      }
    ));
  }
  const cards = visualAnchor?.visual_spec?.cards || [];
  return {
    ...base,
    minSize: { w: measuredWidth, h: measuredHeight },
    preferredSize: { w: Math.max(availableWidth, measuredWidth), h: measuredHeight },
    maxUsefulSize: { w: Math.max(availableWidth, measuredWidth), h: measuredHeight },
    resizeLimits: resizeLimitsFor(base.primitive),
    cards: { count: Array.isArray(cards) ? cards.length : 0, measuredHeight },
    measurement: fit.measurement,
    diagnostics,
  };
}

function measureDataCardsFit(base, visualAnchor, area = {}, options = {}) {
  const block = { type: "supporting_component", component: visualAnchor };
  const candidates = kpiProbeWidths(visualAnchor, area);
  const available = candidates[0] || Math.max(0.2, Number(area.w || 0));
  let lastFailure = null;
  for (const width of candidates) {
    const measurement = measureBlockWithPowerPoint(block, { ...area, w: width }, base.primitive, options);
    if (!measurement?.ok) {
      lastFailure = measurement;
      continue;
    }
    const bounds = measurement.shape_bounds || {};
    if (Number(bounds.w || 0) <= width + 0.01) {
      return { ok: true, width, measurement };
    }
    lastFailure = {
      ok: false,
      error: `PowerPoint shape union width ${round(bounds.w)} exceeded probe width ${round(width)}.`,
      measurement,
    };
  }
  return {
    ok: false,
    result: {
      ...base,
      diagnostics: [
        ...base.diagnostics,
        diagnostic(
          "layout_kpi_row_width_too_small",
          "error",
          "KPI row cannot render inside the maximum probe width.",
          {
            available_width: round(available),
            max_probe_width: 6,
            error: String(lastFailure?.error || "").slice(0, 300),
            target: dslTarget({ dsl: base.dsl }, visualAnchor),
          }
        ),
      ],
      measurement: lastFailure,
    },
  };
}

function powerPointMeasureOrError(base, block, area, options = {}) {
  const measurement = measureBlockWithPowerPoint(block, area, base.primitive, options);
  if (measurement && measurement.ok) return { ok: true, result: measurement };
  const message = measurement?.error || "PowerPoint measurement did not return a result.";
  return {
    ok: false,
    result: {
      ...base,
      diagnostics: [
        ...base.diagnostics,
        diagnostic(
          "layout_powerpoint_measurement_failed",
          "error",
          "Measured primitive requires PowerPoint COM measurement, but the probe failed.",
          {
            taxonomy_key: base.primitive.taxonomy_key,
            error: String(message).slice(0, 500),
            target: dslTarget({ dsl: base.dsl }, getBlockVisualSpec(block) || {}),
          }
        ),
      ],
      measurement,
    },
  };
}

function measureVisualPrimitive(base, block, area = {}, options = {}) {
  const measured = powerPointMeasureOrError(base, block, area, options);
  if (!measured.ok) return measured.result;
  const bounds = measured.result.shape_bounds || {};
  const availableWidth = Number(area.w || 0);
  const availableHeight = Number(area.h || 0);
  const measuredWidth = Math.ceil((Number(bounds.w || availableWidth) + 0.12) * 20) / 20;
  const measuredHeight = Math.ceil((Number(bounds.h || 0.9) + 0.12) * 20) / 20;
  const floor = visualWidthFloor(base.primitive);
  const minWidth = Math.max(floor, Math.min(availableWidth || measuredWidth, measuredWidth * 0.72));
  const preferredWidth = Math.max(minWidth, Math.min(availableWidth || measuredWidth, measuredWidth));
  const heightPolicy = visualHeightPolicy(base.primitive, block);
  const minHeight = Math.min(availableHeight || heightPolicy.min, heightPolicy.min);
  const preferredHeight = Math.min(availableHeight || heightPolicy.preferred, heightPolicy.preferred);
  return {
    ...base,
    minSize: { w: minWidth, h: minHeight },
    preferredSize: { w: preferredWidth, h: Math.max(minHeight, preferredHeight) },
    maxUsefulSize: { w: Math.max(preferredWidth, availableWidth || preferredWidth), h: Math.max(heightPolicy.max, Math.min(availableHeight || heightPolicy.max, measuredHeight)) },
    resizeLimits: resizeLimitsFor(base.primitive),
    measurement: measured.result,
    diagnostics: base.diagnostics,
  };
}

function resizeLimitsFor(classification = {}) {
  const policy = classification.resizePolicy;
  if (classification.family === "Evidence") {
    return {
      preserveAspect: false,
      uniformScale: { min: 0.67, max: 1.33 },
      axisScale: { min: 0.8, max: 1.2 },
    };
  }
  if (policy === RESIZE_POLICY.PRESERVE_ASPECT) {
    return {
      preserveAspect: true,
      uniformScale: { min: 0.67, max: 1.33 },
    };
  }
  if (policy === RESIZE_POLICY.FLEXIBLE) {
    return {
      preserveAspect: false,
      uniformScale: { min: 0.67, max: 1.33 },
      axisScale: { min: 0.8, max: 1.2 },
    };
  }
  if (policy === RESIZE_POLICY.FIXED) {
    return {
      preserveAspect: true,
      uniformScale: { min: 1, max: 1 },
    };
  }
  if (policy === RESIZE_POLICY.SHRINK_TEXT) {
    return {
      preserveAspect: false,
      textScale: { min: 1, max: 1 },
    };
  }
  return {
    preserveAspect: false,
    uniformScale: { min: 0.67, max: 1.33 },
    axisScale: { min: 0.8, max: 1.2 },
  };
}

function visualWidthFloor(classification = {}) {
  if (classification.family === "RelationshipDiagram") return 1.8;
  if (classification.family === "MatrixTable") return 1.65;
  if (classification.family === "QuantitativeReadout") return 1.55;
  return 1.35;
}

function visualHeightPolicy(classification = {}, block = {}) {
  const explicit = Number(block.height || block.preferredHeight || block.preferred_height || 0);
  if (explicit > 0) {
    return {
      min: Math.max(0.58, explicit * 0.72),
      preferred: explicit,
      max: Math.max(explicit, explicit * 1.3),
    };
  }
  if (classification.family === "MatrixTable") return { min: 0.9, preferred: 1.2, max: 2.2 };
  if (classification.family === "RelationshipDiagram") return { min: 0.9, preferred: 1.25, max: 2.4 };
  if (classification.family === "QuantitativeReadout") return { min: 0.72, preferred: 1.08, max: 1.8 };
  return { min: 0.8, preferred: 1.15, max: 2.0 };
}

function primitivePriority(classification = {}, block = {}) {
  const dslPriority = block.dsl?.priority;
  if (dslPriority === "primary") return 120;
  if (dslPriority === "secondary") return 70;
  if (dslPriority === "supporting") return 35;
  if (classification.family === "Evidence") return 100;
  if (classification.family === "RelationshipDiagram") return 90;
  if (classification.family === "QuantitativeReadout") return 70;
  if (classification.family === "MatrixTable") return 65;
  if (classification.family === "StructuredText") return 45;
  return 20;
}

function evidenceReadableFloor(block = {}, visualAnchor = {}, area = {}) {
  if (!block.dsl) return { minWidth: 1.0, minHeight: 0.72, diagnostics: [] };
  const priority = block.dsl?.priority || "primary";
  const primary = priority === "primary";
  const availableWidth = Number(area.w || 0);
  const availableHeight = Number(area.h || 0);
  const minWidth = primary ? 2.2 : 1.45;
  const minHeight = primary ? 1.8 : 1.1;
  const minArea = primary ? 4.0 : 1.6;
  const diagnostics = [];
  if (availableWidth && availableWidth * Math.max(availableHeight, minHeight) < minArea) {
    diagnostics.push(diagnostic(
      "layout_evidence_readable_area_floor",
      "error",
      "Evidence component cannot preserve a readable source area in the current DSL layout.",
      {
        target: dslTarget(block, visualAnchor),
        available_width: round(availableWidth),
        available_height: round(availableHeight),
        minimum_readable_area: round(minArea),
        minimum_readable_height: round(minHeight),
        repairs: [
          "Move neighboring InsightText or supporting components out of this Module.",
          "Use a layout with a larger visual slot, such as biased_column for primary evidence.",
          "Split dense evidence onto its own content slide.",
        ],
      }
    ));
  }
  return { minWidth, minHeight, diagnostics };
}

function withDslContext(diagnostics = [], block = {}) {
  if (!block?.dsl) return diagnostics;
  return diagnostics.map((item) => ({
    ...item,
    target: {
      ...(item.target || {}),
      path: item.target?.path || block.dsl.path,
      selector: item.target?.selector || block.dsl.selector,
      componentId: item.target?.componentId || block.dsl.id,
    },
  }));
}

function dslTarget(block = {}, visualAnchor = {}) {
  return {
    path: block.dsl?.path,
    selector: block.dsl?.selector,
    componentId: block.dsl?.id || visualAnchor.id,
    semanticStack: block.dsl?.semanticStack,
  };
}

function kpiProbeWidths(visualAnchor, area = {}) {
  const available = Math.max(0.2, Number(area.w || 0));
  const candidates = [available];
  for (let width = Math.ceil(available * 10) / 10; width <= 6.001; width += 0.1) {
    const roundedWidth = Number(width.toFixed(2));
    if (!candidates.includes(roundedWidth)) candidates.push(roundedWidth);
  }
  return uniqueSortedWidths(candidates);
}

function uniqueSortedWidths(widths) {
  return [...new Set(widths
    .map((width) => Number(Number(width || 0).toFixed(2)))
    .filter((width) => Number.isFinite(width) && width > 0))]
    .sort((a, b) => a - b);
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

module.exports = {
  collectPremeasurePrimitiveItems,
  measurePrimitive,
  premeasurePrimitives,
};
