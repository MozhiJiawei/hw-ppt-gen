const { HW_STYLE } = require("../hw_pptx_helpers");
const { collectPremeasurePrimitiveItems, measurePrimitive, premeasurePrimitives } = require("./measure_primitives");
const { normalizeModuleBlocks } = require("./content_model");

function fixedContentLayoutArea(layout, contentTop = HW_STYLE.summary.contentTop) {
  const bottomPadding = layout.schema.special === "large_visual_with_side_cards" ? 0.35 : 0.17;
  return {
    x: HW_STYLE.slide.marginX,
    y: contentTop - 0.18,
    w: 12.23,
    h: HW_STYLE.slide.footerY - contentTop - bottomPadding,
  };
}

function contentLayoutAreas(layout, layoutBounds, options = {}) {
  const gap = 0.18;
  if (layout.schema.special === "large_visual_with_side_cards") {
    premeasureModuleWidthDemands([layout.modules[0]], layout.type, layoutBounds.w * 0.59, layoutBounds.h, options);
    const visualDemand = measureModuleWidthDemand(layout.modules[0], layout.type, layoutBounds.w * 0.59, layoutBounds.h, options).preferred;
    const requestedVisualShare = Number(layout.visualWeight);
    const visualShare = Number.isFinite(requestedVisualShare)
      ? Math.min(0.72, Math.max(0.52, requestedVisualShare))
      : Math.min(0.68, Math.max(0.59, visualDemand / Math.max(0.1, layoutBounds.w)));
    const sideGap = visualShare >= 0.64 ? 0.28 : 0.38;
    const visualW = layoutBounds.w * visualShare;
    const sideW = layoutBounds.w - visualW - sideGap;
    const sideCount = Math.max(1, layout.modules.length - 1);
    const sideCardGap = 0.14;
    const sideCardH = (layoutBounds.h - sideCardGap * (sideCount - 1)) / sideCount;
    return layout.modules.map((_, idx) => {
      if (idx === 0) {
        return { x: layoutBounds.x + 0.46, y: layoutBounds.y, w: visualW - 0.46, h: layoutBounds.h };
      }
      return {
        x: layoutBounds.x + visualW + sideGap,
        y: layoutBounds.y + (idx - 1) * (sideCardH + sideCardGap),
        w: sideW,
        h: sideCardH,
      };
    });
  }
  if (layout.schema.grid) {
    const { rows, columns } = layout.schema.grid;
    const cellW = (layoutBounds.w - gap * (columns - 1)) / columns;
    const cellH = (layoutBounds.h - gap * (rows - 1)) / rows;
    return layout.modules.map((_, idx) => {
      const row = Math.floor(idx / columns);
      const col = idx % columns;
      return {
        x: layoutBounds.x + col * (cellW + gap),
        y: layoutBounds.y + row * (cellH + gap),
        w: cellW,
        h: cellH,
      };
    });
  }
  const columnLayout = resolveEvidenceAwareColumnLayout(layout, layoutBounds, gap, options);
  let x = layoutBounds.x;
  return columnLayout.widths.map((w) => {
    const area = { x, y: layoutBounds.y, w, h: layoutBounds.h };
    x += w + columnLayout.gap;
    return area;
  });
}

function collectBaseWidthMeasurementItems(layout, layoutBounds, options = {}) {
  const gap = 0.18;
  if (layout.schema.special === "large_visual_with_side_cards") {
    const bodyArea = moduleBodyArea({
      x: 0,
      y: 0,
      w: Math.max(0.4, layoutBounds.w * 0.59),
      h: Math.max(0.6, layoutBounds.h),
    });
    return collectPremeasurePrimitiveItems(normalizeModuleBlocks(layout.modules[0], {}), bodyArea, { ...options, layoutType: layout.type });
  }
  if (layout.schema.grid) return [];
  const columnCount = layout.schema.columns.length;
  const initialAvailableW = layoutBounds.w - gap * (columnCount - 1);
  const baseModuleW = initialAvailableW / columnCount;
  const bodyArea = moduleBodyArea({
    x: 0,
    y: 0,
    w: Math.max(0.4, baseModuleW),
    h: Math.max(0.6, layoutBounds.h),
  });
  return collectPremeasurePrimitiveItems(
    layout.modules.flatMap((module) => normalizeModuleBlocks(module, {})),
    bodyArea,
    { ...options, layoutType: layout.type }
  );
}

