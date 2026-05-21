const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { parsePptContentBrief } = require("../pptx/parse_ppt_content_brief");
const { resolveVisualAnchorRenderPath, validateVisualAnchorSpec } = require("../pptx/hw_diagram_helpers");
const {
  estimateTextBoxHeight: estimateGeneratedTextBoxHeight,
  estimateWrappedLines: estimateGeneratedWrappedLines,
} = require("../pptx/hw_pptx_helpers");

const ALLOWED_FONTS = new Set([
  "Microsoft YaHei",
  "微软雅黑",
  "Arial",
  "Impact",
  "+mj-lt",
  "+mn-lt",
  "+mj-ea",
  "+mn-ea",
  "+mj-cs",
  "+mn-cs",
]);

const ALLOWED_COLORS = new Set([
  "000000",
  "1F1F1F",
  "333333",
  "595959",
  "8C8C8C",
  "BFBFBF",
  "D9D9D9",
  "E6E6E6",
  "F2F2F2",
  "F7F7F7",
  "FFFFFF",
  "C00000",
  "FFF1EF",
  "FCE4E0",
]);

const STANDARD_LINE_WIDTH = 6350;
const ALLOWED_FONT_SIZES = new Set([10, 12, 14, 18, 24]);
const CONTENT_CARD_FILLS = new Set(["F2F2F2", "F7F7F7", "FFF1EF", "FCE4E0"]);
const CONTENT_LAYOUT_SCHEMA_RULES = Object.freeze({
  two_column: { reference: "05 内容 二分栏", moduleCount: 2 },
  biased_column: { reference: "06 内容 偏分栏", minModuleCount: 2, maxModuleCount: 4 },
  three_column: { reference: "07 内容 三分栏", moduleCount: 3 },
  four_column: { reference: "08 内容 四分栏", moduleCount: 4 },
});
const LANGUAGE_ALLOWLIST = new Set([
  "ai",
  "api",
  "arxiv",
  "cpu",
  "cuda",
  "deepseek",
  "fcfs",
  "gpu",
  "hbm",
  "kv",
  "llama",
  "llm",
  "nvlink",
  "p90",
  "p99",
  "pd",
  "semi",
  "sglang",
  "slo",
  "sm",
  "token",
  "tpot",
  "ttft",
  "vllm",
]);

function usage() {
  console.error("Usage: node scripts/qa/check_huawei_pptx.js <deck.pptx> [--out .tmp/report.json] [--require-plan .tmp/deck_plan.json] [--require-ppt-content-brief path/to/ppt_content_brief.md] [--require-visual-anchor-manifest .tmp/deck_visual_anchor_manifest.json]");
}

function parseArgs(argv) {
  const args = { input: argv[2], out: null, requireRenderDir: null, requireVisualAnchorManifest: null, requirePlan: null, requirePptContentBrief: null };
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      args.out = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--require-render-dir") {
      args.requireRenderDir = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--require-visual-anchor-manifest") {
      args.requireVisualAnchorManifest = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--require-plan") {
      args.requirePlan = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--require-ppt-content-brief") {
      args.requirePptContentBrief = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function ensureTmpOutput(fileName) {
  if (!fileName) return fileName;
  const normalized = String(fileName).replace(/\\/g, "/");
  if (!normalized.includes("/.tmp/") && !normalized.startsWith(".tmp/")) {
    throw new Error(`Generated QA reports must be saved under .tmp: ${fileName}`);
  }
  return fileName;
}

function issue(slide, type, severity, message, detail = {}) {
  return { slide, type, severity, message, ...detail };
}

function slideNumber(fileName) {
  const match = fileName.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : null;
}

function decodeXmlText(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function safeText(value) {
  return String(value ?? "").trim();
}

function emuToIn(value) {
  return Number(value || 0) / 914400;
}

function extractShapes(xml) {
  const shapes = [];
  for (const match of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const block = match[0];
    const off = block.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
    const ext = block.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
    const texts = [...block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlText(m[1]));
    const fontSizes = [...block.matchAll(/\bsz="(\d+)"/g)].map((m) => Number(m[1]) / 100).filter(Number.isFinite);
    const fonts = [...block.matchAll(/\btypeface="([^"]+)"/g)].map((m) => m[1]);
    const colors = [...block.matchAll(/<a:srgbClr\s+val="([^"]+)"/g)].map((m) => m[1].toUpperCase());
    const fill = (block.match(/<a:solidFill>\s*<a:srgbClr\s+val="([^"]+)"/) || [])[1];
    shapes.push({
      text: texts.join("").trim(),
      x: off ? emuToIn(off[1]) : null,
      y: off ? emuToIn(off[2]) : null,
      w: ext ? emuToIn(ext[1]) : null,
      h: ext ? emuToIn(ext[2]) : null,
      area: ext ? emuToIn(ext[1]) * emuToIn(ext[2]) : 0,
      fontSizes,
      fonts,
      colors,
      fill: fill ? fill.toUpperCase() : null,
    });
  }
  for (const match of xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)) {
    const block = match[0];
    const off = block.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
    const ext = block.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
    shapes.push({
      text: "",
      x: off ? emuToIn(off[1]) : null,
      y: off ? emuToIn(off[2]) : null,
      w: ext ? emuToIn(ext[1]) : null,
      h: ext ? emuToIn(ext[2]) : null,
      area: ext ? emuToIn(ext[1]) * emuToIn(ext[2]) : 0,
      fontSizes: [],
      fonts: [],
      colors: [],
      fill: null,
      kind: "picture",
    });
  }
  for (const match of xml.matchAll(/<p:graphicFrame\b[\s\S]*?<a:tbl\b[\s\S]*?<\/p:graphicFrame>/g)) {
    const block = match[0];
    const off = block.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
    const ext = block.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
    const tableX = off ? emuToIn(off[1]) : null;
    const tableY = off ? emuToIn(off[2]) : null;
    const tableW = ext ? emuToIn(ext[1]) : null;
    const tableH = ext ? emuToIn(ext[2]) : null;
    const colWidths = [...block.matchAll(/<a:gridCol\s+w="(\d+)"/g)].map((m) => emuToIn(m[1]));
    let rowY = tableY;
    for (const rowMatch of block.matchAll(/<a:tr\b([^>]*)>([\s\S]*?)<\/a:tr>/g)) {
      const rowAttrs = rowMatch[1] || "";
      const rowBlock = rowMatch[2] || "";
      const rowH = emuToIn((rowAttrs.match(/\bh="(\d+)"/) || [])[1]) || tableH;
      let cellX = tableX;
      let colIdx = 0;
      for (const cellMatch of rowBlock.matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)) {
        const cellBlock = cellMatch[0];
        const cellW = colWidths[colIdx] || (tableW && colWidths.length ? tableW / colWidths.length : tableW);
        const texts = [...cellBlock.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlText(m[1]));
        const fontSizes = [...cellBlock.matchAll(/\bsz="(\d+)"/g)].map((m) => Number(m[1]) / 100).filter(Number.isFinite);
        const fonts = [...cellBlock.matchAll(/\btypeface="([^"]+)"/g)].map((m) => m[1]);
        const colors = [...cellBlock.matchAll(/<a:srgbClr\s+val="([^"]+)"/g)].map((m) => m[1].toUpperCase());
        const fills = [...cellBlock.matchAll(/<a:solidFill>\s*<a:srgbClr\s+val="([^"]+)"/g)].map((m) => m[1]);
        const fill = fills[fills.length - 1];
        shapes.push({
          text: texts.join("").trim(),
          x: cellX,
          y: rowY,
          w: cellW,
          h: rowH,
          area: cellW && rowH ? cellW * rowH : 0,
          fontSizes,
          fonts,
          colors,
          fill: fill ? fill.toUpperCase() : null,
        });
        cellX = cellX === null || cellW === null ? null : cellX + cellW;
        colIdx += 1;
      }
      rowY = rowY === null || rowH === null ? null : rowY + rowH;
    }
  }
  return shapes;
}

