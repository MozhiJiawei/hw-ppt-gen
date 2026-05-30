const fs = require("fs");
const path = require("path");
const {
  HW_STYLE,
  addAnalysisSummary,
  addFooter,
  addPageTitle,
  cloneOptions,
  estimateTextBoxHeight,
  grayCard,
  redTitleCard,
  safeText,
  textBox,
} = require("./hw_pptx_helpers");
const {
  createVisualAnchorImage,
  readImageDimensions,
  renderVisualAnchorPptNative,
  resolveRoughSvgSizeTierForArea,
  resolveVisualAnchorRenderPath,
  validateVisualAnchorSpec,
} = require("./hw_diagram_helpers");
const {
  measureDescriptorForIndex,
  resolveMeasuredBlockLayout,
} = require("./layout/adapters");
const {
  collectPremeasurePrimitiveItems,
} = require("./layout/measure_primitives");
const {
  countModuleVisualAnchors,
  getBlockVisualSpec,
  isTextBlock,
  normalizeContentLayout,
  normalizeModuleBlocks,
  normalizeModuleBody,
  visualComponentRole,
} = require("./layout/content_model");
const {
  collectBaseWidthMeasurementItems,
  contentLayoutAreas,
  fixedContentLayoutArea,
  moduleBodyArea,
} = require("./layout/content_layout_planner");
const {
  createPowerPointMeasurementSession,
  premeasureBlocksWithPowerPoint,
} = require("./layout/powerpoint_measurement_provider");

function ensureManifest(pptx) {
  if (!Array.isArray(pptx._hwVisualAnchorManifest)) pptx._hwVisualAnchorManifest = [];
  return pptx._hwVisualAnchorManifest;
}

function ensureMeasurementSession(pptx) {
  if (!pptx._hwPowerPointMeasurementSession) {
    pptx._hwPowerPointMeasurementSession = createPowerPointMeasurementSession();
  }
  return pptx._hwPowerPointMeasurementSession;
}

function normalizePage(page, pptx) {
  const numeric = Number(String(page || "").replace(/^0+/, ""));
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return Array.isArray(pptx._slides) ? pptx._slides.length : undefined;
}

function addSvgVisualAnchorImage(slide, visualAnchor, area) {
  const sizeTier = resolveRoughSvgSizeTierForArea(area);
  const widthByTier = { large: 1400, medium: 1100, small: 860 };
  const image = createVisualAnchorImage(visualAnchor, { width: widthByTier[sizeTier] || 1400, sizeTier });
  const imageArea = fitAreaContain(area, image.width, image.height);
  const data = `data:${image.mimeType};base64,${Buffer.from(image.svg, "utf8").toString("base64")}`;
  slide.addImage({
    data,
    x: imageArea.x,
    y: imageArea.y,
    w: imageArea.w,
    h: imageArea.h,
  });
  return { ...image, imageArea, sizeTier };
}

function renderVisualAnchor(slide, visualAnchor, area) {
  const renderPath = resolveVisualAnchorRenderPath(visualAnchor);
  if (renderPath === "rough_svg") {
    const image = addSvgVisualAnchorImage(slide, visualAnchor, area);
    return {
      renderer: renderPath,
      rendered: true,
      image_format: image.format,
      image_width: image.width,
      image_height: image.height,
      image_size_tier: image.sizeTier,
      image_area: image.imageArea,
    };
  }
  const nativeResult = renderVisualAnchorPptNative(slide, visualAnchor, area) || {};
  return { renderer: renderPath, rendered: true, ...nativeResult };
}

function normalizeVisualAnchorCaption(data = {}) {
  const caption = data.visual_anchor_caption ?? data.caption;
  if (!caption) return null;
  if (typeof caption === "string" || Array.isArray(caption)) return { text: caption };
  if (typeof caption === "object") {
    return {
      text: caption.text || caption.body || caption.caption || caption.legend || "",
      source: caption.source || caption.sourceNote || caption.source_note || "",
      align: caption.align || "center",
    };
  }
  return { text: String(caption) };
}

function normalizeHighlightReason(data = {}) {
  const reason = data.highlightReason
    ?? data.highlight_reason
    ?? data.whyHighlight
    ?? data.why_highlight
    ?? "";
  return safeText(reason);
}

