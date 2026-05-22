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
  resolveVisualAnchorRenderPath,
  validateVisualAnchorSpec,
} = require("./hw_diagram_helpers");

function ensureManifest(pptx) {
  if (!Array.isArray(pptx._hwVisualAnchorManifest)) pptx._hwVisualAnchorManifest = [];
  return pptx._hwVisualAnchorManifest;
}

function normalizePage(page, pptx) {
  const numeric = Number(String(page || "").replace(/^0+/, ""));
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return Array.isArray(pptx._slides) ? pptx._slides.length : undefined;
}

function addSupportingCards(slide, cards = [], area = {}) {
  const visibleCards = (cards || []).filter(Boolean);
  if (!visibleCards.length) return;
  const x = area.x ?? 8.25;
  const y = area.y ?? HW_STYLE.summary.contentTop;
  const w = area.w ?? 4.53;
  const h = area.h ?? (HW_STYLE.slide.footerY - y - 0.35);
  const gap = 0.14;
  const cardH = (h - gap * Math.max(0, visibleCards.length - 1)) / visibleCards.length;
  visibleCards.forEach((card, idx) => {
    const cardY = y + idx * (cardH + gap);
    redTitleCard(slide, card.title || `解读 ${idx + 1}`, x, cardY, w);
    grayCard(slide, {
      x,
      y: cardY + 0.34,
      w,
      h: cardH - 0.34,
      title: card.subtitle || "",
      body: card.body || card.items || "",
      fill: card.fill || HW_STYLE.color.card,
    });
  });
}

function addEvidenceModule(slide, visualAnchor, area) {
  validateVisualAnchorSpec(visualAnchor);
  return renderVisualAnchorPptNative(slide, visualAnchor, area);
}

function addSvgVisualAnchorImage(slide, visualAnchor, area) {
  const image = createVisualAnchorImage(visualAnchor, { width: 1400 });
  const imageArea = fitAreaContain(area, image.width, image.height);
  const data = `data:${image.mimeType};base64,${Buffer.from(image.svg, "utf8").toString("base64")}`;
  slide.addImage({
    data,
    x: imageArea.x,
    y: imageArea.y,
    w: imageArea.w,
    h: imageArea.h,
  });
  return { ...image, imageArea };
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
      image_area: image.imageArea,
    };
  }
  const nativeResult = renderVisualAnchorPptNative(slide, visualAnchor, area) || {};
  return { renderer: renderPath, rendered: true, ...nativeResult };
}

function normalizeVisualAnchorCaption(data = {}) {
  const caption = data.visualAnchorCaption
    ?? data.visualAnchorLegend
    ?? data.visual_anchor_caption
    ?? data.visual_anchor_legend
    ?? data.figureLegend
    ?? data.figure_legend;
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
    ?? data.visual_anchor?.highlight_reason
    ?? data.visual_anchor?.why_highlight
    ?? "";
  return safeText(reason);
}

function addVisualAnchorCaption(slide, caption, renderResult, anchorArea, visualArea) {
  const text = Array.isArray(caption.text) ? caption.text.filter(Boolean).join("\n") : safeText(caption.text);
  const source = safeText(caption.source);
  if (!text) return null;

  const imageArea = renderResult.image_area || visualArea;
  const captionH = source ? 0.58 : 0.46;
  const captionY = Math.min(
    imageArea.y + imageArea.h + 0.06,
    anchorArea.y + anchorArea.h - captionH
  );
  textBox(slide, text, {
    x: anchorArea.x + 0.12,
    y: captionY,
    w: anchorArea.w - 0.24,
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
      x: anchorArea.x + 0.12,
      y: captionY + 0.36,
      w: anchorArea.w - 0.24,
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
      x: anchorArea.x + 0.12,
      y: captionY,
      w: anchorArea.w - 0.24,
      h: captionH,
    },
  };
}

const CONTENT_LAYOUT_SCHEMAS = Object.freeze({
  two_column: {
    reference: "05 内容 二分栏",
    moduleCount: 2,
    columns: [1, 1],
  },
  biased_column: {
    reference: "06 内容 偏分栏",
    minModuleCount: 2,
    maxModuleCount: 4,
    special: "large_visual_with_side_cards",
  },
  three_column: {
    reference: "07 内容 三分栏",
    moduleCount: 3,
    columns: [1, 1, 1],
  },
  four_column: {
    reference: "08 内容 四分栏",
    moduleCount: 4,
    grid: { rows: 2, columns: 2 },
  },
});