function isInside(inner, outer) {
  if ([inner.x, inner.y, inner.w, inner.h, outer.x, outer.y, outer.w, outer.h].some((value) => value === null)) return false;
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

function isInsideWithTolerance(inner, outer, tolerance = 0.06) {
  if ([inner.x, inner.y, inner.w, inner.h, outer.x, outer.y, outer.w, outer.h].some((value) => value === null)) return false;
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.w <= outer.x + outer.w + tolerance
    && inner.y + inner.h <= outer.y + outer.h + tolerance;
}

function sameRect(a, b) {
  return [a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h].every((value) => value !== null)
    && Math.abs(a.x - b.x) < 0.01
    && Math.abs(a.y - b.y) < 0.01
    && Math.abs(a.w - b.w) < 0.01
    && Math.abs(a.h - b.h) < 0.01;
}

function isIntentionalLabelOnShape(a, b) {
  const textShape = a.text ? a : b.text ? b : null;
  const container = textShape === a ? b : a;
  return Boolean(textShape && !container.text && isInsideWithTolerance(textShape, container, 0.1));
}

function structuredObjectsInside(card, shapes) {
  return shapes.filter((shape) =>
    shape !== card
    && !sameRect(shape, card)
    && shape.area > 0.03
    && isInsideWithTolerance(shape, card, 0.04)
    && (shape.text || shape.fill || shape.kind === "picture" || (shape.w && shape.h))
  );
}

function hasPairedRedTitleBar(card, shapes) {
  return shapes.some((shape) =>
    shape.fill === "C00000" &&
    shape.x !== null &&
    shape.y !== null &&
    shape.w !== null &&
    shape.h !== null &&
    card.x !== null &&
    card.y !== null &&
    card.w !== null &&
    Math.abs(shape.x - card.x) < 0.08 &&
    Math.abs(shape.w - card.w) < 0.12 &&
    shape.y + shape.h <= card.y + 0.08 &&
    card.y - (shape.y + shape.h) <= 0.08
  );
}

function isBiasedColumnInterpretationCard(card, shapes, containedText) {
  if (!hasPairedRedTitleBar(card, shapes)) return false;
  if (card.x === null || card.w === null || card.h === null || card.area <= 0) return false;
  const textLen = safeText(containedText).replace(/\s/g, "").length;
  const sentenceCount = (safeText(containedText).match(/[。；;.!?？]/g) || []).length;
  return card.x >= 7.2
    && card.w >= 3.4
    && card.w <= 5.3
    && card.h <= 2.1
    && textLen >= 10
    && sentenceCount >= 2;
}

function uniqueMatches(xml, regex) {
  const values = new Set();
  for (const match of xml.matchAll(regex)) values.add(match[1]);
  return values;
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function englishWords(text) {
  return [...String(text || "").matchAll(/[A-Za-z][A-Za-z0-9+.-]*/g)]
    .map((match) => match[0])
    .filter((word) => {
      const normalized = word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
      if (!normalized) return false;
      if (LANGUAGE_ALLOWLIST.has(normalized)) return false;
      if (/^v?\d+(\.\d+)*$/.test(normalized)) return false;
      if (/^\d+[a-z]+$/.test(normalized)) return false;
      return true;
    });
}

function estimateTextUnits(text) {
  let units = 0;
  for (const char of String(text || "")) {
    if (/[\u3400-\u9fff]/.test(char)) units += 1.02;
    else if (/[A-Z]/.test(char)) units += 0.78;
    else if (/[a-z]/.test(char)) units += 0.60;
    else if (/[0-9]/.test(char)) units += 0.61;
      else if (/\s/.test(char)) units += 0.30;
    else units += 0.46;
  }
  return units;
}

function estimateQaTitleWrappedLines(text, fontSize, widthInches) {
  if (!text || !fontSize || !widthInches) return 0;
  const avgCjkCharWidth = fontSize / 72;
  return String(text)
    .split(/\r?\n/)
    .reduce((sum, line) => {
      const bulletIndentUnits = 0;
      const effectiveWidth = Math.max(fontSize / 72, widthInches - bulletIndentUnits * avgCjkCharWidth);
      const asciiCount = (line.match(/[A-Za-z0-9]/g) || []).length;
      const cjkCount = (line.match(/[\u3400-\u9fff]/g) || []).length;
      const asciiShare = asciiCount / Math.max(1, asciiCount + cjkCount);
      let fontScale = 1;
      if (fontSize >= 18 && asciiShare >= 0.25 && effectiveWidth >= 5.0) fontScale = 1.18;
      else if (fontSize >= 12 && asciiShare >= 0.20 && effectiveWidth >= 5.0) fontScale = 1.08;
      else if (fontSize >= 14 && asciiShare >= 0.25 && effectiveWidth >= 3.0) fontScale = 1.14;
      const effectiveUnits = Math.max(1, (effectiveWidth / avgCjkCharWidth) * fontScale);
      return sum + Math.max(1, Math.ceil(estimateTextUnits(line) / effectiveUnits));
    }, 0);
}

function availableTextLines(shape, fontSize, lineSpacingMultiple = 1.5) {
  if (!shape.h || !fontSize) return 0;
  const lineHeight = (fontSize / 72) * lineSpacingMultiple;
  return Math.max(shape.h / lineHeight, 0);
}

function isTextOverflowEstimateCandidate(shape, pageTitle, slide) {
  if (shape === pageTitle) return true;
  const text = safeText(shape.text);
  if (!text) return false;
  const maxSize = Math.max(...shape.fontSizes, 0) || 12;
  if (slide === 1 && maxSize >= 18) return false;
  const compactHeight = shape.h !== null && shape.h <= 0.66;
  const normalized = text.replace(/\s/g, "");
  if (compactHeight && /^来源[:：]/.test(text)) return false;
  if (compactHeight && /^(?:\d{1,2}|步|[>→+\-–—]|线索[一二三四五六七八九十])$/.test(normalized)) return false;
  if (compactHeight && normalized.length <= 8) return false;
  return normalized.length >= 18 || /[\r\n。；;！？?]/.test(text);
}

function titleShape(shapes) {
  return shapes
    .filter((shape) => shape.text && shape.y !== null && shape.y < 0.82 && shape.x !== null && shape.x < 1.2)
    .sort((a, b) => a.y - b.y || a.x - b.x)[0];
}

function isTocSlide(shapes) {
  const title = titleShape(shapes);
  return Boolean(title && /目录|CONTENTS/i.test(title.text));
}

function isSectionSlide(shapes) {
  const sectionBadge = shapes.some((shape) =>
    shape.fill === "C00000" &&
    shape.x !== null &&
    shape.y !== null &&
    shape.w !== null &&
    shape.h !== null &&
    shape.x >= 0.45 &&
    shape.x <= 0.75 &&
    shape.y >= 1.25 &&
    shape.y <= 1.5 &&
    shape.w >= 0.9 &&
    shape.w <= 1.2 &&
    shape.h >= 0.4 &&
    shape.h <= 0.65
  );
  const sectionNumber = shapes.some((shape) =>
    /^\d{1,2}$/.test(shape.text) &&
    shape.x !== null &&
    shape.y !== null &&
    shape.x >= 0.45 &&
    shape.x <= 0.8 &&
    shape.y >= 1.3 &&
    shape.y <= 1.65
  );
  const sectionSubtitle = shapes.some((shape) =>
    shape.text &&
    shape.x !== null &&
    shape.y !== null &&
    shape.x >= 1.6 &&
    shape.x <= 2.1 &&
    shape.y >= 1.2 &&
    shape.y <= 1.7
  );
  return sectionBadge && (sectionNumber || sectionSubtitle);
}

function isContentSlide(slide, shapes) {
  if (!slide || slide <= 1) return false;
  if (isTocSlide(shapes)) return false;
  if (isSectionSlide(shapes)) return false;
  return Boolean(titleShape(shapes));
}

function hasAnalysisSummary(shapes) {
  const hasLabel = shapes.some((shape) =>
    /分析总结/.test(shape.text) &&
    shape.x !== null &&
    shape.y !== null &&
    shape.x >= 0.5 &&
    shape.x <= 2.0 &&
    shape.y >= 0.9 &&
    shape.y <= 1.8
  );
  const hasSemanticSummary = shapes.some((shape) =>
    /[\u3400-\u9fff]{2,10}[：:]\s*\S+/.test(shape.text) &&
    shape.y !== null &&
    shape.y >= 0.9 &&
    shape.y <= 1.9
  );
  return hasLabel && hasSemanticSummary;
}

function hasGenericConclusionLabels(shapes) {
  return shapes.some((shape) =>
    /结论\s*\d+\s*[：:]/.test(shape.text) &&
    shape.y !== null &&
    shape.y >= 0.9 &&
    shape.y <= 1.9
  );
}

function hasSectionIndicator(shapes) {
  const topRightTabs = shapes.filter((shape) =>
    shape.text &&
    shape.x !== null &&
    shape.y !== null &&
    shape.x >= 7.5 &&
    shape.y >= 0.0 &&
    shape.y <= 0.55
  );
  const activeTab = shapes.some((shape) =>
    shape.fill === "C00000" &&
    shape.x !== null &&
    shape.y !== null &&
    shape.w !== null &&
    shape.h !== null &&
    shape.x >= 7.5 &&
    shape.y >= 0.0 &&
    shape.y <= 0.55 &&
    shape.w >= 0.3 &&
    shape.h >= 0.16
  );
  return activeTab && topRightTabs.length >= 2;
}

function sectionIndicatorInfo(shapes) {
  const tabLabels = shapes
    .filter((shape) =>
      shape.text &&
      shape.x !== null &&
      shape.y !== null &&
      shape.w !== null &&
      shape.x >= 7.5 &&
      shape.y >= 0.0 &&
      shape.y <= 0.55
    )
    .sort((a, b) => a.x - b.x);
  const activeTab = shapes
    .filter((shape) =>
      shape.fill === "C00000" &&
      shape.x !== null &&
      shape.y !== null &&
      shape.w !== null &&
      shape.h !== null &&
      shape.x >= 7.5 &&
      shape.y >= 0.0 &&
      shape.y <= 0.55 &&
      shape.w >= 0.3 &&
      shape.h >= 0.16
    )
    .sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!tabLabels.length || !activeTab) return null;
  const activeCenter = activeTab.x + activeTab.w / 2;
  const activeIndex = tabLabels.findIndex((shape) => activeCenter >= shape.x && activeCenter <= shape.x + shape.w);
  return {
    activeIndex: activeIndex >= 0 ? activeIndex : tabLabels.filter((shape) => shape.x + shape.w / 2 < activeCenter).length,
    labels: tabLabels.map((shape) => shape.text),
    left: Math.min(...tabLabels.map((shape) => shape.x)),
    right: Math.max(...tabLabels.map((shape) => shape.x + shape.w)),
  };
}

function checkSectionOrder(slideEntries) {
  const issues = [];
  let last = null;
  for (const entry of slideEntries) {
    const slide = slideNumber(entry.name);
    const shapes = extractShapes(entry.xml);
    if (!isContentSlide(slide, shapes)) continue;
    const info = sectionIndicatorInfo(shapes);
    if (!info) continue;
    if (last && info.activeIndex < last.activeIndex) {
      issues.push(issue(slide, "section_order_regression", "error", "Content slides must follow the contents-page section order; the active chapter indicator moved backward.", {
        previous_slide: last.slide,
        previous_section: last.labels[last.activeIndex] || "",
        current_section: info.labels[info.activeIndex] || "",
      }));
    }
    last = { slide, ...info };
  }
  return issues;
}

function shapeBounds(shape) {
  if ([shape.x, shape.y, shape.w, shape.h].some((value) => value === null)) return null;
  return { left: shape.x, top: shape.y, right: shape.x + shape.w, bottom: shape.y + shape.h };
}

function overlaps(a, b, tolerance = 0.01) {
  const aa = shapeBounds(a);
  const bb = shapeBounds(b);
  if (!aa || !bb) return false;
  return aa.left < bb.right - tolerance && aa.right > bb.left + tolerance && aa.top < bb.bottom - tolerance && aa.bottom > bb.top + tolerance;
}

async function loadZip(fileName) {
  const buffer = fs.readFileSync(fileName);
  return JSZip.loadAsync(buffer);
}

async function readXmlFiles(zip, prefix) {
  const result = [];
  const files = Object.values(zip.files)
    .filter((file) => !file.dir && file.name.startsWith(prefix) && file.name.endsWith(".xml"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const file of files) {
    result.push({ name: file.name, xml: await file.async("string") });
  }
  return result;
}

function checkSlideXml(name, xml) {
  const slide = slideNumber(name);
  const issues = [];
  const shapes = extractShapes(xml);

  if (/<p:timing\b|<p:anim\b|<p:animEffect\b|<p:par\b|<p:seq\b/.test(xml)) {
    issues.push(issue(slide, "animation", "error", "Slide contains animation timing XML."));
  }
  if (/<p:transition\b/.test(xml)) {
    issues.push(issue(slide, "transition", "error", "Slide contains transition XML; transitions are not allowed."));
  }

  const fontSizes = new Set();
  for (const match of xml.matchAll(/\bsz="(\d+)"/g)) {
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) continue;
    const points = raw / 100;
    fontSizes.add(points);
  }
  const unexpectedFontSizes = [...fontSizes].filter((points) => !ALLOWED_FONT_SIZES.has(points));
  if (unexpectedFontSizes.length) {
    issues.push(issue(slide, "font_size_unexpected", "error", `Slide uses font sizes outside the Huawei size set 10/12/14/18/24pt.`, { values: unexpectedFontSizes.sort((a, b) => a - b), allowed: [...ALLOWED_FONT_SIZES].sort((a, b) => a - b) }));
  }
  if (fontSizes.size > 5) {
    issues.push(issue(slide, "font_size_variety", "warning", `Slide uses ${fontSizes.size} font sizes; keep typography to the approved size set.`, { values: [...fontSizes].sort((a, b) => a - b) }));
  }

  for (const font of uniqueMatches(xml, /\btypeface="([^"]+)"/g)) {
    if (!ALLOWED_FONTS.has(font)) {
      issues.push(issue(slide, "font_face", "warning", `Unexpected font face: ${font}.`, { value: font }));
    }
  }

  for (const color of uniqueMatches(xml, /<a:srgbClr\s+val="([^"]+)"/g)) {
    const normalized = color.toUpperCase();
    if (/^[0-9A-F]{8}$/.test(normalized)) {
      issues.push(issue(slide, "color_argb", "error", `8-digit hex color is not allowed: ${normalized}.`, { value: normalized }));
    } else if (!ALLOWED_COLORS.has(normalized)) {
      issues.push(issue(slide, "color_palette", "warning", `Color is outside the Huawei red/black/white/gray palette: ${normalized}.`, { value: normalized }));
    }
  }

  for (const match of xml.matchAll(/<a:ln\b([^>]*)>/g)) {
    const attrs = match[1] || "";
    const widthMatch = attrs.match(/\bw="(\d+)"/);
    if (widthMatch) {
      const width = Number(widthMatch[1]);
      if (width !== STANDARD_LINE_WIDTH) {
        issues.push(issue(slide, "line_width", "warning", `Line width ${width} EMU differs from 0.5pt (${STANDARD_LINE_WIDTH} EMU).`, { value: width }));
      }
    }
  }

  if (/[\u2022\u25CF\u25CB\u25A0\u25AA]/.test(xml)) {
    issues.push(issue(slide, "unicode_bullet", "error", "Slide contains Unicode bullet glyphs; use ASCII hyphens or structured numbering."));
  }

  if (/\b(TBD|TODO|Lorem ipsum|待补充)\b/i.test(xml) || /XX/.test(xml)) {
    issues.push(issue(slide, "placeholder", "warning", "Slide may contain placeholder text such as TBD, TODO, XX, or lorem ipsum."));
  }

  if (slide && slide > 1 && !/<a:lnSpc>\s*<a:spcPct\s+val="150000"\s*\/>\s*<\/a:lnSpc>/.test(xml)) {
    issues.push(issue(slide, "line_spacing", "warning", "Slide does not appear to use 1.5x line spacing in its text boxes."));
  }

  if (slide && slide > 1) {
    const title = titleShape(shapes);
    if (!title) {
      issues.push(issue(slide, "page_title_missing", "error", "Content slide is missing a top-left page title."));
    } else {
      const maxSize = Math.max(...title.fontSizes, 0);
      const titleFonts = new Set(title.fonts);
      const titleColors = new Set(title.colors);
      if (maxSize && Math.abs(maxSize - 24) > 0.5) {
        issues.push(issue(slide, "page_title_size", "error", `Page title should be 24pt, found ${maxSize}pt.`, { value: maxSize, text: title.text }));
      }
      if (titleFonts.size && ![...titleFonts].some((font) => ALLOWED_FONTS.has(font))) {
        issues.push(issue(slide, "page_title_font", "error", `Page title font is not Microsoft YaHei/Arial: ${[...titleFonts].join(", ")}.`, { text: title.text }));
      }
      if (titleColors.size && !titleColors.has("C00000")) {
        issues.push(issue(slide, "page_title_color", "error", `Page title should be Huawei red (C00000), found ${[...titleColors].join(", ")}.`, { text: title.text }));
      }
      const titleLines = estimatePageTitleLines(title.text, title.w || 12.2, maxSize || 24);
      if (titleLines > 1) {
        issues.push(issue(slide, "page_title_wrap", "error", "Page title is estimated to wrap beyond one line; shorten the Chinese viewpoint title.", { estimated_lines: titleLines, text: title.text }));
      }
      if (title.h && availableTextLines(title, maxSize || 24, 1.15) < titleLines) {
        issues.push(issue(slide, "page_title_overflow_estimate", "error", "Page title text is estimated to exceed its text box height.", { estimated_lines: titleLines, available_lines: Math.round(availableTextLines(title, maxSize || 24, 1.15) * 10) / 10, text: title.text }));
      }
    }
  }

  if (isSectionSlide(shapes)) {
    issues.push(issue(slide, "section_divider_slide_present", "error", "Standalone chapter divider slides are not allowed; use the top-right section indicator on content slides instead."));
    return issues;
  }

  if (isContentSlide(slide, shapes) && !hasAnalysisSummary(shapes)) {
    issues.push(issue(slide, "analysis_summary_missing", "error", "Content slide is missing the required top analysis summary block with an 分析总结 label and semantic summary labels."));
  }

  if (isContentSlide(slide, shapes) && hasGenericConclusionLabels(shapes)) {
    issues.push(issue(slide, "analysis_summary_generic_label", "error", "Analysis summary uses generic labels such as 结论1; replace them with meaning-specific labels that summarize the content below."));
  }

  if (isContentSlide(slide, shapes) && !hasSectionIndicator(shapes)) {
    issues.push(issue(slide, "section_indicator_missing", "error", "Content slide is missing the required top-right chapter/outline indicator with the current section highlighted in Huawei red."));
  }
  const sectionInfo = sectionIndicatorInfo(shapes);
  if (isContentSlide(slide, shapes) && sectionInfo && Math.abs(sectionInfo.right - 12.78) > 0.12) {
    issues.push(issue(slide, "section_indicator_alignment", "error", "Top-right chapter indicator must be right-aligned to the title/content edge.", {
      right_edge: Math.round(sectionInfo.right * 100) / 100,
      expected_right_edge: 12.78,
    }));
  }

  const pageTitle = slide && slide > 1 ? titleShape(shapes) : null;
  for (const shape of shapes.filter((item) => item.text)) {
    const words = englishWords(shape.text);
    if (words.length >= 3 && !hasCjk(shape.text)) {
      issues.push(issue(slide, "language_non_chinese", "error", "Generated visible text appears to be English; all generated slide text must be Chinese except necessary acronyms, model names, and source identifiers.", {
        text: shape.text.slice(0, 180),
        sample_words: words.slice(0, 8),
      }));
    } else if (words.length >= 6) {
      issues.push(issue(slide, "language_excess_english", "warning", "Text contains many non-whitelisted English words; verify it has been translated to Chinese.", {
        text: shape.text.slice(0, 180),
        sample_words: words.slice(0, 8),
      }));
    }

    const maxSize = Math.max(...shape.fontSizes, 0) || 12;
    if (maxSize >= 10 && shape.w && shape.h && isTextOverflowEstimateCandidate(shape, pageTitle, slide)) {
      const isTitle = shape === pageTitle;
      const estimatedLines = isTitle
        ? estimatePageTitleLines(shape.text, Math.max(shape.w - 0.08, 0.1), maxSize)
        : estimateGeneratedWrappedLines(shape.text, maxSize, Math.max(shape.w - Math.max(0.06 * 2, 0.16), 0.1));
      const availableLines = isTitle
        ? availableTextLines(shape, maxSize, maxSize >= 18 ? 1.15 : 1.5)
        : Math.max(0, shape.h / Math.max(estimateGeneratedTextBoxHeight(shape.text, { w: shape.w, fontSize: maxSize, margin: 0.06 }) / Math.max(estimatedLines, 1), 0.01));
      const lineTolerance = isTitle ? 0.35 : 0.5;
      if (estimatedLines > availableLines + lineTolerance) {
        issues.push(issue(slide, "text_overflow_estimate", "error", "Text is estimated to exceed its text box capacity at the declared font size; shorten, split, or resize instead of relying on autofit.", {
          estimated_lines: estimatedLines,
          available_lines: Math.round(availableLines * 10) / 10,
          font_size: maxSize,
          text: shape.text.slice(0, 180),
        }));
      }
    }
  }

  const filledShapes = shapes.filter((shape) => shape.fill && shape.area > 0.08);
  for (let i = 0; i < filledShapes.length; i += 1) {
    for (let j = i + 1; j < filledShapes.length; j += 1) {
      const a = filledShapes[i];
      const b = filledShapes[j];
      if (!overlaps(a, b, 0.02)) continue;
      if (isInside(a, b) || isInside(b, a)) continue;
      if (isIntentionalLabelOnShape(a, b)) continue;
      if (!a.text && !b.text) continue;
      if ((a.text && !b.text) || (b.text && !a.text)) continue;
      issues.push(issue(slide, "filled_shape_overlap_estimate", "warning", "Filled layout elements appear to overlap in PPTX geometry; verify this is intentional and not a card/header collision.", {
        first_text: a.text.slice(0, 80),
        second_text: b.text.slice(0, 80),
      }));
    }
  }

  const largeCards = shapes.filter((shape) => !shape.text && CONTENT_CARD_FILLS.has(shape.fill) && shape.area >= 2.8 && (shape.y === null || shape.y >= 1.95));
  for (const card of largeCards) {
    const containedText = shapes
      .filter((shape) => shape.text && isInside(shape, card))
      .map((shape) => shape.text)
      .join("");
    const textLen = containedText.replace(/\s/g, "").length;
    const structuredCount = structuredObjectsInside(card, shapes).length;
    const density = textLen / Math.max(card.area, 0.1);
    if (structuredCount >= 2) continue;
    if (isBiasedColumnInterpretationCard(card, shapes, containedText)) continue;
    if (textLen < 55 || density < 12) {
      const severity = structuredCount === 0 || textLen < 25 || density < 2 ? "error" : "warning";
      issues.push(issue(slide, "sparse_large_card", severity, "Large content card is too sparse for its size; add source-grounded explanation/interpretation, move content from adjacent sparse modules, or shrink the card instead of leaving empty space.", {
        area: Math.round(card.area * 100) / 100,
        text_length: textLen,
        density: Math.round(density * 10) / 10,
        structured_objects: structuredCount,
      }));
    }
  }

  return issues;
}