function addVisualAnchorCaption(slide, caption, renderResult, visualSlot, visualArea) {
  const text = Array.isArray(caption.text) ? caption.text.filter(Boolean).join("\n") : safeText(caption.text);
  const source = safeText(caption.source);
  if (!text) return null;

  const imageArea = renderResult.image_area || visualArea;
  const captionH = source ? 0.58 : 0.46;
  const captionY = Math.min(
    imageArea.y + imageArea.h + 0.06,
    visualSlot.y + visualSlot.h - captionH
  );
  textBox(slide, text, {
    x: visualSlot.x + 0.12,
    y: captionY,
    w: visualSlot.w - 0.24,
    h: source ? 0.32 : 0.4,
    fontSize: 12,
    bold: true,
    italic: true,
    color: HW_STYLE.color.dark,
    align: caption.align || "center",
    valign: "mid",
    lineSpacingMultiple: 1,
  });
  if (source) {
    textBox(slide, source, {
      x: visualSlot.x + 0.12,
      y: captionY + 0.36,
      w: visualSlot.w - 0.24,
      h: 0.2,
      fontSize: HW_STYLE.size.min,
      color: HW_STYLE.color.gray,
      align: caption.align || "center",
      valign: "mid",
      lineSpacingMultiple: 1,
    });
  }
  return {
    text,
    source,
    area: {
      x: visualSlot.x + 0.12,
      y: captionY,
      w: visualSlot.w - 0.24,
      h: captionH,
    },
  };
}

function premeasureVisualAnchorContentSlides(pptx, slides = [], options = {}) {
  const measurementSession = ensureMeasurementSession(pptx);
  const measureOptions = { ...options, measurementSession };
  const normalized = slides
    .map((data) => {
      const contentLayout = normalizeContentLayout(data.contentLayout);
      if (!contentLayout) return null;
      return {
        contentLayout,
        layoutBounds: fixedContentLayoutArea(contentLayout, HW_STYLE.summary.contentTop),
      };
    })
    .filter(Boolean);

  premeasureBlocksWithPowerPoint(
    normalized.flatMap(({ contentLayout, layoutBounds }) => collectBaseWidthMeasurementItems(contentLayout, layoutBounds, measureOptions)),
    measureOptions
  );

  const finalItems = [];
  normalized.forEach(({ contentLayout, layoutBounds }) => {
    const areas = contentLayoutAreas(contentLayout, layoutBounds, measureOptions);
    finalItems.push(...collectFinalStackMeasurementItems(contentLayout.modules, areas, measureOptions));
  });
  premeasureBlocksWithPowerPoint(finalItems, measureOptions);
  return measurementSession.stats;
}

function normalizePlainCaption(module) {
  const caption = module.visual_anchor_caption || module.caption || {};
  if (typeof caption === "string") return safeText(caption);
  return safeText(caption.text || caption.title || "");
}

function addContentModuleFrame(slide, module, area, options = {}) {
  const title = safeText(module.title || module.label || "模块");
  const headerH = options.compactFrame ? 0.28 : 0.34;
  const bodyTop = options.compactFrame ? 0.3 : 0.34;
  const bodyInsetH = options.compactFrame ? 0.34 : 0.62;
  redTitleCard(slide, title, area.x, area.y, area.w);
  grayCard(slide, {
    x: area.x,
    y: area.y + bodyTop,
    w: area.w,
    h: area.h - bodyTop,
    body: "",
    fill: module.fill || HW_STYLE.color.pale,
  });
  if (options.compactFrame) {
    return {
      x: area.x + 0.1,
      y: area.y + headerH + 0.09,
      w: area.w - 0.2,
      h: area.h - bodyInsetH,
    };
  }
  return moduleBodyArea(area);
}

function addModuleBodyText(slide, text, area, module) {
  if (!safeText(text)) return;
  const fontSize = module.fontSize || module.contentFontSize || HW_STYLE.size.body;
  const options = {
    x: area.x,
    y: area.y,
    w: area.w,
    h: area.h,
    fontSize,
    color: module.color || HW_STYLE.color.text,
    bold: Boolean(module.bold),
    hyperlink: module.hyperlink,
    underline: module.underline,
  };
  const emphasis = normalizeEmphasisTerms(module);
  if (!emphasis.length && !hasStructuredLabel(text)) {
    textBox(slide, text, options);
    return;
  }
  addRichModuleBodyText(slide, text, area, { ...options, fontSize }, emphasis);
}

