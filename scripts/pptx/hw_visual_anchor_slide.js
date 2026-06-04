const fs = require("fs");
const path = require("path");
const {
  HW_STYLE,
  cloneOptions,
  estimateTextBoxHeight,
  grayCard,
  redTitleCard,
  safeText,
  textBox,
} = require("./hw_pptx_helpers");
const { addHuaweiPptPageSkeleton } = require("./skeleton/page_skeleton");
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
} = require("./layout/adapters");
const {
  collectPremeasurePrimitiveItems,
} = require("./layout/measure_primitives");
const {
  layoutModuleStack,
  measureStackPrimitives,
} = require("./layout/stack_layout");
const {
  countModuleVisualAnchors,
  getBlockVisualSpec,
  isTextBlock,
  modulePrimitives,
  normalizeTextPrimitiveBody,
  visualComponentRole,
} = require("./layout/content_model");
const {
  collectBaseWidthMeasurementItems,
  bodyLayoutAreas,
  fixedBodyLayoutArea,
  moduleBodyArea,
} = require("./layout/body_layout_planner");
const {
  createPowerPointMeasurementSession,
  premeasureBlocksWithPowerPoint,
} = require("./layout/powerpoint_measurement_provider");
const { createFeedbackCliError, feedbackToCliText } = require("./feedback/feedback_reporter");
const { runDslInputChecks } = require("./qa/dsl_input_checks");
const { runMeasurementChecks } = require("./qa/measurement_checks");
const { runLayoutChecks } = require("./qa/layout_checks");

const LAYOUT_SPACING_TOKENS = [0.06, 0.08, 0.11, 0.12, 0.14, 0.18, 0.28, 0.38];

function ensureBodyPipelinePages(pptx) {
  if (!Array.isArray(pptx._hwBodyPipelinePages)) pptx._hwBodyPipelinePages = [];
  return pptx._hwBodyPipelinePages;
}

function collectBodyPipelinePages(pptx) {
  return Array.isArray(pptx?._hwBodyPipelinePages) ? pptx._hwBodyPipelinePages : [];
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

function renderVisualAnchor(slide, visualAnchor, area, options = {}) {
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
  const internalSpec = options.fitMode === "axis_scale"
    ? { ...visualAnchor, __hwLayoutFitMode: "fill" }
    : visualAnchor;
  const nativeResult = renderVisualAnchorPptNative(slide, internalSpec, area) || {};
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
      const bodyLayout = resolveBodyRenderModel(data);
      if (!bodyLayout) return null;
      return {
        bodyLayout,
        layoutBounds: fixedBodyLayoutArea(bodyLayout, HW_STYLE.summary.contentTop),
      };
    })
    .filter(Boolean);

  premeasureBlocksWithPowerPoint(
    normalized.flatMap(({ bodyLayout, layoutBounds }) => collectBaseWidthMeasurementItems(bodyLayout, layoutBounds, measureOptions)),
    measureOptions
  );

  const finalItems = [];
  normalized.forEach(({ bodyLayout, layoutBounds }) => {
    const areas = bodyLayoutAreas(bodyLayout, layoutBounds, measureOptions);
    finalItems.push(...collectFinalStackMeasurementItems(bodyLayout.modules, areas, measureOptions));
  });
  premeasureBlocksWithPowerPoint(finalItems, measureOptions);
  return measurementSession.stats;
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

