const pptxgen = require("pptxgenjs");

const ShapeType = pptxgen.ShapeType || {
  rect: "rect",
  line: "line",
  ellipse: "ellipse",
  chevron: "chevron",
};

const HW_STYLE = Object.freeze({
  slide: { w: 13.333, h: 7.5, marginX: 0.55, titleY: 0.3, titleRuleY: 0.84, contentTop: 1.08, footerY: 7.12 },
  font: {
    cn: "Microsoft YaHei",
    en: "Arial",
    data: "Impact",
  },
  color: {
    red: "C00000",
    black: "000000",
    dark: "333333",
    text: "1F1F1F",
    gray: "595959",
    midGray: "8C8C8C",
    line: "BFBFBF",
    lightLine: "D9D9D9",
    card: "F2F2F2",
    pale: "F7F7F7",
    softRed: "FFF1EF",
    softRed2: "FCE4E0",
    white: "FFFFFF",
  },
  size: {
    pageTitle: 24,
    sectionTitle: 24,
    cardTitle: 14,
    subTitle: 14,
    body: 12,
    bodyLarge: 14,
    label: 12,
    min: 6,
    data: 18,
  },
  line: { normal: 0.5 },
  summary: { y: 1.08, h: 1.12, contentTop: 2.47 },
});

function cloneOptions(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function estimateTextUnits(text) {
  let units = 0;
  for (const char of String(text || "")) {
    if (/[\u3400-\u9fff]/.test(char)) units += 1;
    else if (/[A-Z]/.test(char)) units += 0.72;
    else if (/[a-z]/.test(char)) units += 0.55;
    else if (/[0-9]/.test(char)) units += 0.55;
    else if (/\s/.test(char)) units += 0.3;
    else units += 0.35;
  }
  return units;
}

function estimateTextWidth(text, fontSize) {
  return estimateTextUnits(text) * (fontSize / 72);
}

function stripHash(color) {
  if (!color) return color;
  const value = String(color).replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{8}$/.test(value)) {
    throw new Error(`Do not use 8-digit hex colors: ${color}`);
  }
  if (!/^[0-9A-F]{6}$/.test(value)) {
    throw new Error(`Invalid 6-digit hex color: ${color}`);
  }
  return value;
}

function safeText(value) {
  return String(value ?? "")
    .replace(/[\u2022\u25CF\u25CB\u25A0\u25AA]/g, "-")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function ensureTmpPath(fileName) {
  const normalized = String(fileName || "").replace(/\\/g, "/");
  if (!normalized.includes("/.tmp/") && !normalized.startsWith(".tmp/")) {
    throw new Error(`Generated artifacts must be saved under .tmp: ${fileName}`);
  }
  return fileName;
}

function createHuaweiDeck(metadata = {}) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = metadata.author || "Huawei PPTX Generator";
  pptx.company = metadata.company || "Huawei";
  pptx.subject = metadata.subject || "Huawei-style business presentation";
  pptx.title = metadata.title || "Huawei-style deck";
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: HW_STYLE.font.cn,
    bodyFontFace: HW_STYLE.font.cn,
    lang: "zh-CN",
  };
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: HW_STYLE.slide.w, height: HW_STYLE.slide.h });
  return pptx;
}

function textBox(slide, text, options = {}) {
  const opts = cloneOptions({
    fontFace: HW_STYLE.font.cn,
    fontSize: HW_STYLE.size.body,
    color: HW_STYLE.color.text,
    breakLine: false,
    lineSpacingMultiple: 1.5,
    margin: 0.05,
    valign: "top",
    ...options,
  });
  if (opts.color) opts.color = stripHash(opts.color);
  slide.addText(safeText(text), opts);
}

function addRect(slide, options = {}) {
  const opts = cloneOptions(options);
  if (opts.fill && opts.fill.color) opts.fill.color = stripHash(opts.fill.color);
  if (opts.line && opts.line.color) opts.line.color = stripHash(opts.line.color);
  slide.addShape(ShapeType.rect, opts);
}

function addLine(slide, x1, y1, x2, y2, options = {}) {
  const opts = cloneOptions({
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color: HW_STYLE.color.line, width: HW_STYLE.line.normal, beginArrowType: "none", endArrowType: "none" },
    ...options,
  });
  if (opts.line && opts.line.color) opts.line.color = stripHash(opts.line.color);
  slide.addShape(ShapeType.line, opts);
}