function checkRenderEvidence(renderDir, expectedSlides) {
  const issues = [];
  if (!renderDir) return issues;
  if (!fs.existsSync(renderDir)) {
    return [issue(null, "render_evidence_missing", "error", `Required render directory not found: ${renderDir}`)];
  }
  const pngs = fs.readdirSync(renderDir).filter((name) => /^slide_\d+\.png$/i.test(name));
  if (pngs.length !== expectedSlides) {
    issues.push(issue(null, "render_evidence_incomplete", "error", `Expected ${expectedSlides} rendered slide PNGs, found ${pngs.length}.`));
  }
  if (!fs.existsSync(path.join(renderDir, "render_manifest.json"))) {
    issues.push(issue(null, "render_manifest_missing", "error", "Rendered slide directory is missing render_manifest.json."));
  }
  return issues;
}

function contentSlideNumbers(slideEntries) {
  return slideEntries
    .map((entry) => {
      const slide = slideNumber(entry.name);
      const shapes = extractShapes(entry.xml);
      return isContentSlide(slide, shapes) ? slide : null;
    })
    .filter((slide) => slide !== null);
}

function checkVisualAnchorManifest(fileName, slideEntries, planFileName = null) {
  const contentSlides = contentSlideNumbers(slideEntries);
  if (!fileName) return [];
  if (!fs.existsSync(fileName)) {
    return [issue(null, "content_visual_anchor_manifest_missing", "error", `Required visual-anchor manifest not found: ${fileName}`)];
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(fileName, "utf8"));
  } catch (error) {
    return [issue(null, "content_visual_anchor_manifest_invalid", "error", `Could not parse visual-anchor manifest JSON: ${error.message}`)];
  }

  const entries = Array.isArray(manifest.slides) ? manifest.slides : null;
  if (!entries) {
    return [issue(null, "content_visual_anchor_manifest_invalid", "error", "Visual-anchor manifest must contain a slides array.")];
  }

  const issues = [];
  issues.push(...checkVisualAnchorPlanAlignment(planFileName, entries, contentSlides, manifest));
  const byPage = new Map();
  for (const entry of entries) {
    const page = Number(entry.page);
    if (!Number.isFinite(page)) {
      issues.push(issue(null, "content_visual_anchor_manifest_invalid", "error", "Visual-anchor manifest entry is missing a numeric page.", { entry }));
      continue;
    }
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(entry);
  }

  for (const slide of contentSlides) {
    const slideXml = slideEntries.find((item) => slideNumber(item.name) === slide)?.xml || "";
    const visibleText = extractShapes(slideXml).map((shape) => shape.text).filter(Boolean).join("\n");
    const pageEntries = byPage.get(slide) || [];
    if (pageEntries.length < 1) {
      issues.push(issue(slide, "content_visual_anchor_missing", "error", "Content slide must have at least one manifest-backed visual anchor.", {
        manifest_entries: pageEntries.length,
      }));
      continue;
    }

    issues.push(...checkContentLayoutSchema(slide, pageEntries));
    for (const entry of pageEntries) {
    if (entry.rendered !== true) {
      issues.push(issue(slide, "content_visual_anchor_unrendered", "error", "Content slide visual anchor exists in the manifest but is not marked rendered."));
    }
    if (!entry.visual_anchor || typeof entry.visual_anchor !== "object") {
      issues.push(issue(slide, "content_visual_anchor_manifest_invalid", "error", "Visual-anchor manifest entry must include the validated visual_anchor spec."));
      continue;
    }
    try {
      validateVisualAnchorSpec(entry.visual_anchor);
    } catch (error) {
      issues.push(issue(slide, "content_visual_anchor_template_invalid", "error", `Visual-anchor spec failed schema validation: ${error.message}`, {
        visual_anchor_id: entry.visual_anchor_id || entry.visual_anchor.id || "",
      }));
    }
    if (entry.kind !== entry.visual_anchor.kind || entry.template !== entry.visual_anchor.template) {
      issues.push(issue(slide, "content_visual_anchor_manifest_invalid", "error", "Visual-anchor manifest kind/template must match the stored spec.", {
        entry_kind: entry.kind,
        spec_kind: entry.visual_anchor.kind,
        entry_template: entry.template,
        spec_template: entry.visual_anchor.template,
      }));
    }
    issues.push(...checkVisualAnchorSemantics(slide, entry, visibleText));
    issues.push(...checkVisualAnchorLayout(slide, entry));
    issues.push(...checkVisualAnchorManifestContract(slide, entry, manifest));
    issues.push(...checkVisualAnchorTableCapacity(slide, entry));
    issues.push(...checkVisualAnchorImagePresenceAndScale(slide, entry));
    if (entry.renderer === "rough_svg") {
      const dimValid = Number.isFinite(Number(entry.image_width)) && Number(entry.image_width) > 0
        && Number.isFinite(Number(entry.image_height)) && Number(entry.image_height) > 0;
      const areaValid = isRectLike(entry.anchor_area) && isRectLike(entry.image_area);
      if (!dimValid || !areaValid) {
        issues.push(issue(slide, "content_visual_anchor_image_missing", "error", "Image-based visual anchors must record positive image dimensions and actual image placement.", {
          image_width: entry.image_width,
          image_height: entry.image_height,
          image_area: entry.image_area,
          anchor_area: entry.anchor_area,
        }));
      } else if (!isContained(entry.image_area, entry.anchor_area) || !hasMatchingAspectRatio(entry.image_area, entry.image_width, entry.image_height)) {
        issues.push(issue(slide, "content_visual_anchor_image_invalid", "error", "Image-based visual anchor output must stay inside the anchor area and preserve aspect ratio.", {
          image_width: entry.image_width,
          image_height: entry.image_height,
          image_area: entry.image_area,
          anchor_area: entry.anchor_area,
        }));
      }
    }
  }
  }

  return issues;
}