function plannedContentModuleBodyArea(area, options = {}) {
  if (options.frameless) return area;
  if (options.compactFrame) {
    return {
      x: area.x + 0.1,
      y: area.y + 0.28 + 0.09,
      w: area.w - 0.2,
      h: area.h - 0.34,
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
  const renderResult = renderVisualAnchor(slide, visualAnchor, visualArea, options);
  const captionResult = caption ? addVisualAnchorCaption(slide, caption, renderResult, area, visualArea) : null;
  return { visualAnchor, visualSlot: area, visualArea, renderResult, captionResult };
}

function renderModuleBlock(slide, block, module, data, area, fallbackCaption = null, options = {}) {
  const type = block.type || "text";
  if (type === "visual_anchor" || type === "supporting_component") {
    return renderVisualAnchorBlock(slide, block, module, data, area, fallbackCaption, options);
  }
  if (!isTextBlock(block)) {
    throw new Error(`Unsupported Body DSL primitive type: ${type}.`);
  }
  addModuleBodyText(slide, normalizeTextPrimitiveBody(block), area, {
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

function planContentModule(module, data, area, options = {}) {
  const bodyArea = plannedContentModuleBodyArea(area, options);
  const blocks = modulePrimitives(module, data);
  const resolvedFlow = resolveBlockFlow(bodyArea, blocks);
  const stackLayout = layoutModuleStack(bodyArea, blocks, resolvedFlow, {
    ...options,
    premeasuredMeasures: options.premeasuredMeasures,
  });
  const blockAreas = stackLayout.areas;
  if (stackLayout.usedFallback || !["ok", "empty"].includes(stackLayout.status)) {
    const diagnosticSummary = (stackLayout.diagnostics || []).map((item) => {
      const claimants = Array.isArray(item.claimants)
        ? ` claimants=${item.claimants.map((claim) => `${claim.target?.selector || claim.taxonomy_key || claim.index}:minH=${claim.min_h || ""}:minW=${claim.min_w || ""}`).join("|")}`
        : "";
      const target = item.target?.selector ? ` target=${item.target.selector}` : "";
      return `${item.code}${target}${item.available_height ? ` availableH=${item.available_height}` : ""}${item.minimum_required_height ? ` minH=${item.minimum_required_height}` : ""}${item.available_width ? ` availableW=${item.available_width}` : ""}${item.measured_width ? ` measuredW=${item.measured_width}` : ""}${claimants}`;
    }).join(", ");
    throw new Error(`Body DSL layout is infeasible for module "${safeText(module.title || module.label || "模块")}": ${diagnosticSummary}`);
  }
  const blockMetrics = [];
  const visibleAreas = blocks.map((block, idx) => plannedBlockVisibleArea(
    block,
    blockAreas[idx],
    measureDescriptorForIndex(stackLayout, idx)
  ));
  blocks.forEach((block, idx) => {
    blockMetrics[idx] = describeBlockLayout(
      block,
      blockAreas[idx],
      visibleAreas[idx],
      options,
      measureDescriptorForIndex(stackLayout, idx)
    );
  });
  return {
    module,
    blocks,
    options,
    stackLayout,
    blockAreas,
    blockRenderAreas: blocks.map((block, idx) => isEvidenceAnchor(getBlockVisualSpec(block)) ? visibleAreas[idx] : blockAreas[idx]),
    blockFitModes: blocks.map((block, idx) => blockFitMode(block, blockAreas[idx], visibleAreas[idx])),
    moduleLayout: {
      title: safeText(module.title || module.label || "模块"),
      source_component: cloneOptions(module.sourceComponent?.source),
      frame_area: area,
      module_body_slot: bodyArea,
      resolved_flow: resolvedFlow,
      occupied_area: unionAreas(blockAreas),
      visible_occupied_area: unionAreas(visibleAreas),
      block_gaps: calculateBlockGaps(blockAreas, resolvedFlow),
      block_areas: blockMetrics,
      layout_status: stackLayout.status,
      layout_engine: "measure_stack",
      layout_budget: {
        available_main: stackLayout.available_main,
        min_total: stackLayout.min_total,
        preferred_total: stackLayout.preferred_total,
      },
    },
  };
}

function plannedBlockVisibleArea(block, blockArea, measuredDescriptor = null) {
  if (isTextBlock(block)) {
    const preferred = measuredDescriptor?.measure?.preferred_size;
    const preferredH = Number(preferred?.h || 0);
    if (blockArea && preferredH > 0) {
      return { ...blockArea, h: Math.min(Number(blockArea.h || 0), preferredH) };
    }
    return blockArea;
  }
  const visualAnchor = getBlockVisualSpec(block);
  if (!isEvidenceAnchor(visualAnchor)) return blockArea;
  if (String(visualAnchor.fit || "contain").toLowerCase() === "stretch") return blockArea;
  const dimensions = readEvidenceSourceDimensions(visualAnchor);
  if (!dimensions || !blockArea) return blockArea;
  const contained = fitAreaContain(blockArea, dimensions.width, dimensions.height);
  return fitEvidenceAreaWithinEnvelope(blockArea, contained, measuredDescriptor?.measure?.resize_limits);
}

function renderPlannedContentModule(slide, plan, data, visualCaption) {
  if (!plan.options.frameless) addContentModuleFrame(slide, plan.module, plan.moduleLayout.frame_area, plan.options);
  const anchorResults = [];
  plan.blocks.forEach((block, idx) => {
    const fallbackCaption = plan.options.suppressVisualAnchorCaptions ? null : (idx === 0 ? visualCaption : null);
    const result = renderModuleBlock(slide, block, plan.module, data, plan.blockRenderAreas?.[idx] || plan.blockAreas[idx], fallbackCaption, {
      ...plan.options,
      fitMode: plan.blockFitModes?.[idx],
    });
    if (result) anchorResults.push(result);
  });
  return anchorResults;
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
  if (block?.sourceComponent) descriptor.source_component = cloneOptions(block.sourceComponent);
  if (measuredDescriptor) {
    descriptor.taxonomy = measuredDescriptor.taxonomy;
    descriptor.measure = measuredDescriptor.measure;
    descriptor.resize_policy = measuredDescriptor.measure?.resize_policy;
    descriptor.resize_limits = measuredDescriptor.measure?.resize_limits;
    descriptor.unused_space = describeUnusedSpace(blockArea, visibleArea);
    if (blockArea) {
      descriptor.final_size = {
        w: Number(Number(blockArea.w || 0).toFixed(3)),
        h: Number(Number(blockArea.h || 0).toFixed(3)),
      };
    }
  }
  if (isTextBlock(block)) {
    const body = normalizeTextPrimitiveBody(block);
    const lines = body.split(/\r?\n/).map((line) => safeText(line)).filter(Boolean);
    descriptor.text_length = safeText(body).length;
    descriptor.line_count = lines.length;
    descriptor.max_line_length = lines.reduce((max, line) => Math.max(max, line.replace(/^-\s*/, "").length), 0);
    descriptor.emphasis_count = normalizeEmphasisTerms(block).length;
  } else if (isEvidenceAnchor(visualAnchor)) {
    const dimensions = readEvidenceSourceDimensions(visualAnchor);
    if (dimensions && blockArea) {
      const naturalVisibleArea = fitAreaContain(blockArea, dimensions.width, dimensions.height);
      descriptor.source_width = dimensions.width;
      descriptor.source_height = dimensions.height;
      descriptor.natural_visible_area = naturalVisibleArea;
      descriptor.fit_mode = blockFitMode(block, blockArea, visibleArea);
      descriptor.scale = describeVisualScale(visibleArea, measuredDescriptor?.measure, naturalVisibleArea);
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

function fitEvidenceAreaWithinEnvelope(slotArea, containedArea, resizeLimits = {}) {
  if (!slotArea || !containedArea) return containedArea;
  const axis = resizeLimits.axisScale || resizeLimits.axis_scale;
  if (!axis) return containedArea;
  const maxAxis = Math.max(1, Number(axis.max || 1));
  const maxW = Math.min(Number(slotArea.w || 0), Number(containedArea.w || 0) * maxAxis);
  const maxH = Math.min(Number(slotArea.h || 0), Number(containedArea.h || 0) * maxAxis);
  const nextW = Math.max(Number(containedArea.w || 0), maxW);
  const nextH = Math.max(Number(containedArea.h || 0), maxH);
  return {
    x: Number(slotArea.x || 0) + (Number(slotArea.w || 0) - nextW) / 2,
    y: Number(slotArea.y || 0),
    w: nextW,
    h: nextH,
  };
}

function blockFitMode(block, blockArea, visibleArea) {
  const visualAnchor = getBlockVisualSpec(block);
  if (!isEvidenceAnchor(visualAnchor) || !blockArea || !visibleArea) return undefined;
  const dimensions = readEvidenceSourceDimensions(visualAnchor);
  if (!dimensions) return undefined;
  const contained = fitAreaContain(blockArea, dimensions.width, dimensions.height);
  const stretched = Math.abs(Number(visibleArea.w || 0) - Number(contained.w || 0)) > 0.001
    || Math.abs(Number(visibleArea.h || 0) - Number(contained.h || 0)) > 0.001;
  return stretched ? "axis_scale" : "contain";
}

function describeUnusedSpace(slotArea, visibleArea) {
  if (!slotArea || !visibleArea) return undefined;
  const slotW = Number(slotArea.w || 0);
  const slotH = Number(slotArea.h || 0);
  if (slotW <= 0 || slotH <= 0) return undefined;
  const left = Math.max(0, Number(visibleArea.x || 0) - Number(slotArea.x || 0));
  const top = Math.max(0, Number(visibleArea.y || 0) - Number(slotArea.y || 0));
  const right = Math.max(0, Number(slotArea.x || 0) + slotW - (Number(visibleArea.x || 0) + Number(visibleArea.w || 0)));
  const bottom = Math.max(0, Number(slotArea.y || 0) + slotH - (Number(visibleArea.y || 0) + Number(visibleArea.h || 0)));
  const slotAreaValue = slotW * slotH;
  const visibleAreaValue = Number(visibleArea.w || 0) * Number(visibleArea.h || 0);
  return {
    left: roundLocal(left),
    right: roundLocal(right),
    top: roundLocal(top),
    bottom: roundLocal(bottom),
    xRatio: roundLocal((left + right) / slotW),
    yRatio: roundLocal((top + bottom) / slotH),
    areaRatio: roundLocal(1 - (visibleAreaValue / Math.max(0.001, slotAreaValue))),
  };
}

function describeVisualScale(visibleArea, measure = {}, naturalArea = null) {
  if (!visibleArea) return undefined;
  const basis = naturalArea || measure?.preferred_size || {};
  const preferredW = Number(basis.w || 0);
  const preferredH = Number(basis.h || 0);
  if (preferredW <= 0 || preferredH <= 0) return undefined;
  const scaleX = Number(visibleArea.w || 0) / preferredW;
  const scaleY = Number(visibleArea.h || 0) / preferredH;
  const distortion = Math.max(scaleX / Math.max(0.001, scaleY), scaleY / Math.max(0.001, scaleX));
  return {
    x: roundLocal(scaleX),
    y: roundLocal(scaleY),
    uniform: roundLocal((scaleX + scaleY) / 2),
    distortion: roundLocal(distortion),
  };
}

function roundLocal(value) {
  return Number(Number(value || 0).toFixed(3));
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

function measureBodyLayout(data, layout, contentTop, options = {}) {
  const layoutBounds = fixedBodyLayoutArea(layout, contentTop);
  const areas = bodyLayoutAreas(layout, layoutBounds, options);
  const moduleOptions = {
    ...options,
    suppressVisualAnchorCaptions: layout.type === "two_column" || layout.type === "three_column",
    layoutType: layout.type,
  };
  const moduleMeasurements = layout.modules.map((module, idx) => {
    const optionsForModule = moduleOptionsForMeasuredModule(layout, moduleOptions, idx);
    const bodyArea = plannedContentModuleBodyArea(areas[idx], optionsForModule);
    const blocks = modulePrimitives(module, data);
    const flow = resolveBlockFlow(bodyArea, blocks);
    const measures = measureStackPrimitives(bodyArea, blocks, optionsForModule);
    return {
      moduleIndex: idx,
      area: areas[idx],
      bodyArea,
      flow,
      options: optionsForModule,
      measures,
    };
  });
  const measurement = {
    layoutBounds,
    areas,
    moduleMeasurements,
  };
  return {
    ...measurement,
    seed: {
      layoutBounds,
      areas,
      moduleMeasurements,
    },
  };
}

function moduleOptionsForMeasuredModule(layout, moduleOptions = {}, index = 0) {
  if (layout.schema.special === "large_visual_with_side_cards") {
    if (index === 0) return { ...moduleOptions, frameless: true };
    return { ...moduleOptions, compactFrame: true, blockGap: 0.08 };
  }
  return moduleOptions;
}

function planBiasedBodyLayout(data, layout, contentTop, options = {}) {
  if (!options.measurementIr) throw new Error("planBiasedBodyLayout requires MeasurementIR.");
  const measurementIr = options.measurementIr;
  const layoutSeed = measurementIr.layoutSeed;
  const layoutBounds = layoutSeed.layoutBounds;
  const areas = layoutSeed.areas;
  const moduleOptions = { ...options, layoutType: layout.type };
  const sideModuleOptions = { ...moduleOptions, compactFrame: true, blockGap: 0.08 };
  const modulePlans = [
    planContentModule(layout.modules[0], data, areas[0], {
      ...moduleOptions,
      frameless: true,
      premeasuredMeasures: measuresForModule(measurementIr, 0),
      measureOnDemand: createMeasurementOnDemand(data, measurementIr, 0, { ...moduleOptions, frameless: true }),
    }),
    ...layout.modules.slice(1).map((module, idx) => planContentModule(module, data, areas[idx + 1], {
      ...sideModuleOptions,
      premeasuredMeasures: measuresForModule(measurementIr, idx + 1),
      measureOnDemand: createMeasurementOnDemand(data, measurementIr, idx + 1, sideModuleOptions),
    })),
  ];
  const moduleLayouts = modulePlans.map((plan) => plan.moduleLayout);
  const strictVisualAnchorBlocksCount = moduleLayouts.reduce((sum, module) => {
    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    return sum + blocks.filter((block) => block.visual_role === "visual_anchor").length;
  }, 0);
  const supportingComponentBlocksCount = moduleLayouts.reduce((sum, module) => {
    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    return sum + blocks.filter((block) => block.visual_role === "supporting_component").length;
  }, 0);
  return {
    modulePlans,
    layoutBounds,
    areas,
    layoutInfo: {
      type: layout.type,
      reference: layout.reference,
      modules_count: layout.modules.length,
      image_modules_count: 0,
      table_modules_count: 0,
      text_modules_count: layout.modules.filter((module) => !countModuleVisualAnchors(module)).length,
      visual_anchor_modules_count: strictVisualAnchorBlocksCount,
      visual_anchor_blocks_count: strictVisualAnchorBlocksCount,
      strict_visual_anchor_blocks_count: strictVisualAnchorBlocksCount,
      supporting_component_blocks_count: supportingComponentBlocksCount,
      module_layouts: moduleLayouts,
      variant: "large_visual_with_side_cards",
    },
  };
}

function planBodyLayout(data, layout, contentTop, options = {}) {
  if (layout.schema.special === "large_visual_with_side_cards") {
    return planBiasedBodyLayout(data, layout, contentTop, options);
  }
  if (!options.measurementIr) throw new Error("planBodyLayout requires MeasurementIR.");
  const measurementIr = options.measurementIr;
  const layoutSeed = measurementIr.layoutSeed;
  const layoutBounds = layoutSeed.layoutBounds;
  const areas = layoutSeed.areas;
  const moduleOptions = {
    ...options,
    suppressVisualAnchorCaptions: layout.type === "two_column" || layout.type === "three_column",
    layoutType: layout.type,
  };
  const modulePlans = layout.modules.map((module, idx) => planContentModule(module, data, areas[idx], {
    ...moduleOptions,
    premeasuredMeasures: measuresForModule(measurementIr, idx),
    measureOnDemand: createMeasurementOnDemand(data, measurementIr, idx, moduleOptions),
  }));
  const moduleLayouts = modulePlans.map((plan) => plan.moduleLayout);
  const strictVisualAnchorBlocksCount = moduleLayouts.reduce((sum, module) => {
    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    return sum + blocks.filter((block) => block.visual_role === "visual_anchor").length;
  }, 0);
  const supportingComponentBlocksCount = moduleLayouts.reduce((sum, module) => {
    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    return sum + blocks.filter((block) => block.visual_role === "supporting_component").length;
  }, 0);
  return {
    modulePlans,
    layoutBounds,
    areas,
    layoutInfo: {
      type: layout.type,
      reference: layout.reference,
      modules_count: layout.modules.length,
      image_modules_count: 0,
      table_modules_count: 0,
      text_modules_count: layout.modules.filter((module) => !countModuleVisualAnchors(module)).length,
      visual_anchor_modules_count: strictVisualAnchorBlocksCount,
      visual_anchor_blocks_count: strictVisualAnchorBlocksCount,
      strict_visual_anchor_blocks_count: strictVisualAnchorBlocksCount,
      supporting_component_blocks_count: supportingComponentBlocksCount,
      module_layouts: moduleLayouts,
    },
  };
}

function renderBodyLayoutFromPlan(slide, data, bodyPlan, visualCaption) {
  const anchorResults = [];
  bodyPlan.modulePlans.forEach((modulePlan) => {
    anchorResults.push(...renderPlannedContentModule(slide, modulePlan, data, visualCaption));
  });
  if (bodyPlan.layoutInfo.type !== "biased_column") {
    addColumnFlowArrows(slide, bodyPlan.areas, bodyPlan.flowArrows || {});
  }
  return {
    anchorResults,
    layoutInfo: bodyPlan.layoutInfo,
  };
}

function planBodyDslPipeline(data, pptx, bodyLayout, contentTop, options = {}) {
  const page = normalizePage(data.page, pptx);
  const bodyMeasurement = measureBodyLayout(data, bodyLayout, contentTop, options);
  const measurementIr = measurementIrFromBodyMeasurement(data, page, bodyMeasurement, options.compileIr);
  const bodyPlan = planBodyLayout(data, bodyLayout, contentTop, {
    ...options,
    measurementIr,
  });
  bodyPlan.flowArrows = bodyLayout.flowArrows || {};
  const layoutIr = layoutIrFromBodyPlan(data, page, bodyPlan, options.compileIr, measurementIr);
  layoutIr.producedBeforeRender = true;
  return {
    bodyPlan,
    layoutInfo: bodyPlan.layoutInfo,
    dslResult: options.dslResult,
    compileIr: options.compileIr,
    layoutIr,
    measurementIr,
  };
}

function collectFinalStackMeasurementItems(modules = [], areas = [], options = {}) {
  const items = [];
  const itemsByFlow = new Map();
  modules.forEach((module, idx) => {
    const bodyArea = moduleBodyArea(areas[idx]);
    const blocks = modulePrimitives(module, {});
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
  if (data.skeletonOnly || data.renderMode === "skeleton") {
    return addHuaweiPptPageSkeleton(pptx, data).slide;
  }

  const bodyCompile = resolveBodyCompileResult(data, pptx);
  const bodyLayout = bodyCompile.renderModel;
  if (!bodyLayout) throw new Error("Content slide requires bodyDsl; put visual anchors in registered Body DSL components.");

  const measurementSession = ensureMeasurementSession(pptx);
  const visualCaption = normalizeVisualAnchorCaption(data);
  const highlightReason = normalizeHighlightReason(data);
  const scoreBasis = safeText(data.scoreBasis ?? data.score_basis ?? "");
  let anchorResults = [];
  let layoutInfo = null;
  let resolvedLayoutType = null;
  const skeleton = addHuaweiPptPageSkeleton(pptx, data, {
    renderBody: ({ slide, contentTop }) => {
      const pipeline = planBodyDslPipeline(data, pptx, bodyLayout, contentTop, {
        measurementSession,
        dslResult: bodyCompile.dslResult,
        compileIr: bodyCompile.compileIr,
      });
      assertRuntimePageQaClean(data, pptx, pipeline);
      return {
        ...renderBodyLayoutFromPlan(slide, data, pipeline.bodyPlan, visualCaption),
        dslIr: pipeline.dslResult?.dslIr,
        compileIr: pipeline.compileIr,
        layoutIr: pipeline.layoutIr,
        measurementIr: pipeline.measurementIr,
      };
    },
  });
  const slide = skeleton.slide;
  const result = skeleton.bodyResult;
  anchorResults = result.anchorResults;
  layoutInfo = result.layoutInfo;
  const dslIr = result.dslIr;
  const compileIr = result.compileIr;
  const layoutIr = result.layoutIr;
  const measurementIr = result.measurementIr;
  resolvedLayoutType = layoutInfo?.type || null;

  ensureBodyPipelinePages(pptx).push({
    page: normalizePage(data.page, pptx),
    layoutInfo,
    dslIr,
    compileIr,
    layoutIr,
    measurementIr,
    resolvedLayoutType: resolvedLayoutType || undefined,
    renderedVisuals: anchorResults.map((anchorResult) => {
      const visualRole = visualComponentRole(anchorResult.visualAnchor);
      return {
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
      };
    }),
  });
  return slide;
}

function assertRuntimePageQaClean(data = {}, pptx, pipeline = {}) {
  const dslIssues = pipeline.dslResult?.issues || [];
  const measurementQa = runMeasurementChecks(pipeline.measurementIr || {});
  const layoutQa = runLayoutChecks(pipeline.layoutIr || {});
  const errors = [
    ...dslIssues,
    ...(measurementQa.issues || []),
    ...(layoutQa.issues || []),
  ].filter((issue) => issue.severity === "error");
  if (!errors.length) return { dslResult: pipeline.dslResult, measurementQa, layoutQa };
  throw createFeedbackCliError(feedbackToCliText(errors, {
    title: `Runtime QA failed for page ${normalizePage(data.page, pptx) || "unknown"}`,
  }), {
    feedbackIssues: errors,
    dslResult: pipeline.dslResult,
    measurementResult: measurementQa.phaseResult,
    layoutResult: layoutQa.phaseResult,
    measurementIr: measurementQa.ir,
    layoutIr: layoutQa.ir,
  });
}

function layoutIrFromBodyPlan(data = {}, page, bodyPlan = {}, compileIr = null, measurementIr = null) {
  const layoutInfo = bodyPlan.layoutInfo || {};
  const moduleLayouts = layoutInfo.module_layouts || [];
  const containers = moduleLayouts.map((module, index) => ({
    nodeId: `page-${page || "unknown"}:module-${index}`,
    role: "module",
    source: module.source_component || firstSource(module),
    box: roundRect(module.frame_area),
    bodyBox: roundRect(module.module_body_slot),
    visibleOccupiedBox: roundRect(module.visible_occupied_area || module.occupied_area),
    fill: fillPolicyFor(layoutInfo.type, index),
  }));
  const records = moduleLayouts.flatMap((module, moduleIndex) => (module.block_areas || []).map((block, blockIndex) => ({
    nodeId: `page-${page || "unknown"}:module-${moduleIndex}:block-${blockIndex}`,
    identity: primitiveIdentity(block),
    dsl: block.source_component,
    status: "ok",
    box: roundRect(block.area),
    visibleBox: roundRect(block.visible_area),
    measurementRef: measurementRefForLayoutBlock(measurementIr, moduleIndex, blockIndex, block.area),
    fitPolicy: block.fit_mode || block.source_component?.fit || block.measure?.resize_policy,
    resizePolicy: block.resize_policy || block.measure?.resize_policy,
    resizeLimits: block.resize_limits || block.measure?.resize_limits,
    scale: block.scale,
    unusedSpace: block.unused_space,
    readability: readabilityFor(block),
    overflow: overflowFor(block),
    measuredBounds: block.measure?.preferred_size || block.final_size,
    style: {},
  })));
  return {
    pageIndex: Number.isFinite(page) ? page - 1 : undefined,
    pageId: data.pageId || data.id || String(data.page || page || ""),
    pageBounds: { x: 0, y: 0, w: 13.333, h: 7.5 },
    bodyBounds: roundRect(unionAreas(containers.map((container) => container.box))),
    layoutType: layoutInfo.type,
    containers,
    constraints: [
      ...spacingConstraints(page, containers, layoutInfo),
      ...distributionConstraints(page, containers, layoutInfo),
    ],
    alignmentGroups: alignmentGroupsFor(page, containers, layoutInfo),
    expectedPrimitives: compileIr?.visiblePrimitives || records.map((record) => ({ identity: record.identity, dsl: record.dsl })),
    measuredPrimitives: measurementIr?.records || [],
    records,
    diagnostics: collectLayoutDiagnostics(layoutInfo),
  };
}

function measurementIrFromBodyMeasurement(data = {}, page, bodyMeasurement = {}, compileIr = null) {
  const records = (bodyMeasurement.moduleMeasurements || []).flatMap((moduleMeasurement) => {
    const measures = moduleMeasurement.measures || [];
    return measures.map((measure, blockIndex) => measurementRecordFromMeasure(measure, moduleMeasurement.moduleIndex, blockIndex));
  });
  return {
    pageIndex: Number.isFinite(page) ? page - 1 : undefined,
    pageId: data.pageId || data.id || String(data.page || page || ""),
    expectedPrimitives: compileIr?.visiblePrimitives || [],
    records,
    layoutSeed: {
      layoutBounds: bodyMeasurement.layoutBounds,
      areas: bodyMeasurement.areas,
    },
  };
}

function measuresForModule(measurementIr = {}, moduleIndex) {
  return (measurementIr.records || [])
    .filter((record) => record.moduleIndex === moduleIndex)
    .sort((a, b) => Number(a.blockIndex || 0) - Number(b.blockIndex || 0))
    .map((record) => record.raw);
}

function measurementRefForLayoutBlock(measurementIr = {}, moduleIndex, blockIndex, area = {}) {
  const record = findMeasurementRecord(measurementIr, moduleIndex, blockIndex, area)
    || [...(measurementIr.records || [])].reverse().find((item) => item.moduleIndex === moduleIndex && item.blockIndex === blockIndex);
  if (!record) return undefined;
  return {
    nodeId: record.nodeId,
    moduleIndex: record.moduleIndex,
    blockIndex: record.blockIndex,
    constraintBox: record.constraintBox,
    addedByLayout: record.addedByLayout || undefined,
  };
}

function createMeasurementOnDemand(data = {}, measurementIr = {}, moduleIndex, options = {}) {
  return (block, constraintBox, context = {}) => {
    const blockIndex = Number(context.index || 0);
    const current = context.currentMeasure;
    if (sameMeasurementConstraint(current?.measurementArea, constraintBox)) return current;
    const existing = findMeasurementRecord(measurementIr, moduleIndex, blockIndex, constraintBox);
    if (existing?.raw) return existing.raw;
    const [measure] = measureStackPrimitives(constraintBox, [block], options);
    const record = measurementRecordFromMeasure(measure, moduleIndex, blockIndex);
    record.addedByLayout = true;
    record.reason = "layout_constraint_refresh";
    measurementIr.records.push(record);
    return measure;
  };
}

function findMeasurementRecord(measurementIr = {}, moduleIndex, blockIndex, constraintBox = {}) {
  return (measurementIr.records || []).find((record) => (
    record.moduleIndex === moduleIndex
      && record.blockIndex === blockIndex
      && sameMeasurementConstraint(record.constraintBox, constraintBox)
  ));
}

function sameMeasurementConstraint(a = {}, b = {}) {
  if (!a || !b) return false;
  return ["w", "h"].every((key) => Math.abs(Number(a[key] || 0) - Number(b[key] || 0)) <= 0.005);
}

function measurementRecordFromMeasure(measure = {}, moduleIndex, blockIndex) {
  const visual = measure.primitive || {};
  const dsl = measure.dsl || {};
  const measurement = measure.measurement || {};
  return {
    nodeId: dsl.selector || dsl.path || `module-${moduleIndex}:block-${blockIndex}`,
    identity: {
      componentId: dsl.id,
      blockType: visual.blockType,
      kind: visual.kind || (visual.blockType === "text" ? "Text" : undefined),
      template: visual.template || (visual.blockType === "text" ? "body_text" : undefined),
    },
    source: dsl,
    dsl,
    moduleIndex,
    blockIndex,
    status: measurement.ok === false ? "failed" : "ok",
    measureSupport: visual.measureSupport,
    minSize: measure.minSize,
    preferredSize: measure.preferredSize,
    maxUsefulSize: measure.maxUsefulSize,
    resizePolicy: measure.resizePolicy,
    resizeLimits: measure.resizeLimits,
    constraintBox: measure.measurementArea,
    bounds: measurement.shape_bounds || measurement.text_bounds || measure.preferredSize,
    measurement,
    raw: measure,
  };
}

function spacingConstraints(page, containers = [], layoutInfo = {}) {
  const constraints = [];
  if (layoutInfo.type === "biased_column") {
    if (containers[0] && containers[1]) {
      constraints.push(spacingConstraint(
        `page-${page || "unknown"}:biased-column-gap`,
        "biased-column-gap",
        containers[1].box.x - (containers[0].box.x + containers[0].box.w),
        containers[0].source
      ));
    }
    gapsBetween(containers.slice(1).map((container) => container.box), "y").forEach((gap, index) => {
      constraints.push(spacingConstraint(`page-${page || "unknown"}:biased-side-gap-${index}`, "side-card-gap", gap, containers[index + 1]?.source));
    });
    return constraints;
  }
  gapsBetween(containers.map((container) => container.box), "x").forEach((gap, index) => {
    constraints.push(spacingConstraint(`page-${page || "unknown"}:column-gap-${index}`, "column-gap", gap, containers[index]?.source));
  });
  return constraints;
}

function spacingConstraint(id, token, value, target) {
  return {
    type: "spacing",
    id,
    token,
    value: spacingValue(value),
    allowedValues: LAYOUT_SPACING_TOKENS,
    min: 0.06,
    target,
  };
}

function distributionConstraints(page, containers = [], layoutInfo = {}) {
  if (layoutInfo.type === "biased_column") {
    const right = containers.slice(1);
    return [{
      type: "distribution",
      id: `page-${page || "unknown"}:right-card-y-distribution`,
      axis: "y",
      expectedGap: 0.14,
      actualGaps: gapsBetween(right.map((container) => container.box), "y").map(spacingValue),
      tolerance: 0.03,
      target: right[0]?.source,
    }];
  }
  const actualGaps = gapsBetween(containers.map((container) => container.box), "x").map(spacingValue);
  return [{
    type: "distribution",
    id: `page-${page || "unknown"}:column-x-distribution`,
    axis: "x",
    expectedGap: actualGaps[0] || 0.18,
    actualGaps,
    tolerance: 0.03,
    target: containers[0]?.source,
  }];
}

function alignmentGroupsFor(page, containers = [], layoutInfo = {}) {
  if (layoutInfo.type === "biased_column") {
    return [
      alignmentGroup(page, "biased-top", "top", [containers[0], containers[1]], { useVisibleContent: false }),
      alignmentGroup(page, "biased-bottom", "bottom", [containers[0], containers[containers.length - 1]], { useVisibleContent: false }),
    ];
  }
  return [
    alignmentGroup(page, "columns-top", "top", containers, { useVisibleContent: false }),
    alignmentGroup(page, "columns-bottom", "bottom", containers, { useVisibleContent: false }),
  ];
}

function alignmentGroup(page, id, edge, containers = [], options = {}) {
  const useVisibleContent = options.useVisibleContent !== false;
  const members = containers.filter(Boolean).map((container) => ({
    nodeId: container.nodeId,
    source: container.source,
    box: useVisibleContent ? (container.visibleOccupiedBox || container.box) : container.box,
  }));
  return { id: `page-${page || "unknown"}:${id}`, edge, tolerance: 0.03, target: members[0]?.source, members };
}

function primitiveIdentity(block = {}) {
  const source = block.source_component || {};
  return {
    componentId: source.id,
    blockType: block.type || "text",
    kind: block.kind || (block.type === "text" ? "Text" : undefined),
    template: block.template || (block.type === "text" ? "body_text" : undefined),
  };
}

function fillPolicyFor(layoutType, moduleIndex) {
  if (layoutType === "biased_column" && moduleIndex > 0) {
    return { minRatio: 0.65, minVisibleAreaRatio: 0.42, maxBottomSlack: 0.45 };
  }
  return { minRatio: 0.75, minVisibleAreaRatio: 0.52, maxBottomSlack: 0.45 };
}

function readabilityFor(block = {}) {
  if (block.visual_role !== "visual_anchor" && block.visual_role !== "supporting_component") return undefined;
  const minW = Number(block.measure?.min_size?.w || 0);
  const minH = Number(block.measure?.min_size?.h || 0);
  const visible = block.visible_area || block.final_size || block.area || {};
  const actualW = Number(visible.w || 0);
  const actualH = Number(visible.h || 0);
  const actualArea = actualW * actualH;
  const minArea = minW * minH;
  return {
    role: block.visual_role,
    minW: roundLocal(minW),
    minH: roundLocal(minH),
    minArea: roundLocal(minArea),
    actualW: roundLocal(actualW),
    actualH: roundLocal(actualH),
    actualArea: roundLocal(actualArea),
    ok: actualW + 0.001 >= minW && actualH + 0.001 >= minH && actualArea + 0.001 >= minArea,
  };
}

function overflowFor(block = {}) {
  if (block.visual_role === "visual_anchor" || block.visual_role === "supporting_component") {
    const area = block.area || {};
    const visible = block.visible_area || block.area || {};
    return {
      x: Number(visible.x || 0) < Number(area.x || 0) - 0.01
        || Number(visible.x || 0) + Number(visible.w || 0) > Number(area.x || 0) + Number(area.w || 0) + 0.01,
      y: Number(visible.y || 0) < Number(area.y || 0) - 0.01
        || Number(visible.y || 0) + Number(visible.h || 0) > Number(area.y || 0) + Number(area.h || 0) + 0.01,
    };
  }
  const finalSize = block.final_size || block.area || {};
  const preferred = block.measure?.preferred_size || {};
  return {
    x: Number(preferred.w || 0) > Number(finalSize.w || 0) + 0.01,
    y: Number(preferred.h || 0) > Number(finalSize.h || 0) + 0.01,
  };
}

function firstSource(module = {}) {
  return (module.block_areas || []).find((block) => block.source_component)?.source_component;
}

function collectLayoutDiagnostics(layoutInfo = {}) {
  return (layoutInfo.module_layouts || []).flatMap((module) => [
    ...(module.layout_diagnostics || []),
    ...(module.block_areas || []).flatMap((block) => block.layout_diagnostics || []),
  ]);
}

function roundRect(area = {}) {
  return { x: roundLocal(area.x), y: roundLocal(area.y), w: roundLocal(area.w), h: roundLocal(area.h) };
}

function gapsBetween(boxes = [], axis = "x") {
  const start = axis === "y" ? "y" : "x";
  const size = axis === "y" ? "h" : "w";
  const sorted = boxes.filter(Boolean).sort((a, b) => Number(a[start]) - Number(b[start]));
  const out = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    out.push(roundLocal(Number(sorted[index + 1][start]) - (Number(sorted[index][start]) + Number(sorted[index][size]))));
  }
  return out;
}

function spacingValue(value) {
  const rounded = roundLocal(value);
  const token = LAYOUT_SPACING_TOKENS.find((item) => Math.abs(item - rounded) <= 0.005);
  return token ?? rounded;
}

function resolveBodyRenderModel(data = {}) {
  if (data.bodyDsl) return resolveBodyCompileResult(data).renderModel;
  return null;
}

function resolveBodyCompileResult(data = {}, pptx = null) {
  const page = normalizePage(data.page, pptx);
  if (!data.bodyDsl) return { renderModel: null, compileIr: null, dslResult: null };
  const pageContext = {
    pageIndex: Number.isFinite(page) ? page - 1 : undefined,
    pageId: data.pageId || data.id || String(data.page || page || ""),
    bodyDsl: data.bodyDsl,
    dslScope: data.dslScope || data.scope || {},
  };
  const dslResult = runDslInputChecks(pageContext);
  const dslErrors = (dslResult.issues || []).filter((issue) => issue.severity === "error");
  if (dslErrors.length) {
    throw createFeedbackCliError(feedbackToCliText(dslErrors, {
      title: `Runtime QA failed for page ${page || "unknown"}`,
    }), {
      feedbackIssues: dslErrors,
      dslResult,
    });
  }
  return {
    renderModel: dslResult.compileIr?.renderModel || null,
    compileIr: dslResult.compileIr,
    dslResult,
  };
}

module.exports = {
  addVisualAnchorContentSlide,
  collectBodyPipelinePages,
  premeasureVisualAnchorContentSlides,
};
