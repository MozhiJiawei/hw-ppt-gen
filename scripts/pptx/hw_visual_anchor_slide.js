const fs = require("fs");
const path = require("path");
const {
  HW_STYLE,
  addAnalysisSummary,
  addFooter,
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
  renderVisualAnchorPptNative(slide, visualAnchor, area);
  return { renderer: renderPath, rendered: true };
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

function addVisualAnchorCaption(slide, caption, renderResult, anchorArea, visualArea) {
  const text = Array.isArray(caption.text) ? caption.text.filter(Boolean).join("\n") : safeText(caption.text);
  const source = safeText(caption.source);
  if (!text) return null;

  const imageArea = renderResult.image_area || visualArea;
  const captionH = source ? 0.46 : 0.3;
  const captionY = Math.min(
    imageArea.y + imageArea.h + 0.06,
    anchorArea.y + anchorArea.h - captionH
  );
  textBox(slide, text, {
    x: anchorArea.x + 0.12,
    y: captionY,
    w: anchorArea.w - 0.24,
    h: source ? 0.22 : 0.28,
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
      y: captionY + 0.25,
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
  if (!data.visual_anchor) throw new Error("Content slide requires visual_anchor.");
  validateVisualAnchorSpec(data.visual_anchor);

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
  if (hasSideCards) {
    addSupportingCards(slide, supportingCards, data.supportingArea || {
      x: anchorArea.x + anchorArea.w + 0.18,
      y: anchorArea.y,
      w: 12.78 - (anchorArea.x + anchorArea.w + 0.18),
      h: anchorArea.h,
    });
  }
  addFooter(slide, { source: data.source, page: data.page });

  ensureManifest(pptx).push({
    page: normalizePage(data.page, pptx),
    visual_anchor_id: data.visual_anchor.id,
    kind: data.visual_anchor.kind,
    template: data.visual_anchor.template,
    visual_anchor: cloneOptions(data.visual_anchor),
    renderer: renderResult.renderer,
    rendered: renderResult.rendered,
    image_format: renderResult.image_format,
    image_width: renderResult.image_width,
    image_height: renderResult.image_height,
    image_area: renderResult.image_area,
    anchor_area: anchorArea,
    visual_area: visualArea,
    visual_anchor_caption: captionResult,
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
  addEvidenceModule,
  addSupportingCards,
  addVisualAnchorContentSlide,
  writeVisualAnchorManifest,
};
