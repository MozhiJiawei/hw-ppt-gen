const { MEASURE_SUPPORT } = require("./content_body_taxonomy");
const { diagnostic, round, roundRect } = require("./diagnostics");
const { measurePrimitive, premeasurePrimitives } = require("./measure_primitives");

function layoutModuleStack(area = {}, blocks = [], flow = "top_bottom", options = {}) {
  const visibleBlocks = blocks.filter(Boolean);
  const gap = Number(options.blockGap ?? 0.12);
  const horizontal = flow === "left_right" || flow === "right_left";
  const measures = Array.isArray(options.premeasuredMeasures)
    ? options.premeasuredMeasures
    : measureStackPrimitives(area, visibleBlocks, options);
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
  const layoutFn = horizontal ? layoutHorizontal : layoutVertical;
  let result = layoutFn(area, visibleBlocks, measures, flow, gap);
  result = refreshLayoutMeasurements(area, visibleBlocks, result, layoutFn, flow, gap, options);
  return result;
}

function measureStackPrimitives(area = {}, blocks = [], options = {}) {
  const visibleBlocks = blocks.filter(Boolean);
  premeasurePrimitives(visibleBlocks, area, options);
  return visibleBlocks.map((block) => ({
    ...measurePrimitive(block, area, options),
    measurementArea: roundRect(area),
  }));
}

function refreshLayoutMeasurements(area = {}, blocks = [], result = {}, layoutFn, flow, gap, options = {}) {
  if (typeof options.measureOnDemand !== "function") return result;
  if (!["ok", "empty"].includes(result.status) || !Array.isArray(result.areas) || !result.areas.length) return result;
  const nextMeasures = [];
  let changed = false;
  blocks.forEach((block, index) => {
    const current = result.measures[index];
    const constraintBox = result.areas[index];
    const next = options.measureOnDemand(block, constraintBox, {
      index,
      currentMeasure: current,
      phase: "layout",
    }) || current;
    nextMeasures[index] = next;
    if (next !== current) changed = true;
  });
  if (!changed) return result;
  const refreshed = layoutFn(area, blocks, nextMeasures, flow, gap);
  refreshed.diagnostics = [
    ...(result.diagnostics || []),
    diagnostic(
      "layout_measurement_refreshed",
      "info",
      "Layout requested additional measurement facts for final constraint boxes before producing final boxes.",
      { refreshed_count: nextMeasures.filter(Boolean).length }
    ),
    ...(refreshed.diagnostics || []),
  ];
  refreshed.measurementRefresh = {
    count: nextMeasures.filter(Boolean).length,
  };
  return refreshed;
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
        target: firstDslTarget(measures),
        available_width: round(availableWidth),
        claimants: widthFailures.map(({ measure, index }) => claimantFor(measure, index, {
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
        target: firstDslTarget(measures),
        available_height: round(available),
        minimum_required_height: round(minTotal),
        claimants: measures.map((measure, index) => claimantFor(measure, index, {
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
          target: dslTargetFor(measures[item.index]),
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
    if (growable >= 0) {
      const max = Number(measures[growable].maxUsefulSize?.h || sizes[growable]);
      sizes[growable] += Math.min(available - preferredTotal, Math.max(0, max - sizes[growable]));
    }
  }

  const usedHeight = sum(sizes) + effectiveGap * gapCount;
  const remainingSlack = Math.max(0, Number(area.h || 0) - usedHeight);
  if (gapCount > 0 && remainingSlack > 0.001) {
    effectiveGap += remainingSlack / gapCount;
    const gapDetail = { target: firstDslTarget(measures), gap: round(effectiveGap), slack_h: round(remainingSlack) };
    if (remainingSlack > 1.1 || effectiveGap > 0.85) {
      diagnostics.push(diagnostic(
        "layout_internal_gap_excessive",
        "warning",
        "Column content has excessive internal blank space after adaptive layout; add content, add a real visual, change layout, or split the page.",
        gapDetail
      ));
    } else {
      diagnostics.push(diagnostic(
        "layout_stack_gap_expand",
        "info",
        "Module block gaps were expanded so the stack aligns to both top and bottom edges.",
        gapDetail
      ));
    }
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
    block_gaps: Array.from({ length: gapCount }, () => round(effectiveGap)),
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
        target: firstDslTarget(measures),
        available_width: round(available),
        minimum_required_width: round(minTotal),
        claimants: measures.map((measure, index) => claimantFor(measure, index, {
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
          target: dslTargetFor(measures[item.index]),
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

function claimantFor(measure = {}, index, extra = {}) {
  return {
    index,
    taxonomy_key: measure.primitive?.taxonomy_key,
    target: dslTargetFor(measure),
    ...extra,
  };
}

function dslTargetFor(measure = {}) {
  const dsl = measure.dsl || {};
  return {
    path: dsl.path,
    selector: dsl.selector,
    componentId: dsl.id,
    tag: dsl.tag,
    semanticStack: dsl.semanticStack,
  };
}

function firstDslTarget(measures = []) {
  const measure = measures.find((item) => item?.dsl?.selector);
  return measure ? dslTargetFor(measure) : undefined;
}

module.exports = {
  layoutModuleStack,
  measureStackPrimitives,
};