function addPageTitle(slide, title, options = {}) {
  const opts = typeof options === "string" ? { kicker: options } : (options || {});
  const kicker = opts.kicker || "";
  const subtitle = opts.subtitle || opts.titleNote || "";
  const hasSectionTabs = Array.isArray(opts.sections) && opts.sections.length > 0;
  const titleW = 12.2;
  const titleY = opts.titleY ?? (hasSectionTabs ? 0.46 : HW_STYLE.slide.titleY);
  const titleRuleY = opts.titleRuleY ?? (hasSectionTabs ? 1.0 : HW_STYLE.slide.titleRuleY);
  if (kicker) {
    textBox(slide, kicker, {
      x: HW_STYLE.slide.marginX,
      y: titleY - 0.16,
      w: 1.25,
      h: 0.18,
      fontSize: 12,
      bold: true,
      color: HW_STYLE.color.red,
    });
  }
  const subtitleText = safeText(subtitle);
  if (subtitleText) {
    slide.addText([
      { text: safeText(title), options: { fontSize: HW_STYLE.size.pageTitle, bold: true } },
      { text: ` - ${subtitleText}`, options: { fontSize: HW_STYLE.size.data, bold: true } },
    ], cloneOptions({
      x: HW_STYLE.slide.marginX,
      y: titleY,
      w: titleW,
      h: 0.5,
      fontFace: HW_STYLE.font.cn,
      fontSize: HW_STYLE.size.pageTitle,
      color: HW_STYLE.color.red,
      margin: 0.05,
      breakLine: false,
      lineSpacingMultiple: 1,
      valign: "top",
    }));
  } else {
    textBox(slide, title, {
      x: HW_STYLE.slide.marginX,
      y: titleY,
      w: titleW,
      h: 0.5,
      fontSize: HW_STYLE.size.pageTitle,
      bold: true,
      color: HW_STYLE.color.red,
    });
  }
  if (hasSectionTabs) {
    addSectionTabs(slide, opts.sections, opts.currentSection ?? opts.activeSection ?? opts.section);
  }
  addLine(slide, HW_STYLE.slide.marginX, titleRuleY, 12.78, titleRuleY, {
    line: { color: HW_STYLE.color.red, width: 0.5 },
  });
}

function normalizeSectionTabs(sections, currentSection) {
  const titles = (sections || [])
    .map((section) => {
      if (section && typeof section === "object") return section.shortTitle || section.title || section.name || section.label || "";
      return section;
    })
    .map(safeText)
    .filter(Boolean);
  if (!titles.length) return { titles: [], activeIndex: -1 };

  let activeIndex = 0;
  if (Number.isInteger(currentSection)) {
    activeIndex = currentSection >= 1 && currentSection <= titles.length ? currentSection - 1 : Math.max(0, Math.min(currentSection, titles.length - 1));
  } else if (currentSection) {
    const normalized = safeText(currentSection);
    const exact = titles.findIndex((title) => title === normalized);
    const partial = titles.findIndex((title) => normalized.includes(title) || title.includes(normalized));
    activeIndex = exact >= 0 ? exact : (partial >= 0 ? partial : 0);
  }
  return { titles, activeIndex };
}