function resolveEvidenceAwareColumnLayout(layout, layoutBounds, baseGap, options = {}) {
  const columnCount = layout.schema.columns.length;
  const initialAvailableW = layoutBounds.w - baseGap * (columnCount - 1);
  const baseModuleW = initialAvailableW / columnCount;
  premeasureModuleWidthDemands(layout.modules, layout.type, baseModuleW, layoutBounds.h, options);
  const demands = layout.modules.map((module) => measureModuleWidthDemand(module, layout.type, baseModuleW, layoutBounds.h, options));
  const largestDemand = Math.max(1, ...demands.map((demand) => demand.preferred / Math.max(0.1, baseModuleW)));
  const gap = largestDemand >= 1.28 ? 0.08 : (largestDemand >= 1.12 ? 0.11 : baseGap);
  const availableW = layoutBounds.w - gap * (columnCount - 1);
  const widths = allocateMeasuredWidths(demands, availableW);
  return { gap, widths, availableW, demands };
}

function premeasureModuleWidthDemands(modules = [], layoutType, probeModuleW, moduleH, options = {}) {
  const bodyArea = moduleBodyArea({
    x: 0,
    y: 0,
    w: Math.max(0.4, probeModuleW),
    h: Math.max(0.6, moduleH),
  });
  const blocks = modules.flatMap((module) => normalizeModuleBlocks(module, {}));
  premeasurePrimitives(blocks, bodyArea, { ...options, layoutType });
}

function measureModuleWidthDemand(module, layoutType, probeModuleW, moduleH, options = {}) {
  const framePaddingW = 0.26;
  const blocks = normalizeModuleBlocks(module, {});
  const bodyArea = moduleBodyArea({ x: 0, y: 0, w: Math.max(0.4, probeModuleW), h: Math.max(0.6, moduleH) });
  const measureOptions = { ...options, layoutType };
  premeasurePrimitives(blocks, bodyArea, measureOptions);
  const measures = blocks.map((block) => measurePrimitive(block, bodyArea, measureOptions));
  const min = Math.max(0.6, ...measures.map((measure) => Number(measure.minSize?.w || 0))) + framePaddingW;
  const preferred = Math.max(min, ...measures.map((measure) => Number(measure.preferredSize?.w || 0) + framePaddingW));
  const maxUseful = Math.max(preferred, ...measures.map((measure) => Number(measure.maxUsefulSize?.w || 0) + framePaddingW));
  return {
    min,
    preferred,
    maxUseful,
    diagnostics: measures.flatMap((measure) => measure.diagnostics || []),
  };
}

function allocateMeasuredWidths(demands, availableW) {
  const minTotal = demands.reduce((sum, demand) => sum + Number(demand.min || 0), 0);
  const preferredTotal = demands.reduce((sum, demand) => sum + Number(demand.preferred || 0), 0);
  if (minTotal > availableW + 0.001) return demands.map((demand) => Number(demand.min || 0));
  if (preferredTotal <= availableW) {
    const widths = demands.map((demand) => Number(demand.preferred || 0));
    let slack = availableW - preferredTotal;
    for (let idx = 0; idx < widths.length && slack > 0.001; idx += 1) {
      const capacity = Math.max(0, Number(demands[idx].maxUseful || widths[idx]) - widths[idx]);
      const grow = Math.min(capacity, slack / Math.max(1, widths.length - idx));
      widths[idx] += grow;
      slack -= grow;
    }
    if (slack > 0.001 && widths.length) widths[widths.length - 1] += slack;
    return widths;
  }
  let overflow = preferredTotal - availableW;
  const widths = demands.map((demand) => Number(demand.preferred || 0));
  const shrinkables = demands
    .map((demand, index) => ({ index, capacity: Math.max(0, Number(demand.preferred || 0) - Number(demand.min || 0)) }))
    .filter((item) => item.capacity > 0)
    .sort((a, b) => b.capacity - a.capacity);
  for (const item of shrinkables) {
    if (overflow <= 0) break;
    const shrink = Math.min(item.capacity, overflow);
    widths[item.index] -= shrink;
    overflow -= shrink;
  }
  return widths;
}

function moduleBodyArea(area) {
  return {
    x: area.x + 0.13,
    y: area.y + 0.48,
    w: area.w - 0.26,
    h: area.h - 0.62,
  };
}

module.exports = {
  allocateMeasuredWidths,
  collectBaseWidthMeasurementItems,
  contentLayoutAreas,
  fixedContentLayoutArea,
  measureModuleWidthDemand,
  moduleBodyArea,
  premeasureModuleWidthDemands,
  resolveEvidenceAwareColumnLayout,
};