function addRichModuleBodyText(slide, text, area, options, emphasis) {
  const lines = safeText(text).split(/\r?\n/);
  if (lines.length <= 1) {
    slide.addText(buildEmphasisRuns(text, emphasis, options), richTextBoxOptions(options));
    return;
  }

  const lineGap = Math.max(0.01, (options.fontSize / 72) * 0.14);
  let cursorY = area.y;
  for (const line of lines) {
    const estimatedLineH = estimateTextBoxHeight(line || " ", {
      ...options,
      h: area.h,
      margin: 0.05,
      lineSpacingMultiple: 1.5,
    });
    const remainingH = Math.max(0.05, area.y + area.h - cursorY);
    const lineH = Math.min(remainingH, Math.max(0.18, estimatedLineH));
    slide.addText(buildEmphasisRuns(line, emphasis, options), richTextBoxOptions({
      ...options,
      y: cursorY,
      h: lineH,
    }));
    cursorY += lineH + lineGap;
    if (cursorY >= area.y + area.h) break;
  }
}

function richTextBoxOptions(options) {
  return {
    ...options,
    fontFace: HW_STYLE.font.cn,
    margin: 0.05,
    valign: "top",
    breakLine: false,
    lineSpacingMultiple: 1.5,
  };
}

function addTextModule(slide, module, area) {
  const bodyArea = addContentModuleFrame(slide, module, area);
  addModuleBodyText(slide, normalizeModuleBody(module), bodyArea, module);
}

function normalizeEmphasisTerms(module = {}) {
  const terms = module.emphasis || module.emphasisTerms || module.emphasis_terms || module.redTerms || module.red_terms || [];
  const list = Array.isArray(terms) ? terms : [terms];
  return list
    .flatMap((term) => {
      const value = safeText(term);
      if (!/\s/.test(value)) return [value];
      return value.split(/\s+/).filter((part) => part.length >= 2);
    })
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function isTableAnchor(visualAnchor) {
  return visualAnchor?.kind === "Matrix" && visualAnchor?.template === "table";
}

function isDataCardsAnchor(visualAnchor) {
  return visualAnchor?.kind === "Quantity" && visualAnchor?.template === "data_cards";
}

function buildEmphasisRuns(text, emphasisTerms, options = {}) {
  const value = safeText(text);
  const fontSize = options.fontSize || HW_STYLE.size.body;
  const baseOptions = {
    fontSize,
    color: options.color || HW_STYLE.color.text,
    bold: Boolean(options.bold),
    hyperlink: options.hyperlink,
    underline: options.underline,
  };
  const structured = splitStructuredLabel(value);
  if (structured) {
    return [
      ...(structured.prefix ? [{ text: structured.prefix, options: baseOptions }] : []),
      { text: structured.label, options: { ...baseOptions, bold: true } },
      { text: structured.delimiter, options: { ...baseOptions, bold: true } },
      ...buildEmphasisRunsInSegment(structured.rest, emphasisTerms, baseOptions),
    ];
  }
  return buildEmphasisRunsInSegment(value, emphasisTerms, baseOptions);
}

function buildEmphasisRunsInSegment(value, emphasisTerms, baseOptions) {
  const fontSize = baseOptions.fontSize || HW_STYLE.size.body;
  const runs = [];
  let cursor = 0;
  while (cursor < value.length) {
    const match = findNextEmphasis(value, cursor, emphasisTerms);
    if (!match) {
      runs.push({ text: value.slice(cursor), options: baseOptions });
      break;
    }
    if (match.index > cursor) {
      runs.push({ text: value.slice(cursor, match.index), options: baseOptions });
    }
    runs.push({ text: match.term, options: { fontSize, color: HW_STYLE.color.red, bold: true } });
    cursor = match.index + match.term.length;
  }
  return runs.length ? runs : [{ text: value, options: baseOptions }];
}

function hasStructuredLabel(text) {
  return safeText(text).split(/\r?\n/).some((line) => Boolean(splitStructuredLabel(line)));
}

function splitStructuredLabel(text) {
  const value = safeText(text);
  const match = value.match(/^(\s*(?:[-•]\s*)?)([^：:\n]{2,18})([：:])(\s*.+)$/);
  if (!match) return null;
  const label = match[2].trim();
  if (!label || /[。.!?？；;]/.test(label)) return null;
  return {
    prefix: match[1],
    label: match[2],
    delimiter: match[3],
    rest: match[4],
  };
}

function findNextEmphasis(text, cursor, emphasisTerms) {
  let best = null;
  for (const term of emphasisTerms) {
    const index = text.indexOf(term, cursor);
    if (index < 0) continue;
    if (!best || index < best.index || (index === best.index && term.length > best.term.length)) {
      best = { index, term };
    }
  }
  return best;
}

function isEvidenceAnchor(visualAnchor) {
  return visualAnchor?.kind === "Evidence" && /^source_(figure|table|screenshot|chart)$/.test(safeText(visualAnchor.template));
}

function readEvidenceSourceDimensions(visualAnchor) {
  const sourcePath = safeText(visualAnchor?.source?.path);
  if (!sourcePath) return null;
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) return null;
  return readImageDimensions(resolved);
}