function normalizeContentLayout(layout) {
  if (!layout) return null;
  const type = safeText(layout.type || layout.layout || layout.name);
  const schema = CONTENT_LAYOUT_SCHEMAS[type];
  if (!schema) {
    throw new Error(`Unsupported contentLayout.type: ${type || "(missing)"}.`);
  }
  const modules = (layout.modules || []).filter(Boolean);
  const minModuleCount = schema.minModuleCount || schema.moduleCount;
  const maxModuleCount = schema.maxModuleCount || schema.moduleCount;
  if (modules.length < minModuleCount || modules.length > maxModuleCount) {
    const expected = minModuleCount === maxModuleCount ? String(minModuleCount) : `${minModuleCount}-${maxModuleCount}`;
    throw new Error(`contentLayout.type ${type} requires ${expected} modules, received ${modules.length}.`);
  }
  if (schema.special === "large_visual_with_side_cards" && (modules[0].role || modules[0].kind) !== "visual_anchor") {
    throw new Error(`contentLayout.type ${type} requires the first module to be role "visual_anchor".`);
  }
  const anchorCount = modules.reduce((count, module) => count + countModuleVisualAnchors(module), 0);
  if (anchorCount < 1) {
    throw new Error(`contentLayout.type ${type} requires at least one visual_anchor block.`);
  }
  return {
    type,
    reference: safeText(layout.reference || schema.reference),
    modules,
    schema,
    visualWeight: layout.visualWeight || layout.visual_weight || null,
    flowArrows: layout.flowArrows || layout.flow_arrows || null,
  };
}

function countModuleVisualAnchors(module = {}) {
  if ((module.role || module.kind) === "visual_anchor" || module.visual_anchor || module.visualAnchor) return 1;
  const blocks = module.blocks || module.children || module.items || [];
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((count, block) => {
    const type = block.type || block.role || block.kind;
    return count + (type === "visual_anchor" || block.visual_anchor || block.visualAnchor ? 1 : 0);
  }, 0);
}

function collectModuleEvidenceAnchors(module = {}) {
  const anchors = [];
  const directAnchor = module.visual_anchor || module.visualAnchor;
  if (isEvidenceAnchor(directAnchor)) anchors.push(directAnchor);
  const blocks = module.blocks || module.children || module.items || [];
  if (Array.isArray(blocks)) {
    blocks.forEach((block) => {
      const anchor = block?.visual_anchor || block?.visualAnchor;
      if (isEvidenceAnchor(anchor)) anchors.push(anchor);
    });
  }
  return anchors;
}

function evidenceReadableHeightTarget(layoutType, imageRatio) {
  if (layoutType === "two_column") return imageRatio >= 3 ? 1.45 : 1.75;
  if (layoutType === "three_column") return imageRatio >= 3 ? 1.18 : 1.38;
  return imageRatio >= 3 ? 1.2 : 1.45;
}

function moduleEvidenceWidthDemand(module, layoutType, baseModuleW) {
  const anchors = collectModuleEvidenceAnchors(module);
  if (!anchors.length) return baseModuleW;
  const demands = anchors.map((anchor) => {
    const dimensions = readEvidenceSourceDimensions(anchor);
    if (!dimensions) return baseModuleW;
    const imageRatio = dimensions.width / dimensions.height;
    const targetH = evidenceReadableHeightTarget(layoutType, imageRatio);
    return Math.max(baseModuleW * 0.72, targetH * imageRatio + 0.26);
  });
  return Math.max(...demands, baseModuleW);
}

function resolveEvidenceAwareColumnLayout(layout, contentArea, baseGap) {
  const columnCount = layout.schema.columns.length;
  const initialAvailableW = contentArea.w - baseGap * (columnCount - 1);
  const baseModuleW = initialAvailableW / columnCount;
  const maxFactor = layout.type === "two_column" ? 1.35 : 1.5;
  const minFactor = layout.type === "two_column" ? 0.72 : 0.78;
  const demands = layout.modules.map((module) => moduleEvidenceWidthDemand(module, layout.type, baseModuleW));
  const rawFactors = demands.map((demand) => demand / Math.max(0.1, baseModuleW));
  const largestDemand = Math.max(1, ...rawFactors);
  const gap = largestDemand >= 1.28 ? 0.08 : (largestDemand >= 1.12 ? 0.11 : baseGap);
  const availableW = contentArea.w - gap * (columnCount - 1);
  const weights = layout.schema.columns.map((baseWeight, idx) => {
    const factor = Math.min(maxFactor, Math.max(minFactor, rawFactors[idx] || 1));
    return Math.max(0.1, baseWeight * factor);
  });
  return { gap, weights, availableW };
}

