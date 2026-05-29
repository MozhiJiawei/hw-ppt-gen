const { MEASURE_SUPPORT } = require("./content_body_taxonomy");
const { diagnostic, round, roundRect } = require("./diagnostics");
const { measurePrimitive, premeasurePrimitives } = require("./measure_primitives");

function layoutModuleStack(area = {}, blocks = [], flow = "top_bottom", options = {}) {
  const visibleBlocks = blocks.filter(Boolean);
  const gap = Number(options.blockGap ?? 0.12);
  const horizontal = flow === "left_right" || flow === "right_left";
  premeasurePrimitives(visibleBlocks, area, options);
  const measures = visibleBlocks.map((block) => measurePrimitive(block, area, options));
  const hardMeasure = measures.find((measure) => (measure.diagnostics || []).some((diag) => diag.severity === "error"));
  const fallbackMeasure = measures.find((measure) => measure.primitive.measureSupport === MEASURE_SUPPORT.LEGACY_FALLBACK);
  const unsupportedMeasure = measures.find((measure) => measure.primitive.measureSupport === MEASURE_SUPPORT.UNSUPPORTED);
  if (hardMeasure) {
    return {
      status: "infeasible",
      usedFallback: false,
      flow,
      measures,
      areas: [],
      diagnostics: hardMeasure.diagnostics.filter((diag) => diag.severity === "error"),
    };
  }
  if (fallbackMeasure || unsupportedMeasure) {
    return {
      status: unsupportedMeasure ? "unsupported" : "legacy_fallback",
      usedFallback: false,
      flow,
      measures,
      areas: [],
      diagnostics: [
        diagnostic(
          unsupportedMeasure ? "layout_manager_unsupported" : "layout_manager_fallback",
          "error",
          unsupportedMeasure
            ? "Module stack contains unsupported primitives; legacy allocation is required."
            : "Module stack contains primitives that still use legacy layout fallback.",
          { taxonomy_key: (unsupportedMeasure || fallbackMeasure).primitive.taxonomy_key }
        ),
      ],
    };
  }
  if (!visibleBlocks.length) {
    return { status: "empty", usedFallback: false, flow, measures: [], areas: [], diagnostics: [] };
  }
  if (horizontal) return layoutHorizontal(area, visibleBlocks, measures, flow, gap);
  return layoutVertical(area, visibleBlocks, measures, flow, gap);
}

function layoutVertical(area, blocks, measures, flow, gap) {
  const gapCount = Math.max(0, blocks.length - 1);
  let effectiveGap = gap;
  let gapTotal = effectiveGap * gapCount;
  let available = Math.max(0.1, Number(area.h || 0) - gapTotal);
  const availableWidth = Math.max(0.1, Number(area.w || 0));
  const minTotal = sum(measures.map((measure) => measure.minSize.h));
  const preferredTotal = sum(measures.map((measure) => measure.preferredSize.h));
  const diagnostics = [];

  if (gapCount && minTotal > available + 0.001) {
    const minGap = 0.06;
    const compressedGap = Math.max(minGap, (Number(area.h || 0) - minTotal) / gapCount);
    if (compressedGap < effectiveGap) {
      effectiveGap = compressedGap;
      gapTotal = effectiveGap * gapCount;
      available = Math.max(0.1, Number(area.h || 0) - gapTotal);
      diagnostics.push(diagnostic(
        "layout_stack_gap_shrink",
        "info",
        "Module block gap was compressed to preserve primitive readable floors.",
        { gap: round(effectiveGap) }
      ));
    }
  }

  const widthFailures = measures
    .map((measure, index) => ({ measure, index }))
    .filter(({ measure }) => Number(measure.minSize.w || 0) > availableWidth + 0.001);
  if (widthFailures.length) {
    diagnostics.push(diagnostic(
      "layout_stack_width_infeasible",
      "error",
      "One or more primitives require more width than the module body provides.",
      {
        available_width: round(availableWidth),
        claimants: widthFailures.map(({ measure, index }) => ({
          index,
          taxonomy_key: measure.primitive.taxonomy_key,
          min_w: round(measure.minSize.w),
          preferred_w: round(measure.preferredSize.w),
        })),
      }
    ));
  }

  if (minTotal > available + 0.001) {
    diagnostics.push(diagnostic(
      "layout_stack_infeasible",
      "error",
      "Module content minimum height exceeds available body height.",
      {
        available_height: round(available),
        minimum_required_height: round(minTotal),
        claimants: measures.map((measure, index) => ({
          index,
          taxonomy_key: measure.primitive.taxonomy_key,
          min_h: round(measure.minSize.h),
          preferred_h: round(measure.preferredSize.h),
        })),
      }
    ));
  }

  let sizes = measures.map((measure) => measure.preferredSize.h);
  if (preferredTotal > available) {
    let overflow = preferredTotal - available;
    const shrinkables = measures
      .map((measure, index) => ({
        index,
        capacity: Math.max(0, measure.preferredSize.h - measure.minSize.h),
        priority: measure.priority,
      }))
      .filter((item) => item.capacity > 0)
      .sort((a, b) => a.priority - b.priority);
    for (const item of shrinkables) {
      if (overflow <= 0) break;
      const shrink = Math.min(item.capacity, overflow);
      sizes[item.index] -= shrink;
      overflow -= shrink;
      diagnostics.push(diagnostic(
        "layout_stack_shrink",
        "info",
        "Primitive was shrunk from preferred size toward its readable floor.",
        {
          index: item.index,
          taxonomy_key: measures[item.index].primitive.taxonomy_key,
          shrink_h: round(shrink),
          final_h: round(sizes[item.index]),
        }
      ));
    }
    if (overflow > 0.001) {
      const scale = available / Math.max(0.1, sum(sizes));
      sizes = sizes.map((size) => Math.max(0.22, size * scale));
      diagnostics.push(diagnostic(
        "layout_stack_forced_scale",
        "error",
        "Primitive stack required forced scaling below declared minimum sizes.",
        { overflow_h: round(overflow), scale: round(scale) }
      ));
    }
  } else if (preferredTotal < available) {
    const growable = chooseGrowable(measures);
    if (growable >= 0) sizes[growable] += available - preferredTotal;
  }

  const orderedSizes = flow === "bottom_top" ? [...sizes].reverse() : sizes;
  let cursor = Number(area.y || 0);
  const orderedAreas = orderedSizes.map((size) => {
    const blockArea = { x: area.x, y: cursor, w: area.w, h: Math.max(0.22, size) };
    cursor += blockArea.h + effectiveGap;
    return roundRect(blockArea);
  });
  const areas = flow === "bottom_top" ? orderedAreas.reverse() : orderedAreas;
  return {
    status: diagnostics.some((item) => item.severity === "error") ? "infeasible" : "ok",
    usedFallback: false,
    flow,
    available_main: round(available),
    min_total: round(minTotal),
    preferred_total: round(preferredTotal),
    measures,
    areas,
    diagnostics,
  };
}