function checkVisualAnchorImagePresenceAndScale(slide, entry) {
  const spec = entry.visual_anchor || {};
  const isEvidenceImage = spec.kind === "Evidence" && /^source_(figure|table|screenshot|chart)$/.test(safeText(spec.template));
  const isImageRenderer = entry.renderer === "rough_svg" || entry.renderer === "evidence";
  if (!isImageRenderer) return [];

  const issues = [];
  const imageArea = entry.image_area;
  const visualArea = entry.visual_area || entry.anchor_area;
  if (entry.placeholder === true || entry.renderResult?.placeholder === true) {
    issues.push(issue(slide, "content_visual_anchor_image_missing", "error", "Evidence visual anchor rendered a placeholder instead of the source image; fix the source path or replace the evidence.", {
      visual_anchor_id: entry.visual_anchor_id || spec.id || "",
      source_path: spec.source?.path || "",
    }));
  }

  if (!isRectLike(imageArea) || !isRectLike(visualArea)) return issues;

  const coverage = imageCoverage(imageArea, visualArea);
  const minimumCoverage = isEvidenceImage ? 0.38 : 0.32;
  if (coverage < minimumCoverage) {
    issues.push(issue(slide, "content_visual_anchor_image_too_small", "error", "Visual anchor image occupies too little of its intended visual area; redesign the layout or choose a better-fitted source crop/region instead of accepting a tiny image.", {
      visual_anchor_id: entry.visual_anchor_id || spec.id || "",
      coverage: Math.round(coverage * 1000) / 1000,
      minimum_coverage: minimumCoverage,
      image_area: imageArea,
      visual_area: visualArea,
    }));
  }
  return issues;
}