function contentLayoutAreas(layout, contentArea) {
  const gap = 0.18;
  if (layout.schema.special === "large_visual_with_side_cards") {
    const visualDemand = moduleEvidenceWidthDemand(layout.modules[0], layout.type, contentArea.w * 0.59);
    const requestedVisualShare = Number(layout.visualWeight || layout.visual_weight);
    const visualShare = Number.isFinite(requestedVisualShare)
      ? Math.min(0.72, Math.max(0.52, requestedVisualShare))
      : Math.min(0.68, Math.max(0.59, visualDemand / Math.max(0.1, contentArea.w)));
    const sideGap = visualShare >= 0.64 ? 0.28 : 0.38;
    const visualW = contentArea.w * visualShare;
    const sideW = contentArea.w - visualW - sideGap;
    const sideCount = Math.max(1, layout.modules.length - 1);
    const sideCardGap = 0.14;
    const sideCardH = (contentArea.h - sideCardGap * (sideCount - 1)) / sideCount;
    return layout.modules.map((_, idx) => {
      if (idx === 0) {
        return { x: contentArea.x + 0.46, y: contentArea.y, w: visualW - 0.46, h: contentArea.h };
      }
      return {
        x: contentArea.x + visualW + sideGap,
        y: contentArea.y + (idx - 1) * (sideCardH + sideCardGap),
        w: sideW,
        h: sideCardH,
      };
    });
  }
  if (layout.schema.grid) {
    const { rows, columns } = layout.schema.grid;
    const cellW = (contentArea.w - gap * (columns - 1)) / columns;
    const cellH = (contentArea.h - gap * (rows - 1)) / rows;
    return layout.modules.map((_, idx) => {
      const row = Math.floor(idx / columns);
      const col = idx % columns;
      return {
        x: contentArea.x + col * (cellW + gap),
        y: contentArea.y + row * (cellH + gap),
        w: cellW,
        h: cellH,
      };
    });
  }
  const columnLayout = resolveEvidenceAwareColumnLayout(layout, contentArea, gap);
  const totalWeight = columnLayout.weights.reduce((sum, value) => sum + value, 0);
  let x = contentArea.x;
  return columnLayout.weights.map((weight) => {
    const w = columnLayout.availableW * (weight / totalWeight);
    const area = { x, y: contentArea.y, w, h: contentArea.h };
    x += w + columnLayout.gap;
    return area;
  });
}

function fixedContentLayoutArea(layout) {
  const bottomPadding = layout.schema.special === "large_visual_with_side_cards" ? 0.35 : 0.17;
  return {
    x: HW_STYLE.slide.marginX,
    y: HW_STYLE.summary.contentTop - 0.18,
    w: 12.23,
    h: HW_STYLE.slide.footerY - HW_STYLE.summary.contentTop - bottomPadding,
  };
}

function rejectContentLayoutPageRegionOverrides(data) {
  if (Object.prototype.hasOwnProperty.call(data, "contentArea") || Object.prototype.hasOwnProperty.call(data, "content_area")) {
    throw new Error("contentLayout page-region coordinates are renderer-owned; pass only the fixed layout schema.");
  }
}

function normalizePlainCaption(module) {
  const caption = module.visualAnchorCaption || module.visual_anchor_caption || module.caption || {};
  if (typeof caption === "string") return safeText(caption);
  return safeText(caption.text || caption.title || "");
}

function addContentModuleFrame(slide, module, area) {
  const title = safeText(module.title || module.label || "模块");
  redTitleCard(slide, title, area.x, area.y, area.w);
  grayCard(slide, {
    x: area.x,
    y: area.y + 0.34,
    w: area.w,
    h: area.h - 0.34,
    body: "",
    fill: module.fill || HW_STYLE.color.pale,
  });
  return {
    x: area.x + 0.13,
    y: area.y + 0.48,
    w: area.w - 0.26,
    h: area.h - 0.62,
  };
}

