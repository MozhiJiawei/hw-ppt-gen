const fs = require("fs");
const path = require("path");
const {
  HW_STYLE,
  addAnalysisSummary,
  addFooter,
  addHuaweiTable,
  addPageTitle,
  cloneOptions,
  grayCard,
  redTitleCard,
  safeText,
  textBox,
} = require("./hw_pptx_helpers");
const {
  createVisualAnchorImage,
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
  const renderPath = resolveVisualAnchorRenderPath(visualAnchor, {
    visualAnchorRenderer: slide._hwVisualAnchorRenderer || "rough_svg",
  });
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
      h: 0.14,
      fontSize: 6,
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
    reference: safeText(layout.reference || layout.layout_reference || schema.reference),
    modules,
    schema,
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

function contentLayoutAreas(layout, contentArea) {
  const gap = 0.18;
  if (layout.schema.special === "large_visual_with_side_cards") {
    const sideGap = 0.38;
    const visualW = contentArea.w * 0.59;
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
  const totalWeight = layout.schema.columns.reduce((sum, value) => sum + value, 0);
  const availableW = contentArea.w - gap * (layout.schema.columns.length - 1);
  let x = contentArea.x;
  return layout.schema.columns.map((weight) => {
    const w = availableW * (weight / totalWeight);
    const area = { x, y: contentArea.y, w, h: contentArea.h };
    x += w + gap;
    return area;
  });
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
  textBox(slide, text, {
    x: area.x,
    y: area.y,
    w: area.w,
    h: area.h,
    fontSize: module.fontSize || 12,
    color: HW_STYLE.color.text,
  });
}

function addTextModule(slide, module, area) {
  const bodyArea = addContentModuleFrame(slide, module, area);
  addModuleBodyText(slide, normalizeModuleBody(module), bodyArea, module);
}

function addTableModule(slide, module, area) {
  const bodyArea = addContentModuleFrame(slide, module, area);
  const rows = module.rows || module.table || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`table module "${module.title || module.label || ""}" requires rows.`);
  }
  const note = normalizeModuleBody(module);
  const tableH = note ? Math.min(bodyArea.h * 0.5, 1.25) : bodyArea.h;
  addHuaweiTable(slide, rows, {
    x: bodyArea.x,
    y: bodyArea.y,
    w: bodyArea.w,
    h: tableH,
    fontSize: 12,
    boldFirstColumn: true,
  });
  if (note) {
    addModuleBodyText(slide, note, {
      x: bodyArea.x,
      y: bodyArea.y + tableH + 0.16,
      w: bodyArea.w,
      h: bodyArea.h - tableH - 0.16,
    }, module);
  }
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
      flow: module.flow,
    }].filter((block) => block.visual_anchor);
  }
  if (role === "table") {
    return [{
      type: "table",
      rows: module.rows || module.table || [],
      body: module.body,
    }];
  }
  return [{ type: "text", body: normalizeModuleBody(module), fontSize: module.fontSize }];
}

function splitBlockAreas(area, blocks, flow = "top_bottom") {
  const gap = 0.1;
  const visibleBlocks = blocks.filter(Boolean);
  const horizontal = flow === "left_right" || flow === "right_left";
  const total = horizontal ? area.w : area.h;
  const explicit = visibleBlocks.reduce((sum, block) => sum + (Number(block.width || block.w || block.height || block.h) > 0 ? Number(horizontal ? (block.width || block.w) : (block.height || block.h)) : 0), 0);
  const flexible = visibleBlocks.filter((block) => !(Number(horizontal ? (block.width || block.w) : (block.height || block.h)) > 0));
  const weightTotal = flexible.reduce((sum, block) => sum + Math.max(0.1, Number(block.weight || block.flex || 1)), 0);
  const available = Math.max(0.1, total - gap * Math.max(0, visibleBlocks.length - 1) - explicit);
  let cursor = horizontal ? area.x : area.y;
  const areas = visibleBlocks.map((block) => {
    const explicitSize = Number(horizontal ? (block.width || block.w) : (block.height || block.h));
    const size = explicitSize > 0 ? explicitSize : available * (Math.max(0.1, Number(block.weight || block.flex || 1)) / weightTotal);
    const blockArea = horizontal
      ? { x: cursor, y: area.y, w: size, h: area.h }
      : { x: area.x, y: cursor, w: area.w, h: size };
    cursor += size + gap;
    return blockArea;
  });
  return flow === "right_left" || flow === "bottom_top" ? areas.reverse() : areas;
}

function renderVisualAnchorBlock(slide, block, module, data, area, fallbackCaption = null) {
  const visualAnchor = block.visual_anchor || block.visualAnchor;
  validateVisualAnchorSpec(visualAnchor);
  const caption = normalizeVisualAnchorCaption(block) || fallbackCaption;
  const captionReserveH = caption ? (caption.source ? 0.58 : 0.42) : 0;
  const visualArea = caption
    ? { ...area, h: Math.max(0.55, area.h - captionReserveH) }
    : area;
  const renderResult = renderVisualAnchor(slide, visualAnchor, visualArea);
  const captionResult = caption ? addVisualAnchorCaption(slide, caption, renderResult, area, visualArea) : null;
  return { visualAnchor, anchorArea: area, visualArea, renderResult, captionResult };
}