function addSectionTabs(slide, sections, currentSection, options = {}) {
  const { titles, activeIndex } = normalizeSectionTabs(sections, currentSection);
  if (!titles.length) return;
  const minTabW = options.minTabW ?? 0.88;
  const maxTabW = options.maxTabW ?? 1.55;
  const maxW = options.maxW ?? 5.25;
  const naturalWidths = titles.map((title) => Math.max(minTabW, Math.min(maxTabW, estimateTextWidth(title, 8) + 0.38)));
  const naturalTotal = naturalWidths.reduce((sum, value) => sum + value, 0);
  const scale = naturalTotal > maxW ? maxW / naturalTotal : 1;
  const widths = naturalWidths.map((value) => value * scale);
  const w = options.w ?? widths.reduce((sum, value) => sum + value, 0);
  const x = options.x ?? (12.78 - w);
  const y = options.y ?? 0;
  const h = options.h ?? 0.32;
  let cursorX = x;
  titles.forEach((title, idx) => {
    const active = idx === activeIndex;
    const tabW = widths[idx] ?? (w / titles.length);
    addRect(slide, {
      x: cursorX,
      y,
      w: tabW,
      h,
      fill: { color: active ? HW_STYLE.color.red : HW_STYLE.color.white },
      line: { color: HW_STYLE.color.black, width: 0.5 },
    });
    textBox(slide, title, {
      x: cursorX + 0.05,
      y: y + 0.065,
      w: tabW - 0.1,
      h: h - 0.1,
      fontSize: 8,
      bold: true,
      color: active ? HW_STYLE.color.white : HW_STYLE.color.black,
      align: "center",
      valign: "mid",
      lineSpacingMultiple: 1,
      margin: 0,
      fit: "shrink",
    });
    cursorX += tabW;
  });
}

function addFooter(slide, options = {}) {
  const { source = "", page = "", confidentiality = "" } = options;
  addLine(slide, HW_STYLE.slide.marginX, HW_STYLE.slide.footerY, 12.78, HW_STYLE.slide.footerY, {
    line: { color: HW_STYLE.color.lightLine, width: 0.5 },
  });
  textBox(slide, source || confidentiality, {
    x: HW_STYLE.slide.marginX,
    y: 7.18,
    w: 9.4,
    h: 0.14,
    fontSize: HW_STYLE.size.min,
    color: HW_STYLE.color.midGray,
  });
  textBox(slide, page ? String(page) : "", {
    x: 12.25,
    y: 7.18,
    w: 0.55,
    h: 0.14,
    fontSize: HW_STYLE.size.min,
    color: HW_STYLE.color.midGray,
    align: "right",
  });
}

function redTitleCard(slide, title, x, y, w, h = 0.36) {
  const boxH = Math.max(h, 0.34);
  addRect(slide, {
    x,
    y,
    w,
    h: boxH,
    fill: { color: HW_STYLE.color.red },
    line: { color: HW_STYLE.color.red, width: 0.5 },
  });
  textBox(slide, title, {
    x: x + 0.16,
    y: y + 0.055,
    w: w - 0.32,
    h: boxH - 0.11,
    fontSize: HW_STYLE.size.cardTitle,
    bold: true,
    color: HW_STYLE.color.white,
    valign: "mid",
  });
}

function normalizeSummary(summary, fallbackTitle = "分析总结") {
  if (!summary) {
    return {
      title: fallbackTitle,
      body: [
        { label: "核心判断", text: "围绕本页后续内容提炼一句明确观点。" },
        { label: "内容取舍", text: "总结不超过三点，详细证据放在下方内容区。" },
      ],
      fill: HW_STYLE.color.card,
    };
  }
  if (Array.isArray(summary)) {
    return { title: fallbackTitle, body: summary, fill: HW_STYLE.color.card };
  }
  if (typeof summary === "string") {
    return { title: fallbackTitle, body: summary, fill: HW_STYLE.color.card };
  }
  return { title: summary.label || fallbackTitle, body: summary.body || summary.items || summary.title || "", fill: summary.fill || HW_STYLE.color.card };
}

function normalizeSummaryLines(body) {
  if (Array.isArray(body)) {
    return body.slice(0, 3).map((line, idx) => normalizeSummaryLine(line, idx));
  }
  return [normalizeSummaryLine(body, 0)];
}

function normalizeSummaryLine(line, idx = 0) {
  if (line && typeof line === "object") {
    return {
      label: safeText(line.label || line.title || fallbackSummaryLabel(idx)),
      text: safeText(line.text || line.body || line.value || ""),
    };
  }
  const text = safeText(line);
  const match = text.match(/^([^：:]{2,10})[：:]\s*(.+)$/);
  if (match && !/^结论\d*$/.test(match[1])) {
    return { label: safeText(match[1]), text: safeText(match[2]) };
  }
  return { label: fallbackSummaryLabel(idx), text };
}

function fallbackSummaryLabel(idx) {
  return ["核心判断", "内容取舍", "行动指向"][idx] || "关键总结";
}