function normalizeModuleBody(module) {
  const body = module.body || module.items || module.text || "";
  return Array.isArray(body) ? body.map((line) => `- ${safeText(line)}`).join("\n") : safeText(body);
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
  if (!emphasis.length) {
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

function normalizeModuleBlocks(module, data = {}) {
  const rawBlocks = module.blocks || module.children;
  if (Array.isArray(rawBlocks) && rawBlocks.length) return rawBlocks.filter(Boolean);
  const role = module.role || module.kind || "text";
  if (role === "visual_anchor") {
    return [{
      type: "visual_anchor",
      visual_anchor: module.visual_anchor || module.visualAnchor || data.visual_anchor,
      visualAnchorCaption: module.visualAnchorCaption || module.visual_anchor_caption || module.caption,
      body: module.body,
    }].filter((block) => block.visual_anchor);
  }
  return [{ type: "text", body: normalizeModuleBody(module), fontSize: module.fontSize || module.contentFontSize }];
}

function splitBlockAreas(area, blocks, flow = "top_bottom", options = {}) {
  const gap = Number(options.blockGap ?? 0.12);
  const visibleBlocks = blocks.filter(Boolean);
  const horizontal = flow === "left_right" || flow === "right_left";
  if (!visibleBlocks.length) return [];
  if (!horizontal) return splitVerticalBlockAreas(area, visibleBlocks, flow, options);

  const total = horizontal ? area.w : area.h;
  const blockSizes = visibleBlocks.map((block) => adjustedBlockSize(block, area, horizontal, options));
  const explicit = blockSizes.reduce((sum, size) => sum + (size > 0 ? size : 0), 0);
  const flexible = visibleBlocks.filter((_, idx) => !(blockSizes[idx] > 0));
  const weightTotal = flexible.reduce((sum, block) => sum + Math.max(0.1, Number(block.weight || block.flex || 1)), 0);
  const available = Math.max(0.1, total - gap * Math.max(0, visibleBlocks.length - 1) - explicit);
  let cursor = horizontal ? area.x : area.y;
  const areas = visibleBlocks.map((block, idx) => {
    const explicitSize = blockSizes[idx];
    const size = explicitSize > 0 ? explicitSize : available * (Math.max(0.1, Number(block.weight || block.flex || 1)) / weightTotal);
    const blockArea = horizontal
      ? { x: cursor, y: area.y, w: size, h: area.h }
      : { x: area.x, y: cursor, w: area.w, h: size };
    cursor += size + gap;
    return blockArea;
  });
  return flow === "right_left" || flow === "bottom_top" ? areas.reverse() : areas;
}

function splitVerticalBlockAreas(area, visibleBlocks, flow = "top_bottom", options = {}) {
  const gap = Number(options.blockGap ?? 0.12);
  const blockSizes = visibleBlocks.map((block) => adjustedBlockSize(block, area, false, options));
  const fallbackCount = blockSizes.filter((size) => !(size > 0)).length;
  const explicit = blockSizes.reduce((sum, size) => sum + (size > 0 ? size : 0), 0);
  const gapTotal = gap * Math.max(0, visibleBlocks.length - 1);
  const fallbackSize = fallbackCount
    ? Math.max(0.28, (area.h - explicit - gapTotal) / fallbackCount)
    : 0;
  const sized = blockSizes.map((size, idx) => {
    if (size > 0) return Math.min(size, area.h);
    if (visibleBlocks.length === 1 && !isTextBlock(visibleBlocks[idx])) return area.h;
    return fallbackSize;
  });
  const totalNeeded = sized.reduce((sum, size) => sum + size, 0) + gapTotal;
  const finalSizes = fitVerticalBlockSizes(sized, visibleBlocks, area, Math.max(0.1, area.h - gapTotal), totalNeeded > area.h, options);
  let cursor = area.y;
  const areas = finalSizes.map((size) => {
    const blockArea = { x: area.x, y: cursor, w: area.w, h: Math.min(size, Math.max(0.22, area.y + area.h - cursor)) };
    cursor += blockArea.h + gap;
    return blockArea;
  });
  return flow === "bottom_top" ? areas.reverse() : areas;
}

function fitVerticalBlockSizes(sized, visibleBlocks, area, availableHeight, overflowed, options = {}) {
  const finalSizes = [...sized];
  if (!overflowed) return finalSizes;

  let overflow = finalSizes.reduce((sum, size) => sum + size, 0) - availableHeight;
  const visualCandidates = finalSizes
    .map((size, idx) => ({ idx, size, min: minimumVerticalBlockSize(visibleBlocks[idx], area, options, size) }))
    .filter((item) => item.size > item.min + 0.01);
  const shrinkCapacity = visualCandidates.reduce((sum, item) => sum + (item.size - item.min), 0);
  if (shrinkCapacity > 0) {
    for (const item of visualCandidates) {
      const shrink = Math.min(item.size - item.min, overflow * ((item.size - item.min) / shrinkCapacity));
      finalSizes[item.idx] -= shrink;
    }
  }

  overflow = finalSizes.reduce((sum, size) => sum + size, 0) - availableHeight;
  if (overflow > 0.01) {
    const scale = Math.max(0.35, availableHeight / Math.max(0.1, finalSizes.reduce((sum, size) => sum + size, 0)));
    return finalSizes.map((size) => Math.max(0.22, size * scale));
  }
  return finalSizes;
}

function minimumVerticalBlockSize(block, area, options = {}, currentSize = 0.45) {
  if (isTextBlock(block)) return currentSize;
  const visualAnchor = block?.visual_anchor || block?.visualAnchor;
  if (isEvidenceAnchor(visualAnchor)) {
    const dimensions = readEvidenceSourceDimensions(visualAnchor);
    if (!dimensions) return Math.min(currentSize, Math.max(0.72, area.h * 0.22));
    const imageRatio = dimensions.width / dimensions.height;
    const readable = evidenceReadableHeightTarget(options.layoutType || "", imageRatio);
    const natural = area.w / imageRatio;
    return Math.min(currentSize, Math.max(0.72, Math.min(readable, natural, area.h * 0.52)));
  }
  if (isTableAnchor(visualAnchor)) return Math.min(currentSize, Math.max(0.62, area.h * 0.18));
  return Math.min(currentSize, 0.45);
}

function adjustedBlockSize(block, area, horizontal, options = {}) {
  const visualAnchor = block.visual_anchor || block.visualAnchor;
  const explicitSize = Number(horizontal ? (block.width || block.w) : (block.height || block.h));
  if (!horizontal && visualAnchor?.kind === "Quantity" && visualAnchor?.template === "data_cards") {
    const cards = visualAnchor.visual_spec?.cards || [];
    const compactHeight = cards.length >= 3 ? 0.95 : 0.82;
    return Math.min(explicitSize > 0 ? explicitSize : compactHeight, compactHeight);
  }
  if (!horizontal && isTableAnchor(visualAnchor)) {
    const estimated = estimateTableBlockHeight(visualAnchor, area);
    return explicitSize > 0 ? Math.max(explicitSize, estimated) : estimated;
  }
  if (!horizontal && isTextBlock(block)) {
    return estimateTextBlockSize(block, area);
  }
  if (explicitSize > 0) return explicitSize;
  if (horizontal && isEvidenceAnchor(visualAnchor)) {
    const dimensions = readEvidenceSourceDimensions(visualAnchor);
    if (!dimensions) return Math.max(area.w * 0.36, 0.8);
    const imageRatio = dimensions.width / dimensions.height;
    const naturalWidth = area.h * imageRatio;
    const minWidth = area.w * 0.28;
    const maxWidth = area.w * 0.5;
    return Math.min(Math.max(naturalWidth, minWidth), maxWidth);
  }
  if (!isEvidenceAnchor(visualAnchor)) return explicitSize;
  const dimensions = readEvidenceSourceDimensions(visualAnchor);
  if (!dimensions) return explicitSize;
  const caption = options.suppressVisualAnchorCaptions ? null : normalizeVisualAnchorCaption(block);
  const captionReserveH = caption ? (caption.source ? 0.58 : 0.42) : 0;
  const imageRatio = dimensions.width / dimensions.height;
  const targetImageW = area.w;
  const desired = targetImageW / imageRatio + captionReserveH;
  const maxVisualShare = area.h * (options.maxVisualShare || 0.78);
  const fittedSize = Math.min(Math.max(desired, 0.55), maxVisualShare);
  return fittedSize;
}

function isTextBlock(block = {}) {
  const type = block.type || block.role || block.kind || "text";
  return !(block.visual_anchor || block.visualAnchor) && type === "text";
}

function estimateTextBlockSize(block, area) {
  const body = normalizeModuleBody(block);
  if (!safeText(body)) return 0;
  const fontSize = Number(block.fontSize || block.contentFontSize || HW_STYLE.size.body);
  const lineSpacingMultiple = Number(block.lineSpacingMultiple || 1.5);
  const estimated = estimateTextBoxHeight(body, {
    w: area.w,
    fontSize,
    lineSpacingMultiple,
    margin: 0.08,
    bulletIndentUnits: 0,
  });
  const rounded = Math.ceil((estimated + 0.03) * 20) / 20;
  return Math.max(0.26, rounded);
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

function estimateTableBlockHeight(visualAnchor, area = {}) {
  const rows = visualAnchor?.visual_spec?.rows || [];
  if (!Array.isArray(rows) || !rows.length) return 0.85;
  const columnCount = Math.max(1, ...rows.map((row) => Array.isArray(row) ? row.length : 1));
  const colWidth = Math.max(0.45, Number(area.w || 3) / columnCount);
  const charsPerLine = Math.max(5, Math.floor(colWidth * 10));
  const rowHeights = rows.map((row, rowIdx) => {
    const cells = Array.isArray(row) ? row : [row];
    const maxLines = cells.reduce((max, cell) => {
      const text = safeText(typeof cell === "object" && cell !== null ? cell.text : cell);
      return Math.max(max, Math.ceil(text.length / charsPerLine));
    }, 1);
    const minRow = rowIdx === 0 ? 0.34 : 0.38;
    return Math.max(minRow, maxLines * 0.24 + 0.1);
  });
  return Math.ceil(rowHeights.reduce((sum, height) => sum + height, 0) * 20) / 20;
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
  const evidenceBlock = visibleBlocks.find((block) => isEvidenceAnchor(block.visual_anchor || block.visualAnchor));
  if (!hasText || !evidenceBlock) return "top_bottom";

  const dimensions = readEvidenceSourceDimensions(evidenceBlock.visual_anchor || evidenceBlock.visualAnchor);
  if (!dimensions) return "top_bottom";
  const imageRatio = dimensions.width / dimensions.height;
  const panelRatio = area.w / area.h;
  const isTallImage = imageRatio < 0.85;
  const hasRoomForSideText = area.w >= 3.0 && panelRatio >= 1.15;
  return isTallImage && hasRoomForSideText ? "left_right" : "top_bottom";
}

function renderVisualAnchorBlock(slide, block, module, data, area, fallbackCaption = null, options = {}) {
  const visualAnchor = block.visual_anchor || block.visualAnchor;
  validateVisualAnchorSpec(visualAnchor);
  const caption = options.suppressVisualAnchorCaptions ? null : (normalizeVisualAnchorCaption(block) || fallbackCaption);
  const captionReserveH = caption ? (caption.source ? 0.58 : 0.42) : 0;
  const visualArea = caption
    ? { ...area, h: Math.max(0.55, area.h - captionReserveH) }
    : area;
  const renderResult = renderVisualAnchor(slide, visualAnchor, visualArea);
  const captionResult = caption ? addVisualAnchorCaption(slide, caption, renderResult, area, visualArea) : null;
  return { visualAnchor, anchorArea: area, visualArea, renderResult, captionResult };
}

function renderModuleBlock(slide, block, module, data, area, fallbackCaption = null, options = {}) {
  const type = block.type || block.role || block.kind || "text";
  if (type === "visual_anchor" || block.visual_anchor || block.visualAnchor) {
    return renderVisualAnchorBlock(slide, block, module, data, area, fallbackCaption, options);
  }
  if (type === "image") {
    throw new Error("contentLayout image blocks were removed; use visual_anchor kind=Evidence/template=source_figure with text annotations.");
  }
  if (type === "table") {
    throw new Error("contentLayout table blocks were removed; use visual_anchor kind=Matrix/template=table with text annotations.");
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
  const bodyArea = addContentModuleFrame(slide, module, area);
  const blocks = normalizeModuleBlocks(module, data);
  const resolvedFlow = resolveBlockFlow(bodyArea, blocks);
  const blockAreas = splitBlockAreas(bodyArea, blocks, resolvedFlow, options);
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
    blockMetrics[idx] = describeBlockLayout(block, blockAreas[idx], visibleAreas[idx], options);
  });
  return {
    anchorResults,
    moduleLayout: {
      title: safeText(module.title || module.label || "模块"),
      frame_area: area,
      content_area: bodyArea,
      resolved_flow: resolvedFlow,
      occupied_area: unionAreas(blockAreas),
      visible_occupied_area: unionAreas(visibleAreas),
      block_gaps: calculateBlockGaps(blockAreas, resolvedFlow),
      block_areas: blockMetrics,
    },
  };
}

function describeBlockLayout(block, blockArea, visibleArea, options = {}) {
  const visualAnchor = block?.visual_anchor || block?.visualAnchor;
  const descriptor = {
    type: block?.type || block?.role || block?.kind || "text",
    area: blockArea,
    visible_area: visibleArea,
  };
  if (isTextBlock(block)) {
    const body = normalizeModuleBody(block);
    const lines = body.split(/\r?\n/).map((line) => safeText(line)).filter(Boolean);
    descriptor.estimated_height = estimateTextBlockSize(block, blockArea || { w: 1, h: 1 });
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
    descriptor.table_estimated_height = estimateTableBlockHeight(visualAnchor, blockArea || { w: 1, h: 1 });
    descriptor.table_rows = Array.isArray(visualAnchor.visual_spec?.rows) ? visualAnchor.visual_spec.rows.length : 0;
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

function addBiasedVisualOnlyModule(slide, module, data, area) {
  const visualBlock = Array.isArray(module.blocks || module.children)
    ? (module.blocks || module.children).find((block) => (block.type || block.role || block.kind) === "visual_anchor" || block.visual_anchor || block.visualAnchor)
    : null;
  const visualAnchor = visualBlock?.visual_anchor || visualBlock?.visualAnchor || module.visual_anchor || module.visualAnchor || data.visual_anchor;
  validateVisualAnchorSpec(visualAnchor);
  const caption = normalizePlainCaption(visualBlock || module);
  const source = safeText(module.source || module.image?.source || "");
  const captionReserveH = caption ? (source ? 0.48 : 0.32) : 0;
  const visualArea = caption
    ? { x: area.x, y: area.y, w: area.w, h: Math.max(1.4, area.h - captionReserveH) }
    : area;
  const renderResult = renderVisualAnchor(slide, visualAnchor, visualArea);
  let captionResult = null;
  if (caption) {
    const imageArea = renderResult.image_area || visualArea;
    const captionY = Math.min(imageArea.y + imageArea.h + 0.04, area.y + area.h - captionReserveH);
    textBox(slide, caption, {
      x: area.x,
      y: captionY,
      w: area.w,
      h: 0.22,
      fontSize: 12,
      bold: true,
      italic: true,
      color: HW_STYLE.color.text,
      align: "center",
      lineSpacingMultiple: 1,
    });
    if (source) {
      textBox(slide, source, {
        x: area.x,
        y: captionY + 0.25,
        w: area.w,
        h: 0.2,
        fontSize: HW_STYLE.size.min,
        color: HW_STYLE.color.gray,
        align: "center",
        lineSpacingMultiple: 1,
      });
    }
    captionResult = { text: caption, source: source || undefined };
  }
  return { visualAnchor, anchorArea: area, visualArea, renderResult, captionResult };
}

function addBiasedSideCard(slide, module, area) {
  redTitleCard(slide, module.title || module.label || "一级标题", area.x, area.y, area.w);
  grayCard(slide, {
    x: area.x,
    y: area.y + 0.34,
    w: area.w,
    h: area.h - 0.34,
    body: normalizeModuleBody(module),
    fill: module.fill || HW_STYLE.color.pale,
  });
}

function renderBiasedContentLayout(slide, data, layout) {
  const contentArea = fixedContentLayoutArea(layout);
  const areas = contentLayoutAreas(layout, contentArea);
  const anchorResults = [addBiasedVisualOnlyModule(slide, layout.modules[0], data, areas[0])];
  layout.modules.slice(1).forEach((module, idx) => addBiasedSideCard(slide, module, areas[idx + 1]));
  return {
    anchorResults,
    layoutInfo: {
      type: layout.type,
      reference: layout.reference,
      modules_count: layout.modules.length,
      image_modules_count: 0,
      table_modules_count: 0,
      text_modules_count: layout.modules.length - 1,
      visual_anchor_modules_count: anchorResults.length,
      variant: "large_visual_with_side_cards",
    },
  };
}

function renderContentLayout(slide, data, layout, visualCaption) {
  if (layout.schema.special === "large_visual_with_side_cards") {
    return renderBiasedContentLayout(slide, data, layout);
  }
  const contentArea = fixedContentLayoutArea(layout);
  const areas = contentLayoutAreas(layout, contentArea);
  const anchorResults = [];
  const moduleLayouts = [];
  const moduleOptions = {
    suppressVisualAnchorCaptions: layout.type === "two_column" || layout.type === "three_column",
    layoutType: layout.type,
  };
  layout.modules.forEach((module, idx) => {
    const area = areas[idx];
    const result = addContentPanelModule(slide, module, data, area, visualCaption, moduleOptions);
    anchorResults.push(...result.anchorResults);
    moduleLayouts.push(result.moduleLayout);
  });
  addColumnFlowArrows(slide, areas, layout.flowArrows || layout.flow_arrows || {});
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
      module_layouts: moduleLayouts,
    },
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
  if (data.contentLayout || data.content_layout || data.layout_schema) rejectContentLayoutPageRegionOverrides(data);
  const contentLayout = normalizeContentLayout(data.contentLayout || data.content_layout || data.layout_schema);
  if (!data.visual_anchor && !contentLayout) throw new Error("Content slide requires visual_anchor or contentLayout visual_anchor modules.");
  if (data.visual_anchor) validateVisualAnchorSpec(data.visual_anchor);

  const slide = pptx.addSlide();
  addPageTitle(slide, data.title || "页面标题", {
    kicker: data.kicker || "",
    subtitle: data.titleNote || data.titleSubtitle || "",
    sections: data.sections || [],
    currentSection: data.currentSection || data.section,
  });
  addAnalysisSummary(slide, data.summary);

  const supportingCards = data.supportingCards || data.supporting_cards || [];
  const hasSideCards = supportingCards.length > 0;
  const visualCaption = normalizeVisualAnchorCaption(data);
  const highlightReason = normalizeHighlightReason(data);
  const scoreBasis = safeText(data.scoreBasis ?? data.score_basis ?? data.visual_anchor?.score_basis ?? "");
  let anchorResults = [];
  let layoutInfo = null;
  let resolvedLayoutType = null;
  if (contentLayout) {
    const result = renderContentLayout(slide, data, contentLayout, visualCaption);
    anchorResults = result.anchorResults;
    layoutInfo = result.layoutInfo;
    resolvedLayoutType = layoutInfo?.type || null;
  } else {
    const anchorArea = cloneOptions(data.anchorArea || {
      x: HW_STYLE.slide.marginX,
      y: HW_STYLE.summary.contentTop,
      w: hasSideCards ? 7.52 : 12.23,
      h: HW_STYLE.slide.footerY - HW_STYLE.summary.contentTop - 0.35,
    });
    const captionReserveH = visualCaption ? (visualCaption.source ? 0.58 : 0.42) : 0;
    const visualArea = visualCaption
      ? { ...anchorArea, h: Math.max(1.4, anchorArea.h - captionReserveH) }
      : anchorArea;
    const renderResult = renderVisualAnchor(slide, data.visual_anchor, visualArea);
    const captionResult = visualCaption ? addVisualAnchorCaption(slide, visualCaption, renderResult, anchorArea, visualArea) : null;
    anchorResults = [{ visualAnchor: data.visual_anchor, anchorArea, visualArea, renderResult, captionResult }];
    if (hasSideCards) {
      addSupportingCards(slide, supportingCards, data.supportingArea || {
        x: anchorArea.x + anchorArea.w + 0.18,
        y: anchorArea.y,
        w: 12.78 - (anchorArea.x + anchorArea.w + 0.18),
        h: anchorArea.h,
      });
      resolvedLayoutType = "biased_column";
      layoutInfo = {
        type: "biased_column",
        reference: CONTENT_LAYOUT_SCHEMAS.biased_column.reference,
        modules_count: Math.min(4, supportingCards.length + 1),
        image_modules_count: 0,
        table_modules_count: 0,
        text_modules_count: supportingCards.length,
        visual_anchor_modules_count: 1,
        visual_anchor_blocks_count: 1,
        variant: "visual_anchor_with_supporting_cards",
      };
    }
  }
  addFooter(slide, { source: data.source, page: data.page });

  anchorResults.forEach((anchorResult) => ensureManifest(pptx).push({
    page: normalizePage(data.page, pptx),
    visual_anchor_id: anchorResult.visualAnchor.id,
    kind: anchorResult.visualAnchor.kind,
    template: anchorResult.visualAnchor.template,
    visual_anchor: cloneOptions(anchorResult.visualAnchor),
    renderer: anchorResult.renderResult.renderer,
    rendered: anchorResult.renderResult.rendered,
    image_format: anchorResult.renderResult.image_format,
    image_width: anchorResult.renderResult.image_width,
    image_height: anchorResult.renderResult.image_height,
    placeholder: anchorResult.renderResult.placeholder || undefined,
    image_area: anchorResult.renderResult.image_area,
    anchor_area: anchorResult.anchorArea,
    visual_area: anchorResult.visualArea,
    visual_anchor_caption: anchorResult.captionResult,
    supporting_cards_count: supportingCards.length,
    resolved_layout_type: resolvedLayoutType || undefined,
    highlight_reason: highlightReason || undefined,
    score_basis: scoreBasis || undefined,
    content_layout_schema: layoutInfo || undefined,
  }));
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
  addEvidenceModule,
  addSupportingCards,
  addVisualAnchorContentSlide,
  writeVisualAnchorManifest,
};