function renderModuleBlock(slide, block, module, data, area, fallbackCaption = null) {
  const type = block.type || block.role || block.kind || "text";
  if (type === "visual_anchor" || block.visual_anchor || block.visualAnchor) {
    return renderVisualAnchorBlock(slide, block, module, data, area, fallbackCaption);
  }
  if (type === "image") {
    throw new Error("contentLayout image blocks were removed; use visual_anchor kind=Evidence/template=source_figure with text annotations.");
  }
  if (type === "table") {
    addHuaweiTable(slide, block.rows || block.table || [], {
      x: area.x,
      y: area.y,
      w: area.w,
      h: area.h,
      fontSize: block.fontSize || 10,
      boldFirstColumn: true,
    });
    return null;
  }
  addModuleBodyText(slide, normalizeModuleBody(block), area, { ...module, fontSize: block.fontSize || module.fontSize });
  return null;
}

function addContentPanelModule(slide, module, data, area, visualCaption) {
  const bodyArea = addContentModuleFrame(slide, module, area);
  const blocks = normalizeModuleBlocks(module, data);
  const blockAreas = splitBlockAreas(bodyArea, blocks, module.flow || module.blockFlow || module.block_flow || "top_bottom");
  const anchorResults = [];
  blocks.forEach((block, idx) => {
    const result = renderModuleBlock(slide, block, module, data, blockAreas[idx], idx === 0 ? visualCaption : null);
    if (result) anchorResults.push(result);
  });
  return anchorResults;
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
        h: 0.14,
        fontSize: 6,
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
  const contentArea = data.contentArea || data.content_area || {
    x: HW_STYLE.slide.marginX,
    y: HW_STYLE.summary.contentTop - 0.18,
    w: 12.23,
    h: HW_STYLE.slide.footerY - HW_STYLE.summary.contentTop - 0.35,
  };
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
  const contentArea = data.contentArea || data.content_area || {
    x: HW_STYLE.slide.marginX,
    y: HW_STYLE.summary.contentTop - 0.18,
    w: 12.23,
    h: HW_STYLE.slide.footerY - HW_STYLE.summary.contentTop - 0.17,
  };
  const areas = contentLayoutAreas(layout, contentArea);
  const anchorResults = [];
  layout.modules.forEach((module, idx) => {
    const area = areas[idx];
    const role = module.role || module.kind || "text";
    if (module.blocks || module.children || role === "content_panel" || role === "visual_anchor") {
      anchorResults.push(...addContentPanelModule(slide, module, data, area, visualCaption));
    } else if (role === "table") {
      addTableModule(slide, module, area);
    } else {
      addTextModule(slide, module, area);
    }
  });
  addColumnFlowArrows(slide, areas, layout.flowArrows || layout.flow_arrows || {});
  return {
    anchorResults,
    layoutInfo: {
      type: layout.type,
      reference: layout.reference,
      modules_count: layout.modules.length,
      image_modules_count: 0,
      table_modules_count: layout.modules.filter((module) => (module.role || module.kind) === "table").length,
      text_modules_count: layout.modules.filter((module) => !countModuleVisualAnchors(module) && (module.role || module.kind) !== "table").length,
      visual_anchor_modules_count: anchorResults.length,
      visual_anchor_blocks_count: anchorResults.length,
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
    return { x: area.x, y: area.y + (area.h - h) / 2, w: area.w, h };
  }
  const w = area.h * imageRatio;
  return { x: area.x + (area.w - w) / 2, y: area.y, w, h: area.h };
}

function addVisualAnchorContentSlide(pptx, data = {}) {
  const contentLayout = normalizeContentLayout(data.contentLayout || data.content_layout || data.layout_schema);
  if (!data.visual_anchor && !contentLayout) throw new Error("Content slide requires visual_anchor or contentLayout visual_anchor modules.");
  if (data.visual_anchor) validateVisualAnchorSpec(data.visual_anchor);
  const renderer = pptx._hwVisualAnchorRenderer || "rough_svg";

  const slide = pptx.addSlide();
  slide._hwVisualAnchorRenderer = renderer;
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
  const relationshipTest = safeText(data.relationshipTest ?? data.relationship_test ?? data.visual_anchor?.relationship_test ?? "");
  const scoreBasis = safeText(data.scoreBasis ?? data.score_basis ?? data.visual_anchor?.score_basis ?? "");
  const layoutReference = safeText(data.layoutReference ?? data.layout_reference ?? data.visual_anchor?.layout_reference ?? "");
  let anchorResults = [];
  let layoutInfo = null;
  if (contentLayout) {
    const result = renderContentLayout(slide, data, contentLayout, visualCaption);
    anchorResults = result.anchorResults;
    layoutInfo = result.layoutInfo;
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
    image_area: anchorResult.renderResult.image_area,
    anchor_area: anchorResult.anchorArea,
    visual_area: anchorResult.visualArea,
    visual_anchor_caption: anchorResult.captionResult,
    supporting_cards_count: supportingCards.length,
    layout_reference: layoutReference || undefined,
    highlight_reason: highlightReason || undefined,
    relationship_test: relationshipTest || undefined,
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
    visual_anchor_renderer: pptx._hwVisualAnchorRenderer || "rough_svg",
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