function resolveBlockFlow(area, blocks) {
  const visibleBlocks = blocks.filter(Boolean);
  if (visibleBlocks.length !== 2) return "top_bottom";
  const hasText = visibleBlocks.some((block) => isTextBlock(block));
  const evidenceBlock = visibleBlocks.find((block) => isEvidenceAnchor(getBlockVisualSpec(block)));
  if (!hasText || !evidenceBlock) return "top_bottom";

  const dimensions = readEvidenceSourceDimensions(getBlockVisualSpec(evidenceBlock));
  if (!dimensions) return "top_bottom";
  const imageRatio = dimensions.width / dimensions.height;
  const panelRatio = area.w / area.h;
  const isTallImage = imageRatio < 0.85;
  const hasRoomForSideText = area.w >= 3.0 && panelRatio >= 1.15;
  return isTallImage && hasRoomForSideText ? "left_right" : "top_bottom";
}

function renderVisualAnchorBlock(slide, block, module, data, area, fallbackCaption = null, options = {}) {
  const visualAnchor = getBlockVisualSpec(block);
  validateVisualAnchorSpec(visualAnchor);
  const caption = options.suppressVisualAnchorCaptions ? null : (normalizeVisualAnchorCaption(block) || fallbackCaption);
  const captionReserveH = caption ? (caption.source ? 0.58 : 0.42) : 0;
  const visualArea = caption
    ? { ...area, h: Math.max(0.55, area.h - captionReserveH) }
    : area;
  const renderResult = renderVisualAnchor(slide, visualAnchor, visualArea);
  const captionResult = caption ? addVisualAnchorCaption(slide, caption, renderResult, area, visualArea) : null;
  return { visualAnchor, visualSlot: area, visualArea, renderResult, captionResult };
}

function renderModuleBlock(slide, block, module, data, area, fallbackCaption = null, options = {}) {
  const type = block.type || "text";
  if (type === "visual_anchor" || type === "supporting_component") {
    return renderVisualAnchorBlock(slide, block, module, data, area, fallbackCaption, options);
  }
  if (type === "image") {
    throw new Error("contentLayout image blocks were removed; use visual_anchor kind=Evidence/template=source_figure with text annotations.");
  }
  if (type === "table") {
    throw new Error("contentLayout table blocks were removed; use type=supporting_component with component kind=Matrix/template=table.");
  }
  addModuleBodyText(slide, normalizeModuleBody(block), area, {
    ...module,
    ...block,
    fontSize: block.fontSize || module.fontSize,
    color: block.color || module.color,
    bold: block.bold ?? module.bold,
    hyperlink: block.hyperlink || module.hyperlink,
    underline: block.underline ?? module.underline,
  });
  return null;
}

function addContentPanelModule(slide, module, data, area, visualCaption, options = {}) {
  const bodyArea = addContentModuleFrame(slide, module, area, options);
  const blocks = normalizeModuleBlocks(module, data);
  const resolvedFlow = resolveBlockFlow(bodyArea, blocks);
  const measuredLayout = resolveMeasuredBlockLayout(bodyArea, blocks, resolvedFlow, options);
  const blockAreas = measuredLayout.areas;
  if (measuredLayout.usedFallback || !["ok", "empty"].includes(measuredLayout.status)) {
    const diagnosticSummary = (measuredLayout.diagnostics || []).map((item) => {
      const claimants = Array.isArray(item.claimants)
        ? ` claimants=${item.claimants.map((claim) => `${claim.taxonomy_key || claim.index}:minH=${claim.min_h || ""}:minW=${claim.min_w || ""}`).join("|")}`
        : "";
      return `${item.code}${item.available_height ? ` availableH=${item.available_height}` : ""}${item.minimum_required_height ? ` minH=${item.minimum_required_height}` : ""}${item.available_width ? ` availableW=${item.available_width}` : ""}${item.measured_width ? ` measuredW=${item.measured_width}` : ""}${claimants}`;
    }).join(", ");
    throw new Error(`Measured content layout is infeasible for module "${safeText(module.title || module.label || "模块")}": ${diagnosticSummary}`);
  }
  const anchorResults = [];
  const visibleAreas = [];
  const blockMetrics = [];
  blocks.forEach((block, idx) => {
    const fallbackCaption = options.suppressVisualAnchorCaptions ? null : (idx === 0 ? visualCaption : null);
    const result = renderModuleBlock(slide, block, module, data, blockAreas[idx], fallbackCaption, options);
    if (result) {
      anchorResults.push(result);
      visibleAreas[idx] = result.renderResult.image_area || result.visualArea || blockAreas[idx];
    } else {
      visibleAreas[idx] = blockAreas[idx];
    }
    blockMetrics[idx] = describeBlockLayout(
      block,
      blockAreas[idx],
      visibleAreas[idx],
      options,
      measureDescriptorForIndex(measuredLayout, idx)
    );
  });
  return {
    anchorResults,
    moduleLayout: {
      title: safeText(module.title || module.label || "模块"),
      frame_area: area,
      module_body_slot: bodyArea,
      resolved_flow: resolvedFlow,
      occupied_area: unionAreas(blockAreas),
      visible_occupied_area: unionAreas(visibleAreas),
      block_gaps: calculateBlockGaps(blockAreas, resolvedFlow),
      block_areas: blockMetrics,
      layout_status: measuredLayout.status,
      layout_engine: measuredLayout.usedFallback ? "legacy_split_block_areas" : "measure_stack",
      layout_diagnostics: measuredLayout.diagnostics || [],
      layout_budget: measuredLayout.usedFallback ? undefined : {
        available_main: measuredLayout.available_main,
        min_total: measuredLayout.min_total,
        preferred_total: measuredLayout.preferred_total,
      },
    },
  };
}