function addSummaryRichText(slide, lines, options) {
  const lineH = Math.min(0.28, (options.h || 0.56) / Math.max(lines.length, 1));
  lines.forEach((line, idx) => {
    slide.addText([
      { text: `${line.label}：`, options: { bold: true } },
      { text: line.text, options: { bold: false } },
    ], cloneOptions({
      fontFace: HW_STYLE.font.cn,
      fontSize: HW_STYLE.size.bodyLarge,
      color: HW_STYLE.color.text,
      margin: 0.01,
      breakLine: false,
      lineSpacingMultiple: 1,
      paraSpaceAfterPt: 0,
      ...options,
      y: options.y + idx * lineH,
      h: lineH,
    }));
  });
}

function addAnalysisSummary(slide, summary, options = {}) {
  const {
    x = HW_STYLE.slide.marginX,
    y = HW_STYLE.summary.y,
    w = 12.23,
    h = HW_STYLE.summary.h,
    labelW = 1.06,
    title = "分析总结",
  } = options;
  const data = normalizeSummary(summary, title);
  addRect(slide, {
    x,
    y: y + 0.16,
    w: labelW,
    h: h - 0.32,
    fill: { color: HW_STYLE.color.red },
    line: { color: HW_STYLE.color.red, width: 0.5 },
  });
  textBox(slide, data.title || title, {
    x: x + 0.06,
    y: y + 0.24,
    w: labelW - 0.12,
    h: h - 0.48,
    fontSize: HW_STYLE.size.bodyLarge,
    bold: true,
    color: HW_STYLE.color.white,
    align: "center",
    valign: "mid",
    lineSpacingMultiple: 1.05,
  });
  addRect(slide, {
    x: x + labelW + 0.12,
    y: y + 0.16,
    w: w - labelW - 0.12,
    h: h - 0.32,
    fill: { color: data.fill || HW_STYLE.color.card },
    line: { color: data.fill || HW_STYLE.color.card, width: 0.5 },
  });
  addSummaryRichText(slide, normalizeSummaryLines(data.body), {
    x: x + labelW + 0.35,
    y: y + 0.23,
    w: w - labelW - 0.58,
    h: h - 0.46,
  });
}

function grayCard(slide, options = {}) {
  const {
    x,
    y,
    w,
    h,
    title = "",
    body = "",
    fill = HW_STYLE.color.card,
    border = HW_STYLE.color.line,
    titleColor = HW_STYLE.color.black,
    bodyColor = HW_STYLE.color.text,
  } = options;
  addRect(slide, {
    x,
    y,
    w,
    h,
    fill: { color: fill },
    line: { color: border, width: 0.5 },
  });
  let bodyY = y + 0.12;
  if (title) {
    textBox(slide, title, {
      x: x + 0.13,
      y: y + 0.11,
      w: w - 0.26,
      h: 0.28,
      fontSize: HW_STYLE.size.subTitle,
      bold: true,
      color: titleColor,
    });
    bodyY = y + 0.5;
  }
  textBox(slide, Array.isArray(body) ? body.map((line) => `- ${safeText(line)}`).join("\n") : body, {
    x: x + 0.13,
    y: bodyY,
    w: w - 0.26,
    h: h - (bodyY - y) - 0.08,
    fontSize: HW_STYLE.size.body,
    color: bodyColor,
    breakLine: false,
    valign: "top",
    lineSpacingMultiple: 1.5,
    paraSpaceAfterPt: 0,
    breakLineAfter: false,
  });
}

function addCoverSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: HW_STYLE.color.white };
  addRect(slide, { x: 0, y: 1.55, w: 13.333, h: 2.7, fill: { color: HW_STYLE.color.red }, line: { color: HW_STYLE.color.red, width: 0.5, transparency: 100 } });
  textBox(slide, data.title || "汇报标题", {
    x: 0.85,
    y: 2.03,
    w: 11.6,
    h: 0.82,
    fontSize: HW_STYLE.size.pageTitle,
    bold: true,
    color: HW_STYLE.color.white,
    valign: "mid",
  });
  textBox(slide, data.subtitle || "", {
    x: 0.88,
    y: 3.02,
    w: 10.8,
    h: 0.32,
    fontSize: HW_STYLE.size.sectionTitle,
    color: HW_STYLE.color.white,
  });
  textBox(slide, data.department || "", {
    x: 0.88,
    y: 4.55,
    w: 8.4,
    h: 0.25,
    fontSize: HW_STYLE.size.body,
    color: HW_STYLE.color.gray,
  });
  textBox(slide, data.date || "", {
    x: 0.88,
    y: 4.92,
    w: 3.0,
    h: 0.2,
    fontSize: HW_STYLE.size.body,
    color: HW_STYLE.color.gray,
  });
  return slide;
}

function addTocSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  addPageTitle(slide, data.title || "目录 CONTENTS");
  const items = data.items || [];
  const startY = 1.35;
  const rowH = Math.min(1.2, 5.3 / Math.max(items.length, 1));
  items.forEach((item, idx) => {
    const y = startY + idx * rowH;
    slide.addShape(ShapeType.ellipse, {
      x: 0.95,
      y: y + 0.03,
      w: 0.5,
      h: 0.5,
      fill: { color: HW_STYLE.color.red },
      line: { color: HW_STYLE.color.red, width: 0.5 },
    });
    textBox(slide, String(idx + 1).padStart(2, "0"), {
      x: 0.98,
      y: y + 0.14,
      w: 0.44,
      h: 0.22,
      fontSize: HW_STYLE.size.body,
      bold: true,
      color: HW_STYLE.color.white,
      align: "center",
      lineSpacingMultiple: 1,
    });
    textBox(slide, item.title || item, {
      x: 1.62,
      y: y - 0.03,
      w: 9.8,
      h: 0.48,
      fontSize: HW_STYLE.size.sectionTitle,
      bold: true,
      color: HW_STYLE.color.black,
      lineSpacingMultiple: 1,
    });
    textBox(slide, item.note || "", {
      x: 1.62,
      y: y + 0.48,
      w: 9.8,
      h: 0.28,
      fontSize: HW_STYLE.size.body,
      color: HW_STYLE.color.gray,
      lineSpacingMultiple: 1.2,
    });
  });
  addFooter(slide, { source: data.source, page: data.page });
  return slide;
}

function addHuaweiTable(slide, rows, options = {}) {
  const dataRows = rows || [];
  const tableData = dataRows.map((row, rIdx) =>
    row.map((cell, cIdx) => {
      const cellText = typeof cell === "object" && cell !== null ? cell.text : cell;
      const cellOptions = typeof cell === "object" && cell !== null ? (cell.options || {}) : {};
      return {
        text: safeText(cellText),
        options: cloneOptions({
          fontFace: HW_STYLE.font.cn,
          fontSize: options.fontSize || HW_STYLE.size.body,
          color: rIdx === 0 ? HW_STYLE.color.white : HW_STYLE.color.text,
          bold: rIdx === 0 || (options.boldFirstColumn && cIdx === 0),
          fill: { color: rIdx === 0 ? HW_STYLE.color.red : (rIdx % 2 ? HW_STYLE.color.white : HW_STYLE.color.pale) },
          margin: options.margin ?? 0.06,
          align: "left",
          border: { type: "solid", color: HW_STYLE.color.line, pt: 0.5 },
          ...cellOptions,
        }),
      };
    })
  );
  const tableOptions = {
    x: options.x ?? HW_STYLE.slide.marginX,
    y: options.y ?? HW_STYLE.summary.contentTop,
    w: options.w ?? 12.23,
    border: { type: "solid", color: HW_STYLE.color.line, pt: 0.5 },
    margin: options.margin ?? 0.06,
  };
  if (options.h !== undefined) tableOptions.h = options.h;
  if (options.colW !== undefined) tableOptions.colW = options.colW;
  if (options.rowH !== undefined) tableOptions.rowH = options.rowH;
  slide.addTable(tableData, tableOptions);
}

module.exports = {
  HW_STYLE,
  addCoverSlide,
  addFooter,
  addHuaweiTable,
  addAnalysisSummary,
  addPageTitle,
  addSectionTabs,
  addTocSlide,
  cloneOptions,
  createHuaweiDeck,
  ensureTmpPath,
  grayCard,
  redTitleCard,
  safeText,
  stripHash,
  textBox,
};