function checkContentLayoutSchema(slide, entries) {
  const schemas = entries.map((entry) => entry.content_layout_schema).filter(Boolean);
  if (!schemas.length) return [];
  const issues = [];
  const schemaText = JSON.stringify(schemas);
  const first = schemas[0];
  const rule = CONTENT_LAYOUT_SCHEMA_RULES[first.type];
  if (!rule) {
    issues.push(issue(slide, "content_layout_schema_invalid", "error", "Content layout schema type is not supported.", {
      type: first.type || "",
    }));
    return issues;
  }
  if (schemas.some((schema) => JSON.stringify(schema) !== JSON.stringify(first))) {
    issues.push(issue(slide, "content_layout_schema_invalid", "error", "All visual-anchor entries for a slide must record the same content layout schema.", {
      schemas,
    }));
  }
  const actualModules = Number(first.modules_count);
  const minModules = rule.minModuleCount || rule.moduleCount;
  const maxModules = rule.maxModuleCount || rule.moduleCount;
  if (actualModules < minModules || actualModules > maxModules) {
    issues.push(issue(slide, "content_layout_schema_invalid", "error", "Content layout schema module count does not match the fixed reference layout.", {
      type: first.type,
      expected_modules: minModules === maxModules ? minModules : `${minModules}-${maxModules}`,
      actual_modules: first.modules_count,
    }));
  }
  if (!safeText(first.reference).includes(rule.reference)) {
    issues.push(issue(slide, "content_layout_schema_invalid", "error", "Content layout schema must cite the matching bundled reference image.", {
      type: first.type,
      expected_reference: rule.reference,
      actual_reference: first.reference || "",
    }));
  }
  if (Number(first.visual_anchor_modules_count) < 1) {
    issues.push(issue(slide, "content_layout_schema_anchor_missing", "error", "Content layout schema must include at least one visual-anchor block.", {
      type: first.type,
      visual_anchor_modules_count: first.visual_anchor_modules_count,
    }));
  }
  if (!/(05 内容 二分栏|06 内容 偏分栏|07 内容 三分栏|08 内容 四分栏)/.test(schemaText)) {
    issues.push(issue(slide, "content_layout_schema_invalid", "error", "Content layout schema must be grounded in one of the 05-08 content reference images."));
  }
  issues.push(...checkContentLayoutModuleAlignment(slide, first));
  issues.push(...checkContentLayoutBlockFrames(slide, first));
  return issues;
}

function estimatePageTitleLines(text, widthInches, titleFontSize = 24) {
  const value = safeText(text);
  if (!value.includes(" - ")) return estimateQaTitleWrappedLines(value, titleFontSize, widthInches);
  const [main, ...rest] = value.split(" - ");
  const subtitle = rest.join(" - ");
  const mainWidth = estimateTextUnits(main) * (titleFontSize / 72);
  const subtitleWidth = estimateTextUnits(` - ${subtitle}`) * (14 / 72);
  return Math.max(1, Math.ceil((mainWidth + subtitleWidth) / Math.max(widthInches, 0.1)));
}

function checkContentLayoutModuleAlignment(slide, schema = {}) {
  if (!["two_column", "three_column"].includes(schema.type)) return [];
  const modules = Array.isArray(schema.module_layouts) ? schema.module_layouts : [];
  if (modules.length < 2) return [];
  const occupied = modules
    .map((module, idx) => ({ idx, title: module.title || `module_${idx + 1}`, area: module.occupied_area }))
    .filter((module) => isRectLike(module.area));
  if (occupied.length < modules.length) return [];

  const topTolerance = 0.08;
  const bottomTolerance = 0.16;
  const tops = occupied.map((module) => module.area.y);
  const bottoms = occupied.map((module) => module.area.y + module.area.h);
  const topDelta = Math.max(...tops) - Math.min(...tops);
  const bottomDelta = Math.max(...bottoms) - Math.min(...bottoms);
  const issues = [];
  if (topDelta > topTolerance || bottomDelta > bottomTolerance) {
    issues.push(issue(slide, "content_layout_module_alignment", "error", "Column module contents are not vertically aligned; make two/three-column modules start and end at consistent heights by adding grounded content, adjusting visual block height/scale, or choosing a denser layout.", {
      layout_type: schema.type,
      top_delta: Math.round(topDelta * 1000) / 1000,
      bottom_delta: Math.round(bottomDelta * 1000) / 1000,
      top_tolerance: topTolerance,
      bottom_tolerance: bottomTolerance,
      modules: occupied.map((module) => ({
        index: module.idx + 1,
        title: module.title,
        top: Math.round(module.area.y * 1000) / 1000,
        bottom: Math.round((module.area.y + module.area.h) * 1000) / 1000,
        height: Math.round(module.area.h * 1000) / 1000,
      })),
    }));
  }
  return issues;
}

function checkContentLayoutBlockFrames(slide, schema = {}) {
  if (!["two_column", "three_column"].includes(schema.type)) return [];
  const modules = Array.isArray(schema.module_layouts) ? schema.module_layouts : [];
  const issues = [];
  for (const [idx, module] of modules.entries()) {
    const title = module.title || `module_${idx + 1}`;
    const contentArea = module.content_area;
    const occupied = module.occupied_area;
    if (isRectLike(contentArea) && isRectLike(occupied)) {
      const topGap = Number(occupied.y) - Number(contentArea.y);
      const bottomGap = (Number(contentArea.y) + Number(contentArea.h)) - (Number(occupied.y) + Number(occupied.h));
      if (topGap > 0.08 || bottomGap > 0.42) {
        issues.push(issue(slide, "content_layout_module_inner_alignment", "error", "Column module content does not fill the module from top toward the bottom; add grounded bullets, enlarge a visual anchor, or choose a denser split instead of leaving a floating block.", {
          layout_type: schema.type,
          module_index: idx + 1,
          module_title: title,
          top_gap: Math.round(topGap * 1000) / 1000,
          bottom_gap: Math.round(bottomGap * 1000) / 1000,
          max_top_gap: 0.08,
          max_bottom_gap: 0.42,
        }));
      }
    }

    const gaps = Array.isArray(module.block_gaps) ? module.block_gaps.map(Number).filter(Number.isFinite) : [];
    const largeGap = gaps.find((gap) => gap > 0.28);
    if (largeGap !== undefined) {
      issues.push(issue(slide, "content_layout_block_gap", "error", "Blocks inside a column module are too far apart; keep image/text evidence compact or move to a different layout.", {
        layout_type: schema.type,
        module_index: idx + 1,
        module_title: title,
        max_gap: 0.28,
        gaps,
      }));
    }

    const blocks = Array.isArray(module.block_areas) ? module.block_areas : [];
    const textBlocks = blocks.filter((block) => block.type === "text");
    const totalTextLines = textBlocks.reduce((sum, block) => sum + Number(block.line_count || 0), 0);
    const totalTextLength = textBlocks.reduce((sum, block) => sum + Number(block.text_length || 0), 0);
    const maxModuleTextLines = schema.type === "three_column" ? 4 : 6;
    const maxModuleTextLength = schema.type === "three_column" ? 150 : 210;
    if (totalTextLines > maxModuleTextLines || totalTextLength > maxModuleTextLength) {
      issues.push(issue(slide, "content_layout_module_text_wall", "error", "Column module accumulates too much visible prose; replace excess lines with a source-grounded Matrix/table, KPI/readout cards, or a compact conclusion note.", {
        layout_type: schema.type,
        module_index: idx + 1,
        module_title: title,
        text_blocks: textBlocks.length,
        total_text_lines: totalTextLines,
        max_total_text_lines: maxModuleTextLines,
        total_text_length: totalTextLength,
        max_total_text_length: maxModuleTextLength,
      }));
    }
    for (const [blockIdx, block] of blocks.entries()) {
      const area = block.area;
      if (!isRectLike(area)) continue;
      if (block.type === "text" && Number.isFinite(Number(block.estimated_height))) {
        const estimated = Number(block.estimated_height);
        const excess = Number(area.h) - estimated;
        const shortage = estimated - Number(area.h);
        const textLength = Number(block.text_length || 0);
        const lineCount = Number(block.line_count || 0);
        const maxLineLength = Number(block.max_line_length || 0);
        if (textLength > 170 || maxLineLength > 56 || lineCount > 6) {
          issues.push(issue(slide, "content_layout_text_too_long", "error", "Text block is too prose-heavy for Huawei dense layout; compress into short claim lines, red-highlighted keywords, KPI/readout cards, or Matrix/table fragments.", {
            layout_type: schema.type,
            module_index: idx + 1,
            module_title: title,
            block_index: blockIdx + 1,
            text_length: textLength,
            max_text_length: 170,
            line_count: lineCount,
            max_line_count: 6,
            max_line_length: maxLineLength,
            max_allowed_line_length: 56,
          }));
        }
        if (textLength >= 80 && Number(block.emphasis_count || 0) < 1) {
          issues.push(issue(slide, "content_layout_text_missing_emphasis", "warning", "Dense text blocks should mark 1-3 decisive terms with red bold emphasis so the reader can scan the claim.", {
            layout_type: schema.type,
            module_index: idx + 1,
            module_title: title,
            block_index: blockIdx + 1,
            text_length: textLength,
            emphasis_count: Number(block.emphasis_count || 0),
          }));
        }
        if ((excess > 0.26 && excess / Math.max(estimated, 0.1) > 0.22) || shortage > 0.12) {
          issues.push(issue(slide, "content_layout_text_frame_mismatch", "error", "Text block frame height does not match the renderer's text-height estimate; fix the sizing rule or adjust content before relying on visual QA.", {
            layout_type: schema.type,
            module_index: idx + 1,
            module_title: title,
            block_index: blockIdx + 1,
            frame_height: Math.round(Number(area.h) * 1000) / 1000,
            estimated_height: Math.round(estimated * 1000) / 1000,
            excess: Math.round(excess * 1000) / 1000,
            shortage: Math.round(shortage * 1000) / 1000,
          }));
        }
      }
      if (isRectLike(block.visible_area) && block.type !== "text") {
        const verticalSlack = Number(area.h) - Number(block.visible_area.h);
        const sourceWidth = Number(block.source_width || 0);
        const sourceHeight = Number(block.source_height || 0);
        const sourceRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 0;
        if (schema.type === "three_column" && sourceRatio > 0 && sourceRatio < 3 && Number(block.visible_area.h) < 1.1) {
          issues.push(issue(slide, "content_layout_evidence_too_small", "error", "Evidence figure is too small for a three-column Huawei summary; enlarge the source figure or move supporting text into a table/readout.", {
            layout_type: schema.type,
            module_index: idx + 1,
            module_title: title,
            block_index: blockIdx + 1,
            visible_height: Math.round(Number(block.visible_area.h) * 1000) / 1000,
            min_visible_height: 1.1,
            source_ratio: Math.round(sourceRatio * 1000) / 1000,
          }));
        }
        if (verticalSlack > 0.32 && Number(area.h) / Math.max(Number(block.visible_area.h), 0.1) > 1.18) {
          issues.push(issue(slide, "content_layout_visual_frame_gap", "error", "Visual block frame is much taller than the visible rendered visual; size the visual block from source aspect ratio instead of hiding empty space inside the frame.", {
            layout_type: schema.type,
            module_index: idx + 1,
            module_title: title,
            block_index: blockIdx + 1,
            frame_height: Math.round(Number(area.h) * 1000) / 1000,
            visible_height: Math.round(Number(block.visible_area.h) * 1000) / 1000,
            vertical_slack: Math.round(verticalSlack * 1000) / 1000,
          }));
        }
      }
      if (Number.isFinite(Number(block.table_estimated_height))) {
        const estimated = Number(block.table_estimated_height);
        const shortage = estimated - Number(area.h);
        if (shortage > 0.65 || (Number(block.table_rows || 0) > 0 && Number(area.h) / Number(block.table_rows || 1) < 0.24)) {
          issues.push(issue(slide, "content_layout_table_frame_too_short", "error", "Matrix/table block frame is too short for its rows; enlarge the table block, reduce rows/cell text, or move detail to another structured block.", {
            layout_type: schema.type,
            module_index: idx + 1,
            module_title: title,
            block_index: blockIdx + 1,
            frame_height: Math.round(Number(area.h) * 1000) / 1000,
            estimated_height: Math.round(estimated * 1000) / 1000,
            shortage: Math.round(shortage * 1000) / 1000,
            table_rows: Number(block.table_rows || 0),
          }));
        }
      }
    }
  }
  return issues;
}