function layoutHorizontal(area, blocks, measures, flow, gap) {
  const gapTotal = gap * Math.max(0, blocks.length - 1);
  const available = Math.max(0.1, Number(area.w || 0) - gapTotal);
  const minTotal = sum(measures.map((measure) => measure.minSize.w));
  const preferredTotal = sum(measures.map((measure) => measure.preferredSize.w));
  const diagnostics = [];
  if (minTotal > available + 0.001) {
    diagnostics.push(diagnostic(
      "layout_row_infeasible",
      "error",
      "Horizontal primitive minimum width exceeds available body width.",
      {
        available_width: round(available),
        minimum_required_width: round(minTotal),
        claimants: measures.map((measure, index) => ({
          index,
          taxonomy_key: measure.primitive.taxonomy_key,
          min_w: round(measure.minSize.w),
          preferred_w: round(measure.preferredSize.w),
        })),
      }
    ));
  }

  let widths = measures.map((measure) => measure.preferredSize.w);
  if (preferredTotal > available) {
    let overflow = preferredTotal - available;
    const shrinkables = measures
      .map((measure, index) => ({
        index,
        capacity: Math.max(0, measure.preferredSize.w - measure.minSize.w),
        priority: measure.priority,
      }))
      .filter((item) => item.capacity > 0)
      .sort((a, b) => a.priority - b.priority);
    for (const item of shrinkables) {
      if (overflow <= 0) break;
      const shrink = Math.min(item.capacity, overflow);
      widths[item.index] -= shrink;
      overflow -= shrink;
      diagnostics.push(diagnostic(
        "layout_row_shrink",
        "info",
        "Primitive was shrunk from preferred width toward its readable floor.",
        {
          index: item.index,
          taxonomy_key: measures[item.index].primitive.taxonomy_key,
          shrink_w: round(shrink),
          final_w: round(widths[item.index]),
        }
      ));
    }
    if (overflow > 0.001) {
      diagnostics.push(diagnostic(
        "layout_row_forced_scale",
        "error",
        "Primitive row required forced scaling below declared minimum widths.",
        { overflow_w: round(overflow) }
      ));
    }
  } else if (preferredTotal < available) {
    const weights = blocks.map((block) => Math.max(0.1, Number(block.weight || block.flex || 1)));
    const totalWeight = sum(weights);
    const slack = available - preferredTotal;
    widths = widths.map((width, index) => {
      const max = measures[index].maxUsefulSize.w;
      const share = slack * (weights[index] / totalWeight);
      return Math.min(max, width + share);
    });
    const remaining = available - sum(widths);
    if (remaining > 0.001 && widths.length) widths[widths.length - 1] += remaining;
  }

  let cursor = Number(area.x || 0);
  const orderedAreas = blocks.map((_, index) => {
    const w = widths[index];
    const blockArea = { x: cursor, y: area.y, w, h: area.h };
    cursor += w + gap;
    return roundRect(blockArea);
  });
  return {
    status: diagnostics.some((item) => item.severity === "error") ? "infeasible" : "ok",
    usedFallback: false,
    flow,
    available_main: round(available),
    min_total: round(minTotal),
    preferred_total: round(preferredTotal),
    measures,
    areas: flow === "right_left" ? orderedAreas.reverse() : orderedAreas,
    diagnostics,
  };
}

function chooseGrowable(measures) {
  let best = -1;
  let bestPriority = -Infinity;
  measures.forEach((measure, index) => {
    const canGrow = measure.maxUsefulSize.h > measure.preferredSize.h + 0.01;
    if (canGrow && measure.priority > bestPriority) {
      best = index;
      bestPriority = measure.priority;
    }
  });
  return best;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

module.exports = {
  layoutModuleStack,
};
