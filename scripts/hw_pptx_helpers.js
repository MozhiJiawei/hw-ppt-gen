const pptxgen = require("pptxgenjs");

const ShapeType = pptxgen.ShapeType || {
  rect: "rect",
  line: "line",
  ellipse: "ellipse",
  chevron: "chevron",
};

const HW_STYLE = Object.freeze({
  slide: { w: 13.333, h: 7.5, marginX: 0.55, titleY: 0.22, contentTop: 1.08, footerY: 7.12 },
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
});

function cloneOptions(value) {
  return JSON.parse(JSON.stringify(value || {}));
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

function addPageTitle(slide, title, kicker = "") {
  if (kicker) {
    textBox(slide, kicker, {
      x: HW_STYLE.slide.marginX,
      y: 0.14,
      w: 1.25,
      h: 0.18,
      fontSize: 12,
      bold: true,
      color: HW_STYLE.color.red,
    });
  }
  textBox(slide, title, {
    x: HW_STYLE.slide.marginX,
    y: HW_STYLE.slide.titleY,
    w: 12.2,
    h: 0.5,
    fontSize: HW_STYLE.size.pageTitle,
    bold: true,
    color: HW_STYLE.color.red,
  });
  addLine(slide, HW_STYLE.slide.marginX, 0.88, 12.78, 0.88, {
    line: { color: HW_STYLE.color.red, width: 0.5 },
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

function redTitleCard(slide, title, x, y, w, h = 0.32) {
  addRect(slide, {
    x,
    y,
    w,
    h,
    fill: { color: HW_STYLE.color.red },
    line: { color: HW_STYLE.color.red, width: 0.5 },
  });
  textBox(slide, title, {
    x: x + 0.12,
    y: y + 0.04,
    w: w - 0.24,
    h: h - 0.08,
    fontSize: HW_STYLE.size.cardTitle,
    bold: true,
    color: HW_STYLE.color.white,
    valign: "mid",
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

function addSectionSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  slide.background = { color: HW_STYLE.color.white };
  addPageTitle(slide, data.title || "章节标题");
  addRect(slide, { x: HW_STYLE.slide.marginX, y: 1.35, w: 1.05, h: 0.5, fill: { color: HW_STYLE.color.red }, line: { color: HW_STYLE.color.red, width: 0.5 } });
  textBox(slide, data.number || "01", {
    x: HW_STYLE.slide.marginX,
    y: 1.45,
    w: 1.05,
    h: 0.24,
    fontSize: HW_STYLE.size.body,
    bold: true,
    color: HW_STYLE.color.white,
    align: "center",
    lineSpacingMultiple: 1,
  });
  textBox(slide, data.subtitle || "", {
    x: 1.82,
    y: 1.37,
    w: 10.9,
    h: 0.36,
    fontSize: HW_STYLE.size.bodyLarge,
    color: HW_STYLE.color.gray,
  });
  if (Array.isArray(data.points) && data.points.length) {
    const body = data.points.slice(0, 4).map((point, idx) => `${idx + 1}. ${safeText(point)}`).join("\n");
    grayCard(slide, {
      x: HW_STYLE.slide.marginX,
      y: 2.25,
      w: 12.23,
      h: 2.8,
      title: data.pointTitle || "本章重点",
      body,
      fill: HW_STYLE.color.card,
    });
  }
  addFooter(slide, { source: data.source, page: data.page });
  return slide;
}

function addContentCardsSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  addPageTitle(slide, data.title || "页面标题", data.kicker || "");
  const cards = data.cards || [];
  const cols = data.columns || (cards.length > 2 ? 3 : 1);
  const density = data.density || "compact";
  const gap = 0.12;
  const areaX = HW_STYLE.slide.marginX;
  const areaY = HW_STYLE.slide.contentTop;
  const areaW = 12.23;
  const areaH = 6.0;
  const colW = (areaW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(cards.length / cols);
  const fullRowH = (areaH - gap * (rows - 1)) / Math.max(rows, 1);
  const defaultRowH = density === "dense" ? fullRowH : Math.min(fullRowH, data.cardHeight || 2.25);
  const rowH = Math.max(defaultRowH, 1.45);
  cards.forEach((card, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = areaX + col * (colW + gap);
    const y = areaY + row * (rowH + gap);
    redTitleCard(slide, card.title || `要点 ${idx + 1}`, x, y, colW);
    grayCard(slide, {
      x,
      y: y + 0.34,
      w: colW,
      h: (card.height || rowH) - 0.34,
      title: card.subtitle || "",
      body: card.body || card.items || "",
      fill: card.fill || HW_STYLE.color.card,
    });
  });
  if (data.summary || (density !== "dense" && rows === 1 && cards.length >= 2)) {
    const summaryY = areaY + rowH + 0.22;
    const summary = data.summary || {
      title: "综合判断",
      body: "补充证据区：优先放置表格、图表、流程、源图或结论说明，避免三栏内容页出现大面积空白。",
    };
    grayCard(slide, {
      x: areaX,
      y: summaryY,
      w: areaW,
      h: Math.min(1.35, HW_STYLE.slide.footerY - summaryY - 0.25),
      title: summary.title,
      body: summary.body,
      fill: summary.fill || HW_STYLE.color.softRed,
    });
  }
  addFooter(slide, { source: data.source, page: data.page });
  return slide;
}

function addColumnsSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  addPageTitle(slide, data.title || "分栏页面", data.kicker || "");
  const columns = data.columns || [];
  const weights = data.weights || columns.map(() => 1);
  const density = data.density || "compact";
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  const gap = 0.12;
  const areaX = HW_STYLE.slide.marginX;
  const areaY = HW_STYLE.slide.contentTop;
  const areaW = 12.23;
  const cardH = density === "dense" ? 5.85 : Math.min(data.cardHeight || 2.65, 5.85);
  let x = areaX;
  columns.forEach((column, idx) => {
    const w = (areaW - gap * (columns.length - 1)) * (weights[idx] / total);
    redTitleCard(slide, column.title || `模块 ${idx + 1}`, x, areaY, w);
    grayCard(slide, {
      x,
      y: areaY + 0.34,
      w,
      h: column.height || cardH,
      title: column.subtitle || "",
      body: column.body || column.items || "",
      fill: column.fill || HW_STYLE.color.card,
    });
    x += w + gap;
  });
  if (data.summary || (density !== "dense" && columns.length >= 2)) {
    const summaryY = areaY + cardH + 0.58;
    const summary = data.summary || {
      title: "补充证据区",
      body: "分栏页默认保持紧凑；剩余空间应用于图表、流程、表格、源图或总结，不要放大空卡片。",
    };
    grayCard(slide, {
      x: areaX,
      y: summaryY,
      w: areaW,
      h: Math.min(1.35, HW_STYLE.slide.footerY - summaryY - 0.25),
      title: summary.title,
      body: summary.body,
      fill: summary.fill || HW_STYLE.color.softRed,
    });
  }
  addFooter(slide, { source: data.source, page: data.page });
  return slide;
}

function addDataCardsSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  addPageTitle(slide, data.title || "数据概览", data.kicker || "");
  const cards = data.cards || [];
  const gap = 0.12;
  const cols = Math.min(4, Math.max(1, data.columns || cards.length || 1));
  const colW = (12.23 - gap * (cols - 1)) / cols;
  const rowH = 1.48;
  cards.forEach((card, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = HW_STYLE.slide.marginX + col * (colW + gap);
    const y = HW_STYLE.slide.contentTop + row * (rowH + gap);
    addRect(slide, { x, y, w: colW, h: rowH, fill: { color: card.fill || HW_STYLE.color.pale }, line: { color: HW_STYLE.color.line, width: 0.5 } });
    textBox(slide, card.value || "0", {
      x: x + 0.16,
      y: y + 0.2,
      w: colW - 0.32,
      h: 0.38,
      fontFace: HW_STYLE.font.data,
      fontSize: card.fontSize || HW_STYLE.size.data,
      color: card.highlight ? HW_STYLE.color.red : HW_STYLE.color.black,
    });
    textBox(slide, card.label || "", {
      x: x + 0.17,
      y: y + 0.72,
      w: colW - 0.34,
      h: 0.18,
      fontSize: HW_STYLE.size.label,
      color: HW_STYLE.color.gray,
    });
    textBox(slide, card.note || "", {
      x: x + 0.17,
      y: y + 0.99,
      w: colW - 0.34,
      h: 0.32,
      fontSize: HW_STYLE.size.body,
      color: HW_STYLE.color.text,
    });
  });
  if (data.summary) {
    grayCard(slide, { x: HW_STYLE.slide.marginX, y: 4.2, w: 12.23, h: 1.6, title: data.summary.title, body: data.summary.body, fill: HW_STYLE.color.softRed });
  }
  addFooter(slide, { source: data.source, page: data.page });
  return slide;
}

function addTableSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  addPageTitle(slide, data.title || "表格分析", data.kicker || "");
  const rows = data.rows || [];
  const tableData = rows.map((row, rIdx) =>
    row.map((cell) => ({
      text: safeText(cell),
      options: {
        fontFace: HW_STYLE.font.cn,
        fontSize: rIdx === 0 ? HW_STYLE.size.body : HW_STYLE.size.body,
        color: rIdx === 0 ? HW_STYLE.color.white : HW_STYLE.color.text,
        bold: rIdx === 0,
        fill: { color: rIdx === 0 ? HW_STYLE.color.red : rIdx % 2 ? HW_STYLE.color.white : HW_STYLE.color.pale },
        margin: 0.03,
        border: { type: "solid", color: HW_STYLE.color.line, pt: 0.5 },
      },
    }))
  );
  slide.addTable(tableData, {
    x: HW_STYLE.slide.marginX,
    y: HW_STYLE.slide.contentTop,
    w: 12.23,
    h: 5.78,
    border: { type: "solid", color: HW_STYLE.color.line, pt: 0.5 },
    margin: 0.03,
  });
  addFooter(slide, { source: data.source, page: data.page });
  return slide;
}

function addBarChartSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  addPageTitle(slide, data.title || "柱状图分析", data.kicker || "");
  const series = data.series || [];
  const maxValue = Math.max(...series.map((item) => Number(item.value) || 0), 1);
  const chartX = 0.85;
  const chartY = 1.22;
  const chartW = 7.35;
  const chartH = 4.7;
  addLine(slide, chartX, chartY + chartH, chartX + chartW, chartY + chartH, { line: { color: HW_STYLE.color.line, width: 0.5 } });
  const gap = 0.12;
  const barW = Math.min(0.55, (chartW - gap * Math.max(series.length - 1, 0)) / Math.max(series.length, 1));
  series.forEach((item, idx) => {
    const h = chartH * ((Number(item.value) || 0) / maxValue);
    const x = chartX + idx * (barW + gap);
    const y = chartY + chartH - h;
    const color = item.highlight ? HW_STYLE.color.red : HW_STYLE.color.midGray;
    addRect(slide, { x, y, w: barW, h, fill: { color }, line: { color, width: 0.5 } });
    textBox(slide, item.value, { x: x - 0.08, y: y - 0.34, w: barW + 0.16, h: 0.22, fontSize: HW_STYLE.size.body, color: HW_STYLE.color.gray, align: "center" });
    textBox(slide, item.label, { x: x - 0.18, y: chartY + chartH + 0.12, w: barW + 0.36, h: 0.28, fontSize: HW_STYLE.size.body, color: HW_STYLE.color.gray, align: "center" });
  });
  grayCard(slide, {
    x: 8.45,
    y: 1.2,
    w: 3.9,
    h: 4.72,
    title: data.insightTitle || "关键观察",
    body: data.insights || [],
    fill: HW_STYLE.color.card,
  });
  addFooter(slide, { source: data.source, page: data.page });
  return slide;
}

function addFlowSlide(pptx, data = {}) {
  const slide = pptx.addSlide();
  addPageTitle(slide, data.title || "流程设计", data.kicker || "");
  const steps = data.steps || [];
  const areaX = 0.7;
  const y = 1.55;
  const gap = 0.12;
  const stepW = (12.0 - gap * Math.max(steps.length - 1, 0)) / Math.max(steps.length, 1);
  steps.forEach((step, idx) => {
    const x = areaX + idx * (stepW + gap);
    addRect(slide, { x, y, w: stepW, h: 0.48, fill: { color: HW_STYLE.color.red }, line: { color: HW_STYLE.color.red, width: 0.5 } });
    textBox(slide, `${idx + 1}. ${step.title || "步骤"}`, { x: x + 0.08, y: y + 0.1, w: stepW - 0.16, h: 0.22, fontSize: HW_STYLE.size.body, bold: true, color: HW_STYLE.color.white, align: "center" });
    grayCard(slide, { x, y: y + 0.58, w: stepW, h: 3.45, title: step.subtitle || "", body: step.body || step.items || "", fill: HW_STYLE.color.card });
    if (idx < steps.length - 1) {
      addLine(slide, x + stepW + 0.02, y + 0.24, x + stepW + gap - 0.02, y + 0.24, { line: { color: HW_STYLE.color.line, width: 0.5, endArrowType: "triangle" } });
    }
  });
  if (data.summary) {
    grayCard(slide, { x: 0.7, y: 5.62, w: 12.0, h: 0.75, title: data.summary.title, body: data.summary.body, fill: HW_STYLE.color.softRed });
  }
  addFooter(slide, { source: data.source, page: data.page });
  return slide;
}

module.exports = {
  HW_STYLE,
  addBarChartSlide,
  addColumnsSlide,
  addContentCardsSlide,
  addCoverSlide,
  addDataCardsSlide,
  addFlowSlide,
  addFooter,
  addPageTitle,
  addSectionSlide,
  addTableSlide,
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