function checkVisualAnchorLayout(slide, entry) {
  const spec = entry.visual_anchor || {};
  const template = safeText(spec.template);
  const hasSideCards = Number(entry.supporting_cards_count || 0) > 0;
  const isEvidenceFigure = spec.kind === "Evidence" && /source_(figure|chart)/.test(template);
  const hasContentLayout = Boolean(entry.content_layout_schema);
  if (isEvidenceFigure && !hasSideCards && !hasContentLayout) {
    return [issue(slide, "content_visual_anchor_layout_unintegrated", "error", "Evidence source figures/charts must use one of the four fixed 图文并茂 layouts with adjacent interpretation, not a picture-only composition.", {
      visual_anchor_id: entry.visual_anchor_id || spec.id || "",
      template,
    })];
  }
  return [];
}

function checkVisualAnchorPlanAlignment(fileName, manifestEntries, contentSlides = [], manifest = {}) {
  if (!fileName) return [];
  if (!fs.existsSync(fileName)) {
    return [issue(null, "content_visual_anchor_plan_missing", "error", `Required deck plan not found: ${fileName}`)];
  }
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(fileName, "utf8"));
  } catch (error) {
    return [issue(null, "content_visual_anchor_plan_invalid", "error", `Could not parse deck plan JSON for visual-anchor alignment: ${error.message}`)];
  }

  const plannedSlides = Array.isArray(plan.slides) ? plan.slides : [];
  if (!Array.isArray(plan.slides)) {
    return [issue(null, "content_visual_anchor_plan_invalid", "error", "Deck plan must contain a slides array for visual-anchor alignment.")];
  }
  const issues = [];
  const manifestByPage = new Map();
  for (const entry of manifestEntries || []) {
    const page = Number(entry.page);
    if (!manifestByPage.has(page)) manifestByPage.set(page, []);
    manifestByPage.get(page).push(entry);
  }
  const planByPage = new Map(plannedSlides
    .filter((slide) => slide && Number.isFinite(Number(slide.page)))
    .map((slide) => [Number(slide.page), slide]));
  for (const page of contentSlides) {
    const plannedSlide = planByPage.get(page);
    if (!plannedSlide) {
      issues.push(issue(page, "content_visual_anchor_plan_missing", "error", "Content slide is missing from the deck plan.", { page }));
      continue;
    }
    const plannedAnchors = Array.isArray(plannedSlide.visual_anchors) && plannedSlide.visual_anchors.length
      ? plannedSlide.visual_anchors
      : (plannedSlide.visual_anchor ? [plannedSlide.visual_anchor] : []);
    if (!plannedAnchors.length) {
      issues.push(issue(page, "content_visual_anchor_plan_missing", "error", "Content slide plan must declare visual_anchors[].kind and visual_anchors[].template."));
      continue;
    }
    const actualEntries = manifestByPage.get(page) || [];
    if (actualEntries.length < plannedAnchors.length) {
      issues.push(issue(page, "content_visual_anchor_plan_missing", "error", "Rendered manifest has fewer visual anchors than the deck plan.", {
        planned_count: plannedAnchors.length,
        actual_count: actualEntries.length,
      }));
    }
    const actualById = new Map(actualEntries
      .filter((entry) => entry?.visual_anchor?.id)
      .map((entry) => [entry.visual_anchor.id, entry]));
    plannedAnchors.forEach((planned, idx) => {
      if (!planned.kind || !planned.template) {
        issues.push(issue(page, "content_visual_anchor_plan_missing", "error", "Each planned visual anchor must declare kind and template.", {
          planned_index: idx,
          planned_id: planned.id || "",
          planned_kind: planned.kind || "",
          planned_template: planned.template || "",
        }));
        return;
      }
      const actualEntry = planned.id && actualById.has(planned.id) ? actualById.get(planned.id) : actualEntries[idx];
      const actual = actualEntry?.visual_anchor || {};
      if (!actual.kind || !actual.template) {
        issues.push(issue(page, "content_visual_anchor_plan_missing", "error", "Planned visual anchor is missing from the rendered manifest.", {
          planned_index: idx,
          planned_id: planned.id || "",
          planned_kind: planned.kind,
          planned_template: planned.template,
        }));
        return;
      }
      if (planned.id && actual.id && planned.id !== actual.id) {
        issues.push(issue(page, "content_visual_anchor_plan_mismatch", "error", "Planned visual_anchor.id does not match the rendered manifest.", {
          planned_id: planned.id,
          actual_id: actual.id,
        }));
      }
      if (planned.kind !== actual.kind) {
        issues.push(issue(page, "content_visual_anchor_plan_mismatch", "error", "Planned visual_anchor.kind does not match the rendered manifest.", {
          planned_id: planned.id || "",
          planned_kind: planned.kind,
          actual_kind: actual.kind,
        }));
      }
      if (planned.template !== actual.template) {
        issues.push(issue(page, "content_visual_anchor_plan_mismatch", "error", "Planned visual_anchor.template does not match the rendered manifest.", {
          planned_id: planned.id || "",
          planned_template: planned.template,
          actual_template: actual.template,
        }));
      }
    });

    for (const entry of actualEntries) {
      const spec = entry.visual_anchor || {};
      const expectedEntryRenderer = resolveVisualAnchorRenderPath(spec);
      if (entry.renderer !== expectedEntryRenderer) {
        issues.push(issue(page, "content_visual_anchor_manifest_mismatch", "error", "Visual-anchor manifest output evidence does not match the fixed template contract.", {
          visual_anchor_id: entry.visual_anchor_id || spec.id || "",
          expected_output: expectedEntryRenderer,
          actual_output: entry.renderer || "",
        }));
      }
      if (expectedEntryRenderer === "rough_svg" && entry.image_format !== "svg") {
        issues.push(issue(page, "content_visual_anchor_manifest_mismatch", "error", "Image-based visual anchors must record their image format in the manifest.", {
          visual_anchor_id: entry.visual_anchor_id || spec.id || "",
          image_format: entry.image_format || "",
        }));
      }
    }
  }
  return issues;
}