function describeBlockLayout(block, blockArea, visibleArea, options = {}, measuredDescriptor = null) {
  const visualAnchor = getBlockVisualSpec(block);
  const descriptor = {
    type: block?.type || "text",
    area: blockArea,
    visible_area: visibleArea,
  };
  if (visualAnchor) {
    descriptor.kind = visualAnchor.kind;
    descriptor.template = visualAnchor.template;
    descriptor.visual_role = visualComponentRole(visualAnchor);
  }
  if (measuredDescriptor) {
    descriptor.taxonomy = measuredDescriptor.taxonomy;
    descriptor.measure = measuredDescriptor.measure;
    descriptor.layout_diagnostics = measuredDescriptor.layout_diagnostics;
    if (blockArea) {
      descriptor.final_size = {
        w: Number(Number(blockArea.w || 0).toFixed(3)),
        h: Number(Number(blockArea.h || 0).toFixed(3)),
      };
    }
  }
  if (isTextBlock(block)) {
    const body = normalizeModuleBody(block);
    const lines = body.split(/\r?\n/).map((line) => safeText(line)).filter(Boolean);
    descriptor.text_length = safeText(body).length;
    descriptor.line_count = lines.length;
    descriptor.max_line_length = lines.reduce((max, line) => Math.max(max, line.replace(/^-\s*/, "").length), 0);
    descriptor.emphasis_count = normalizeEmphasisTerms(block).length;
  } else if (isEvidenceAnchor(visualAnchor)) {
    const dimensions = readEvidenceSourceDimensions(visualAnchor);
    if (dimensions && blockArea) {
      descriptor.source_width = dimensions.width;
      descriptor.source_height = dimensions.height;
      descriptor.natural_height = Math.min(blockArea.h, blockArea.w / (dimensions.width / dimensions.height));
    }
  } else if (isTableAnchor(visualAnchor)) {
    descriptor.table_rows = Array.isArray(visualAnchor.visual_spec?.rows) ? visualAnchor.visual_spec.rows.length : 0;
  } else if (isDataCardsAnchor(visualAnchor)) {
    descriptor.data_cards_count = Array.isArray(visualAnchor.visual_spec?.cards) ? visualAnchor.visual_spec.cards.length : 0;
  }
  if (options.suppressVisualAnchorCaptions) descriptor.caption_suppressed = true;
  return descriptor;
}

function calculateBlockGaps(blockAreas = [], flow = "top_bottom") {
  const rects = blockAreas.filter(isRectLikeLocal);
  if (rects.length < 2) return [];
  const horizontal = flow === "left_right" || flow === "right_left";
  const ordered = [...rects].sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
  return ordered.slice(1).map((rect, idx) => {
    const prev = ordered[idx];
    const gap = horizontal ? rect.x - (prev.x + prev.w) : rect.y - (prev.y + prev.h);
    return Math.max(0, Math.round(gap * 1000) / 1000);
  });
}

function isRectLikeLocal(value) {
  return value
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.y))
    && Number.isFinite(Number(value.w))
    && Number.isFinite(Number(value.h))
    && Number(value.w) > 0
    && Number(value.h) > 0;
}