function checkVisualAnchorManifestContract(slide, entry) {
  const issues = [];
  const spec = entry.visual_anchor || {};
  const expectedRenderer = resolveVisualAnchorRenderPath(spec);
  if (entry.renderer !== expectedRenderer) {
    issues.push(issue(slide, "content_visual_anchor_manifest_mismatch", "error", "Visual-anchor manifest output evidence does not match the fixed template contract.", {
      visual_anchor_id: entry.visual_anchor_id || spec.id || "",
      expected_output: expectedRenderer,
      actual_output: entry.renderer || "",
    }));
  }
  if (spec.kind === "Matrix" && spec.template === "table" && entry.renderer !== "ppt_native") {
    issues.push(issue(slide, "content_visual_anchor_table_contract_mismatch", "error", "Matrix/table visual anchors must remain editable table output.", {
      visual_anchor_id: entry.visual_anchor_id || spec.id || "",
      actual_output: entry.renderer || "",
    }));
  }
  return issues;
}

function checkVisualAnchorTableCapacity(slide, entry) {
  const spec = entry.visual_anchor || {};
  if (spec.kind !== "Matrix" || spec.template !== "table") return [];
  const layout = entry.content_layout_schema || {};
  if (layout.type !== "four_column") return [];
  const rows = Array.isArray(spec.visual_spec?.rows) ? spec.visual_spec.rows : [];
  const rowCount = rows.length;
  const visualArea = entry.visual_area || entry.anchor_area || {};
  const estimatedRowHeight = Number(visualArea.h) > 0 && rowCount > 0 ? Number(visualArea.h) / rowCount : null;
  if (rowCount <= 4 && (estimatedRowHeight === null || estimatedRowHeight >= 0.3)) return [];
  return [issue(slide, "content_visual_anchor_table_overflow", "error", "Matrix/table anchors in four-column modules are too dense; use at most four rows in small modules, split the content, enlarge the area, or switch to Quantity/data_cards.", {
    visual_anchor_id: entry.visual_anchor_id || spec.id || "",
    layout_type: layout.type,
    row_count: rowCount,
    estimated_row_height: estimatedRowHeight === null ? null : Math.round(estimatedRowHeight * 100) / 100,
  })];
}

function checkVisualAnchorSemantics(slide, entry, visibleText) {
  const issues = [];
  const spec = entry.visual_anchor || {};
  const visual = spec.visual_spec || {};
  const highlight = visual.highlight;
  if (highlight !== undefined && highlight !== null && JSON.stringify(highlight) !== "{}") {
    const reason = safeText(entry.highlight_reason || spec.highlight_reason || spec.why_highlight || "");
    if (reason.length < 12 || !hasCjk(reason)) {
      issues.push(issue(slide, "content_visual_anchor_highlight_unexplained", "error", "visual_spec.highlight requires a specific Chinese highlight_reason recorded outside visual_spec.", {
        visual_anchor_id: entry.visual_anchor_id || spec.id || "",
        highlight,
      }));
    }
    if (!textExplainsHighlight(visibleText, reason)) {
      issues.push(issue(slide, "content_visual_anchor_highlight_unexplained", "error", "The visible slide text should explain why the highlighted visual item matters.", {
        visual_anchor_id: entry.visual_anchor_id || spec.id || "",
        highlight_reason: reason,
      }));
    }
  }

  if ((spec.template === "capability_matrix" || spec.template === "heatmap") && hasSubjectiveDecimalGrid(visual)) {
    const scoreBasis = safeText(entry.score_basis || spec.score_basis || "");
    if (scoreBasis.length < 12 || !hasCjk(scoreBasis)) {
      issues.push(issue(slide, "content_visual_anchor_subjective_scores", "error", "Decimal matrix/heatmap values that look like subjective scores require score_basis or should be converted to qualitative labels.", {
        visual_anchor_id: entry.visual_anchor_id || spec.id || "",
        template: spec.template,
      }));
    }
  }
  return issues;
}

function readJsonFile(fileName, label) {
  try {
    return JSON.parse(fs.readFileSync(fileName, "utf8"));
  } catch (error) {
    const err = new Error(`Could not parse ${label} JSON: ${error.message}`);
    err.cause = error;
    throw err;
  }
}

function normalizeSummaryItems(summary) {
  const body = summary?.body || summary?.items || [];
  return Array.isArray(body)
    ? body.map((item) => ({ label: safeText(item?.label || item?.title), text: safeText(item?.text || item?.body || item?.value) }))
    : [];
}

function normalizeComparableText(value) {
  return safeText(value).replace(/\s+/g, "");
}

function textContainsComparable(haystack, needle) {
  const expected = normalizeComparableText(needle);
  if (!expected) return true;
  return normalizeComparableText(haystack).includes(expected);
}

function slideVisibleTextMap(slideEntries) {
  return new Map(slideEntries.map((entry) => {
    const slide = slideNumber(entry.name);
    const text = extractShapes(entry.xml)
      .map((shape) => safeText(shape.text))
      .filter(Boolean)
      .join("\n");
    return [slide, text];
  }));
}

function plannedContentLayoutType(slide) {
  return safeText(slide?.contentLayout?.type)
    || safeText(slide?.content_layout?.type)
    || safeText(slide?.layout_schema?.type);
}

function checkPptContentBriefPlanAlignment(briefFileName, planFileName) {
  const issues = [];
  if (!briefFileName) return issues;
  if (!fs.existsSync(briefFileName)) {
    return [issue(null, "ppt_content_brief_missing", "error", `Required PPT Content Brief not found: ${briefFileName}`)];
  }
  if (!planFileName || !fs.existsSync(planFileName)) {
    return [issue(null, "ppt_content_brief_plan_missing", "error", "PPT Content Brief QA requires --require-plan so the brief contract can be compared against the deck plan.")];
  }

  let parsed;
  let plan;
  try {
    parsed = parsePptContentBrief(fs.readFileSync(briefFileName, "utf8"));
  } catch (error) {
    return [issue(null, "ppt_content_brief_invalid", "error", error.message)];
  }
  try {
    plan = readJsonFile(planFileName, "deck plan");
  } catch (error) {
    return [issue(null, "ppt_content_brief_plan_invalid", "error", error.message)];
  }

  const expectedSlides = parsed.planContract?.slides || [];
  const plannedSlides = Array.isArray(plan.slides) ? plan.slides : [];
  if (!Array.isArray(plan.slides)) {
    return [issue(null, "ppt_content_brief_plan_invalid", "error", "Deck plan must contain a slides array for PPT Content Brief alignment.")];
  }

  const plannedByPage = new Map(plannedSlides
    .filter((slide) => Number.isFinite(Number(slide?.page)))
    .map((slide) => [Number(slide.page), slide]));
  const expectedPages = expectedSlides.map((slide) => Number(slide.page)).filter(Number.isFinite);
  const plannedExpectedPages = plannedSlides
    .map((slide) => Number(slide?.page))
    .filter((page) => expectedPages.includes(page));
  if (JSON.stringify(plannedExpectedPages) !== JSON.stringify(expectedPages)) {
    issues.push(issue(null, "ppt_content_brief_page_order_mismatch", "error", "Deck plan pages backed by PPT Content Brief must preserve Summary Page and Page Content order.", {
      expected_pages: expectedPages,
      planned_pages: plannedExpectedPages,
    }));
  }

  for (const expected of expectedSlides) {
    const page = Number(expected.page);
    const planned = plannedByPage.get(page);
    if (!planned) {
      issues.push(issue(page, "ppt_content_brief_page_missing", "error", "Deck plan is missing a slide required by PPT Content Brief.", { page }));
      continue;
    }

    for (const [field, type] of [
      ["title", "ppt_content_brief_title_mismatch"],
      ["titleNote", "ppt_content_brief_title_note_mismatch"],
    ]) {
      if (safeText(planned[field]) !== safeText(expected[field])) {
        issues.push(issue(page, type, "error", `Deck plan ${field} must exactly match PPT Content Brief.`, {
          expected: safeText(expected[field]),
          actual: safeText(planned[field]),
        }));
      }
    }

    if (expected.role === "content" && safeText(planned.currentSection) !== safeText(expected.currentSection)) {
      issues.push(issue(page, "ppt_content_brief_section_mismatch", "error", "Deck plan currentSection must exactly match PPT Content Brief 所属章节.", {
        expected: safeText(expected.currentSection),
        actual: safeText(planned.currentSection),
      }));
    }

    const expectedSummary = normalizeSummaryItems(expected.summary);
    const plannedSummary = normalizeSummaryItems(planned.summary);
    if (JSON.stringify(plannedSummary) !== JSON.stringify(expectedSummary)) {
      issues.push(issue(page, "ppt_content_brief_summary_mismatch", "error", "Deck plan summary.body must exactly match PPT Content Brief 分析总结 labels and text.", {
        expected: expectedSummary,
        actual: plannedSummary,
      }));
    }

    const actualLayoutType = plannedContentLayoutType(planned);
    const expectedLayoutType = safeText(expected.contentLayout?.type);
    if (actualLayoutType !== expectedLayoutType) {
      issues.push(issue(page, "ppt_content_brief_layout_mismatch", "error", "Deck plan contentLayout.type must match the parser-derived PPT Content Brief layout recommendation.", {
        viewpoint_count: expected.viewpointCount,
        expected_content_layout_type: expectedLayoutType,
        actual_content_layout_type: actualLayoutType,
      }));
    }
  }
  return issues;
}

function checkPptContentBriefVisibleAlignment(parsed, slideEntries) {
  const issues = [];
  if (!parsed) return issues;
  const visibleByPage = slideVisibleTextMap(slideEntries);
  if (parsed.expectedPages && slideEntries.length !== Number(parsed.expectedPages)) {
    issues.push(issue(null, "ppt_content_brief_page_count_mismatch", "error", "PPT slide count must match PPT Content Brief 页数口径.", {
      expected_pages: Number(parsed.expectedPages),
      actual_pages: slideEntries.length,
    }));
  }
  if ((parsed.tocItems || []).length) {
    const tocPage = 3;
    const tocVisibleText = visibleByPage.get(tocPage) || "";
    for (const item of parsed.tocItems) {
      if (safeText(item.title) && !textContainsComparable(tocVisibleText, item.title)) {
        issues.push(issue(tocPage, "ppt_content_brief_visible_toc_mismatch", "error", "Visible contents page must include each PPT Content Brief TOC 小标题.", {
          expected: item.title,
        }));
      }
      if (safeText(item.description) && !textContainsComparable(tocVisibleText, item.description)) {
        issues.push(issue(tocPage, "ppt_content_brief_visible_toc_mismatch", "error", "Visible contents page must include each PPT Content Brief TOC 说明.", {
          expected: item.description,
        }));
      }
    }
  }
  for (const expected of parsed.planContract?.slides || []) {
    const page = Number(expected.page);
    const visibleText = visibleByPage.get(page) || "";
    if (!visibleText) {
      issues.push(issue(page, "ppt_content_brief_visible_slide_missing", "error", "PPT slide text could not be extracted for a PPT Content Brief-backed page.", { page }));
      continue;
    }

    const visibleFields = [
      ["title", "ppt_content_brief_visible_title_mismatch"],
      ["titleNote", "ppt_content_brief_visible_title_note_mismatch"],
    ];
    if (expected.role === "content") {
      visibleFields.push(["currentSection", "ppt_content_brief_visible_section_mismatch"]);
    }
    for (const [field, type] of visibleFields) {
      if (safeText(expected[field]) && !textContainsComparable(visibleText, expected[field])) {
        issues.push(issue(page, type, "error", `Visible PPT text must include the PPT Content Brief ${field} exactly.`, {
          expected: safeText(expected[field]),
          visible_text_sample: visibleText.slice(0, 240),
        }));
      }
    }

    for (const item of normalizeSummaryItems(expected.summary)) {
      if (item.label && !textContainsComparable(visibleText, `${item.label}：`)) {
        issues.push(issue(page, "ppt_content_brief_visible_summary_mismatch", "error", "Visible PPT text must include each PPT Content Brief 分析总结 label.", {
          expected_label: item.label,
        }));
      }
      if (item.text && !textContainsComparable(visibleText, item.text)) {
        issues.push(issue(page, "ppt_content_brief_visible_summary_mismatch", "error", "Visible PPT text must include each PPT Content Brief 分析总结 text.", {
          expected_text: item.text,
        }));
      }
    }
  }
  return issues;
}

function briefHardTextFragments(parsed) {
  if (!parsed) return new Map();
  const byPage = new Map();
  const globalFragments = [
    parsed.metadata?.["主题"],
    parsed.metadata?.["目标读者"],
    parsed.metadata?.["页数口径"],
    parsed.metadata?.["核心结论"],
    parsed.metadata?.["内容来源"],
    parsed.metadata?.["关联审计文件"],
    ...(parsed.tocItems || []).flatMap((item) => [item.title, item.description]),
  ].filter(Boolean);
  for (const expected of parsed.planContract?.slides || []) {
    const fragments = [
      ...globalFragments,
      expected.title,
      expected.titleNote,
      expected.currentSection,
      ...(expected.sections || []),
      ...normalizeSummaryItems(expected.summary).flatMap((item) => [item.label, item.text, `${item.label}：${item.text}`]),
    ].filter(Boolean);
    byPage.set(Number(expected.page), fragments.map(normalizeComparableText).filter(Boolean));
  }
  if ((parsed.tocItems || []).length) {
    byPage.set(3, [
      ...globalFragments,
      ...(parsed.sections || []),
      ...(parsed.tocItems || []).flatMap((item) => [item.title, item.description]),
    ].filter(Boolean).map(normalizeComparableText).filter(Boolean));
  }
  return byPage;
}

function isBriefDerivedIssue(item, fragmentsByPage) {
  if (!fragmentsByPage?.size || !Number.isFinite(Number(item.slide))) return false;
  const fragments = fragmentsByPage.get(Number(item.slide)) || [];
  if (!fragments.length) return false;
  const issueText = normalizeComparableText([
    item.text,
    item.expected,
    item.actual,
    item.visible_text_sample,
  ].filter(Boolean).join("\n"));
  if (!issueText) return false;
  return fragments.some((fragment) => fragment && (issueText.includes(fragment) || fragment.includes(issueText)));
}

function suppressBriefDerivedLowerPriorityIssues(issues, parsed) {
  const fragmentsByPage = briefHardTextFragments(parsed);
  const suppressibleTypes = new Set([
    "language_excess_english",
    "language_non_chinese",
    "page_title_wrap",
    "page_title_overflow_estimate",
    "text_overflow_estimate",
  ]);
  return issues.filter((item) => !(suppressibleTypes.has(item.type) && isBriefDerivedIssue(item, fragmentsByPage)));
}

function textExplainsHighlight(visibleText, reason) {
  if (!reason) return false;
  const text = safeText(visibleText);
  if (!text) return false;
  const markerOk = /(因为|关键|拐点|优先|瓶颈|支撑|说明|意味着|所以|核心|最|主线|读法|高亮)/.test(text);
  const reasonTokens = chineseBigrams(reason);
  const overlap = reasonTokens.filter((token) => text.includes(token)).length;
  return markerOk && overlap >= 1;
}

function chineseBigrams(value) {
  const cjk = String(value || "").replace(/[^\u3400-\u9fff]/g, "");
  const tokens = new Set();
  for (let idx = 0; idx < cjk.length - 1; idx += 1) tokens.add(cjk.slice(idx, idx + 2));
  return [...tokens];
}

function hasSubjectiveDecimalGrid(visual) {
  if (!Array.isArray(visual?.values)) return false;
  const values = visual.values.flatMap((row) => Array.isArray(row) ? row : []);
  if (!values.length) return false;
  return values.every((value) => typeof value === "number" && value >= 0 && value <= 1)
    && values.some((value) => !Number.isInteger(value));
}

function isRectLike(value) {
  return value
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.y))
    && Number.isFinite(Number(value.w))
    && Number(value.w) > 0
    && Number.isFinite(Number(value.h))
    && Number(value.h) > 0;
}

function imageCoverage(imageArea, visualArea) {
  if (!isRectLike(imageArea) || !isRectLike(visualArea)) return 0;
  return (Number(imageArea.w) * Number(imageArea.h)) / (Number(visualArea.w) * Number(visualArea.h));
}

function isContained(inner, outer) {
  const epsilon = 0.02;
  return Number(inner.x) >= Number(outer.x) - epsilon
    && Number(inner.y) >= Number(outer.y) - epsilon
    && Number(inner.x) + Number(inner.w) <= Number(outer.x) + Number(outer.w) + epsilon
    && Number(inner.y) + Number(inner.h) <= Number(outer.y) + Number(outer.h) + epsilon;
}

function hasMatchingAspectRatio(area, imageWidth, imageHeight) {
  const areaRatio = Number(area.w) / Number(area.h);
  const imageRatio = Number(imageWidth) / Number(imageHeight);
  return Math.abs(areaRatio - imageRatio) < 0.02;
}

function summarize(issues, slideCount) {
  const summary = {
    slide_count: slideCount,
    errors: 0,
    warnings: 0,
    info: 0,
    by_type: {},
    compliance_score: 100,
  };
  for (const item of issues) {
    if (item.severity === "error") summary.errors += 1;
    else if (item.severity === "warning") summary.warnings += 1;
    else summary.info += 1;
    summary.by_type[item.type] = (summary.by_type[item.type] || 0) + 1;
  }
  summary.compliance_score = Math.max(0, Math.round((100 - summary.errors * 8 - summary.warnings * 2) * 10) / 10);
  return summary;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    usage();
    process.exit(2);
  }
  if (!fs.existsSync(args.input)) {
    console.error(`File not found: ${args.input}`);
    process.exit(2);
  }

  const zip = await loadZip(args.input);
  const slides = await readXmlFiles(zip, "ppt/slides/slide");
  const presentationFiles = await readXmlFiles(zip, "ppt/");
  const issues = [];
  let parsedBrief = null;
  if (args.requirePptContentBrief && fs.existsSync(args.requirePptContentBrief)) {
    try {
      parsedBrief = parsePptContentBrief(fs.readFileSync(args.requirePptContentBrief, "utf8"));
    } catch {
      parsedBrief = null;
    }
  }

  for (const slide of slides) {
    issues.push(...checkSlideXml(slide.name, slide.xml));
  }
  issues.push(...checkSectionOrder(slides));
  issues.push(...checkRenderEvidence(args.requireRenderDir, slides.length));
  issues.push(...checkVisualAnchorManifest(args.requireVisualAnchorManifest, slides, args.requirePlan));
  issues.push(...checkPptContentBriefPlanAlignment(args.requirePptContentBrief, args.requirePlan));
  issues.push(...checkPptContentBriefVisibleAlignment(parsedBrief, slides));

  const presentationXml = presentationFiles.find((file) => file.name === "ppt/presentation.xml");
  if (presentationXml && /<p:transition\b|<p:timing\b/.test(presentationXml.xml)) {
    issues.push(issue(null, "presentation_motion", "error", "Presentation-level motion XML was found."));
  }

  const filteredIssues = suppressBriefDerivedLowerPriorityIssues(issues, parsedBrief);
  const report = {
    file: path.resolve(args.input),
    generated_at: new Date().toISOString(),
    summary: summarize(filteredIssues, slides.length),
    issues: filteredIssues,
  };

  const text = JSON.stringify(report, null, 2);
  if (args.out) {
    const outPath = ensureTmpOutput(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, text, "utf8");
  }

  console.log(text);
  if (report.summary.errors > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