function unionAreas(areas = []) {
  const rects = areas.filter((area) => area && Number.isFinite(area.x) && Number.isFinite(area.y) && Number.isFinite(area.w) && Number.isFinite(area.h));
  if (!rects.length) return null;
  const left = Math.min(...rects.map((area) => area.x));
  const top = Math.min(...rects.map((area) => area.y));
  const right = Math.max(...rects.map((area) => area.x + area.w));
  const bottom = Math.max(...rects.map((area) => area.y + area.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function addModuleRect(slide, area, options = {}) {
  slide.addShape("rect", {
    x: area.x,
    y: area.y,
    w: area.w,
    h: area.h,
    fill: { color: options.fill || "FFFFFF" },
    line: { color: options.border || HW_STYLE.color.line, width: options.lineWidth || 0.5 },
  });
}

function addModuleLine(slide, x1, y1, x2, y2, options = {}) {
  slide.addShape("line", {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: {
      color: options.color || HW_STYLE.color.line,
      width: options.width || 0.5,
      dash: options.dash,
      beginArrowType: "none",
      endArrowType: options.endArrowType || "none",
    },
  });
}

function addColumnFlowArrows(slide, areas, options = {}) {
  const arrows = options.arrows || [];
  if (!arrows.length || areas.length < 2) return;
  const color = options.color || HW_STYLE.color.red;
  for (let idx = 0; idx < areas.length - 1; idx += 1) {
    const left = areas[idx];
    const right = areas[idx + 1];
    const x1 = left.x + left.w + 0.04;
    const x2 = right.x - 0.04;
    arrows.forEach((ratio) => {
      const y = left.y + left.h * ratio;
      addModuleLine(slide, x1, y, x2, y, { color, width: 0.5 });
      textBox(slide, ">", {
        x: left.x + left.w - 0.02,
        y: y - 0.11,
        w: 0.22,
        h: 0.22,
        fontSize: 18,
        bold: true,
        color,
        align: "center",
        valign: "mid",
        lineSpacingMultiple: 1,
      });
    });
  }
}

function addVisualAnchorModule(slide, module, data, area, visualCaption) {
  return addContentPanelModule(slide, module, data, area, visualCaption);
}

function addBiasedVisualOnlyModule(slide, module, data, area, options = {}) {
  const blocks = normalizeModuleBlocks(module, data);
  const flow = resolveBlockFlow(area, blocks);
  const biasedOptions = { ...options, layoutType: "biased_column" };
  const measuredLayout = resolveMeasuredBlockLayout(area, blocks, flow, biasedOptions);
  if (measuredLayout.usedFallback || !["ok", "empty"].includes(measuredLayout.status)) {
    const diagnosticSummary = (measuredLayout.diagnostics || []).map((item) => item.code).join(", ");
    throw new Error(`Measured biased_column visual module is infeasible: ${diagnosticSummary}`);
  }
  const anchorResults = [];
  const visibleAreas = [];
  const blockMetrics = [];
  blocks.forEach((block, idx) => {
    const result = renderModuleBlock(slide, block, module, data, measuredLayout.areas[idx], normalizeVisualAnchorCaption(block) || normalizeVisualAnchorCaption(module), biasedOptions);
    if (result) {
      anchorResults.push(result);
      visibleAreas[idx] = result.renderResult.image_area || result.visualArea || measuredLayout.areas[idx];
    } else {
      visibleAreas[idx] = measuredLayout.areas[idx];
    }
    blockMetrics[idx] = describeBlockLayout(
      block,
      measuredLayout.areas[idx],
      visibleAreas[idx],
      biasedOptions,
      measureDescriptorForIndex(measuredLayout, idx)
    );
  });
  return {
    anchorResults,
    moduleLayout: {
      title: safeText(module.title || module.label || "主视觉"),
      frame_area: area,
      module_body_slot: area,
      resolved_flow: flow,
      occupied_area: unionAreas(measuredLayout.areas),
      visible_occupied_area: unionAreas(visibleAreas),
      block_gaps: calculateBlockGaps(measuredLayout.areas, flow),
      block_areas: blockMetrics,
      layout_status: measuredLayout.status,
      layout_engine: "measure_stack",
      layout_diagnostics: measuredLayout.diagnostics || [],
      layout_budget: {
        available_main: measuredLayout.available_main,
        min_total: measuredLayout.min_total,
        preferred_total: measuredLayout.preferred_total,
      },
    },
  };
}

function renderBiasedContentLayout(slide, data, layout, contentTop, options = {}) {
  const layoutBounds = fixedContentLayoutArea(layout, contentTop);
  const areas = contentLayoutAreas(layout, layoutBounds, options);
  const moduleOptions = { ...options, layoutType: layout.type };
  const sideModuleOptions = { ...moduleOptions, compactFrame: true };
  const visualResult = addBiasedVisualOnlyModule(slide, layout.modules[0], data, areas[0], moduleOptions);
  const anchorResults = [...visualResult.anchorResults];
  const moduleLayouts = [visualResult.moduleLayout];
  layout.modules.slice(1).forEach((module, idx) => {
    const result = addContentPanelModule(slide, module, data, areas[idx + 1], null, sideModuleOptions);
    anchorResults.push(...result.anchorResults);
    moduleLayouts.push(result.moduleLayout);
  });
  const strictVisualAnchorBlocksCount = moduleLayouts.reduce((sum, module) => {
    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    return sum + blocks.filter((block) => block.visual_role === "visual_anchor").length;
  }, 0);
  const supportingComponentBlocksCount = moduleLayouts.reduce((sum, module) => {
    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    return sum + blocks.filter((block) => block.visual_role === "supporting_component").length;
  }, 0);
  return {
    anchorResults,
    layoutInfo: {
      type: layout.type,
      reference: layout.reference,
      modules_count: layout.modules.length,
      image_modules_count: 0,
      table_modules_count: 0,
      text_modules_count: layout.modules.filter((module) => !countModuleVisualAnchors(module)).length,
      visual_anchor_modules_count: anchorResults.length,
      visual_anchor_blocks_count: anchorResults.length,
      strict_visual_anchor_blocks_count: strictVisualAnchorBlocksCount,
      supporting_component_blocks_count: supportingComponentBlocksCount,
      module_layouts: moduleLayouts,
      variant: "large_visual_with_side_cards",
    },
  };
}

function renderContentLayout(slide, data, layout, visualCaption, contentTop, options = {}) {
  if (layout.schema.special === "large_visual_with_side_cards") {
    return renderBiasedContentLayout(slide, data, layout, contentTop, options);
  }
  const layoutBounds = fixedContentLayoutArea(layout, contentTop);
  const areas = contentLayoutAreas(layout, layoutBounds, options);
  const anchorResults = [];
  const moduleLayouts = [];
  const moduleOptions = {
    ...options,
    suppressVisualAnchorCaptions: layout.type === "two_column" || layout.type === "three_column",
    layoutType: layout.type,
  };
  premeasureFinalModuleStacks(layout.modules, areas, moduleOptions);
  layout.modules.forEach((module, idx) => {
    const area = areas[idx];
    const result = addContentPanelModule(slide, module, data, area, visualCaption, moduleOptions);
    anchorResults.push(...result.anchorResults);
    moduleLayouts.push(result.moduleLayout);
  });
  const strictVisualAnchorBlocksCount = moduleLayouts.reduce((sum, module) => {
    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    return sum + blocks.filter((block) => block.visual_role === "visual_anchor").length;
  }, 0);
  const supportingComponentBlocksCount = moduleLayouts.reduce((sum, module) => {
    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    return sum + blocks.filter((block) => block.visual_role === "supporting_component").length;
  }, 0);
  addColumnFlowArrows(slide, areas, layout.flowArrows || {});
  return {
    anchorResults,
    layoutInfo: {
      type: layout.type,
      reference: layout.reference,
      modules_count: layout.modules.length,
      image_modules_count: 0,
      table_modules_count: 0,
      text_modules_count: layout.modules.filter((module) => !countModuleVisualAnchors(module)).length,
      visual_anchor_modules_count: anchorResults.length,
      visual_anchor_blocks_count: anchorResults.length,
      strict_visual_anchor_blocks_count: strictVisualAnchorBlocksCount,
      supporting_component_blocks_count: supportingComponentBlocksCount,
      module_layouts: moduleLayouts,
    },
  };
}

function premeasureFinalModuleStacks(modules = [], areas = [], options = {}) {
  premeasureBlocksWithPowerPoint(collectFinalStackMeasurementItems(modules, areas, options), options);
}

function collectFinalStackMeasurementItems(modules = [], areas = [], options = {}) {
  const items = [];
  const itemsByFlow = new Map();
  modules.forEach((module, idx) => {
    const bodyArea = moduleBodyArea(areas[idx]);
    const blocks = normalizeModuleBlocks(module, {});
    const flow = resolveBlockFlow(bodyArea, blocks);
    const key = `${flow}|${roundMeasurementArea(bodyArea).w}|${roundMeasurementArea(bodyArea).h}`;
    const entry = itemsByFlow.get(key) || { area: bodyArea, blocks: [] };
    entry.blocks.push(...blocks);
    itemsByFlow.set(key, entry);
  });
  for (const entry of itemsByFlow.values()) {
    items.push(...collectPremeasurePrimitiveItems(entry.blocks, entry.area, options));
  }
  return items;
}

function roundMeasurementArea(area = {}) {
  return {
    w: Number(Number(area.w || 0).toFixed(3)),
    h: Number(Number(area.h || 0).toFixed(3)),
  };
}

function fitAreaContain(area, imageWidth, imageHeight) {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    throw new Error("fitAreaContain requires positive image dimensions.");
  }
  const areaRatio = area.w / area.h;
  const imageRatio = imageWidth / imageHeight;
  if (imageRatio >= areaRatio) {
    const h = area.w / imageRatio;
    return { x: area.x, y: area.y, w: area.w, h };
  }
  const w = area.h * imageRatio;
  return { x: area.x + (area.w - w) / 2, y: area.y, w, h: area.h };
}

function addVisualAnchorContentSlide(pptx, data = {}) {
  const contentLayout = normalizeContentLayout(data.contentLayout);
  if (!contentLayout) throw new Error("Content slide requires contentLayout; put visual anchors under contentLayout.modules[].blocks[].visual_anchor.");

  const slide = pptx.addSlide();
  const measurementSession = ensureMeasurementSession(pptx);
  const titleLayout = addPageTitle(slide, data.title || "页面标题", {
    kicker: data.kicker || "",
    subtitle: data.titleNote || data.titleSubtitle || "",
    sections: data.sections || [],
    currentSection: data.currentSection || data.section,
    fixedChrome: true,
  });
  const summaryY = HW_STYLE.summary.y;
  const contentTop = HW_STYLE.summary.contentTop;
  addAnalysisSummary(slide, data.summary, { y: summaryY });

  const visualCaption = normalizeVisualAnchorCaption(data);
  const highlightReason = normalizeHighlightReason(data);
  const scoreBasis = safeText(data.scoreBasis ?? data.score_basis ?? "");
  let anchorResults = [];
  let layoutInfo = null;
  let resolvedLayoutType = null;
  const result = renderContentLayout(slide, data, contentLayout, visualCaption, contentTop, { measurementSession });
  anchorResults = result.anchorResults;
  layoutInfo = result.layoutInfo;
  resolvedLayoutType = layoutInfo?.type || null;
  addFooter(slide, { source: data.source, page: data.page });

  anchorResults.forEach((anchorResult) => {
    const visualRole = visualComponentRole(anchorResult.visualAnchor);
    ensureManifest(pptx).push({
      page: normalizePage(data.page, pptx),
      visual_component_id: anchorResult.visualAnchor.id,
      kind: anchorResult.visualAnchor.kind,
      template: anchorResult.visualAnchor.template,
      visual_role: visualRole,
      visual_anchor: visualRole === "visual_anchor" ? cloneOptions(anchorResult.visualAnchor) : undefined,
      supporting_component: visualRole === "supporting_component" ? cloneOptions(anchorResult.visualAnchor) : undefined,
      renderer: anchorResult.renderResult.renderer,
      rendered: anchorResult.renderResult.rendered,
      image_format: anchorResult.renderResult.image_format,
      image_width: anchorResult.renderResult.image_width,
      image_height: anchorResult.renderResult.image_height,
      placeholder: anchorResult.renderResult.placeholder || undefined,
      image_area: anchorResult.renderResult.image_area,
      visual_slot: anchorResult.visualSlot,
      visual_area: anchorResult.visualArea,
      visual_anchor_caption: anchorResult.captionResult,
      resolved_layout_type: resolvedLayoutType || undefined,
      highlight_reason: highlightReason || undefined,
      score_basis: scoreBasis || undefined,
      content_layout_schema: layoutInfo || undefined,
    });
  });
  return slide;
}

function writeVisualAnchorManifest(pptx, fileName) {
  if (!fileName) throw new Error("writeVisualAnchorManifest requires a file path.");
  const normalized = String(fileName).replace(/\\/g, "/");
  if (!normalized.includes("/.tmp/") && !normalized.startsWith(".tmp/")) {
    throw new Error(`Generated visual anchor manifests must be saved under .tmp: ${fileName}`);
  }
  const manifest = {
    generated_at: new Date().toISOString(),
    slides: ensureManifest(pptx),
  };
  fs.mkdirSync(path.dirname(fileName), { recursive: true });
  fs.writeFileSync(fileName, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

module.exports = {
  addVisualAnchorContentSlide,
  premeasureVisualAnchorContentSlides,
  writeVisualAnchorManifest,
};
