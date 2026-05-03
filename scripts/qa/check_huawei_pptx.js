const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { validateVisualAnchorSpec } = require("../pptx/hw_diagram_helpers");

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
const ALLOWED_FONT_SIZES = new Set([6, 8, 12, 14, 18, 24]);
const CONTENT_CARD_FILLS = new Set(["F2F2F2", "F7F7F7", "FFF1EF", "FCE4E0"]);
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
  console.error("Usage: node scripts/qa/check_huawei_pptx.js <deck.pptx> [--out .tmp/report.json] [--require-visual-anchor-manifest .tmp/deck_visual_anchor_manifest.json]");
}

function parseArgs(argv) {
  const args = { input: argv[2], out: null, requireRenderDir: null, requireReferenceReview: null, requireVisualAnchorManifest: null };
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      args.out = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--require-render-dir") {
      args.requireRenderDir = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--require-reference-review") {
      args.requireReferenceReview = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--require-visual-anchor-manifest") {
      args.requireVisualAnchorManifest = argv[i + 1];
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
    if (/[\u3400-\u9fff]/.test(char)) units += 1;
    else if (/[A-Z]/.test(char)) units += 0.72;
    else if (/[a-z]/.test(char)) units += 0.55;
    else if (/[0-9]/.test(char)) units += 0.55;
    else if (/\s/.test(char)) units += 0.3;
    else units += 0.35;
  }
  return units;
}

function estimateWrappedLines(text, fontSize, widthInches) {
  if (!text || !fontSize || !widthInches) return 0;
  const avgCjkCharWidth = fontSize / 72;
  const unitsPerLine = Math.max(widthInches / avgCjkCharWidth, 1);
  return String(text)
    .split(/\r?\n/)
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(estimateTextUnits(line) / unitsPerLine)), 0);
}

function availableTextLines(shape, fontSize, lineSpacingMultiple = 1.5) {
  if (!shape.h || !fontSize) return 0;
  const lineHeight = (fontSize / 72) * lineSpacingMultiple;
  return Math.max(shape.h / lineHeight, 0);
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
    /[\u3400-\u9fff]{2,10}[：:][\u3400-\u9fff]/.test(shape.text) &&
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
    if (points < 6) {
      issues.push(issue(slide, "font_size_min", "error", `Font size ${points}pt is below 6pt.`, { value: points }));
    }
  }
  const unexpectedFontSizes = [...fontSizes].filter((points) => !ALLOWED_FONT_SIZES.has(points));
  if (unexpectedFontSizes.length) {
    issues.push(issue(slide, "font_size_unexpected", "warning", `Slide uses font sizes outside the Huawei size set 12/14/18/24pt plus 6pt footer/caption and 8pt section-tab exceptions.`, { values: unexpectedFontSizes.sort((a, b) => a - b) }));
  }
  if (fontSizes.size > 6) {
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
      const titleLines = estimateWrappedLines(title.text, maxSize || 24, title.w || 12.2);
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
    if (maxSize >= 12 && shape.w && shape.h) {
      const estimatedLines = estimateWrappedLines(shape.text, maxSize, Math.max(shape.w - 0.08, 0.1));
      const availableLines = availableTextLines(shape, maxSize, maxSize >= 18 ? 1.15 : 1.5);
      if (estimatedLines > availableLines + 0.35) {
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
      issues.push(issue(slide, "filled_shape_overlap_estimate", "warning", "Filled layout elements appear to overlap in PPTX geometry; verify this is intentional and not a card/header collision.", {
        first_text: a.text.slice(0, 80),
        second_text: b.text.slice(0, 80),
      }));
    }
  }

  const largeCards = shapes.filter((shape) => CONTENT_CARD_FILLS.has(shape.fill) && shape.area >= 2.8 && (shape.y === null || shape.y >= 1.95));
  for (const card of largeCards) {
    const containedText = shapes
      .filter((shape) => shape.text && isInside(shape, card))
      .map((shape) => shape.text)
      .join("");
    const textLen = containedText.replace(/\s/g, "").length;
    const density = textLen / Math.max(card.area, 0.1);
    if (textLen < 120 || density < 18) {
      issues.push(issue(slide, "sparse_large_card", "warning", "Large content card has too little text for its size; add appropriately sized explanation text or shrink the card.", {
        area: Math.round(card.area * 100) / 100,
        text_length: textLen,
        density: Math.round(density * 10) / 10,
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

function checkReferenceReviewEvidence(fileName) {
  if (!fileName) return [];
  if (!fs.existsSync(fileName)) {
    return [issue(null, "reference_review_missing", "error", `Required reference review file not found: ${fileName}`)];
  }
  try {
    const review = JSON.parse(fs.readFileSync(fileName, "utf8"));
    const refs = Array.isArray(review.references) ? review.references : [];
    const refDir = path.resolve("assets", "slides_ref");
    const expectedFiles = fs.existsSync(refDir)
      ? fs.readdirSync(refDir).filter((name) => name.toLowerCase().endsWith(".png")).sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true })).map((name) => path.relative(process.cwd(), path.join(refDir, name)).replace(/\\/g, "/"))
      : [];
    const reviewedFiles = new Set(refs.map((ref) => String(ref.file || "").replace(/\\/g, "/")));
    const missingFiles = expectedFiles.filter((file) => !reviewedFiles.has(file));
    const incomplete = refs.filter((ref) => !ref.loaded || !Array.isArray(ref.observations) || ref.observations.length === 0 || !Array.isArray(ref.applied_to_slides) || ref.applied_to_slides.length === 0);
    if (expectedFiles.length && missingFiles.length) {
      return [issue(null, "reference_review_missing_images", "error", `Reference review does not cover every bundled reference image.`, { missing_files: missingFiles })];
    }
    if (!expectedFiles.length && refs.length < 5) {
      return [issue(null, "reference_review_too_few", "error", `Reference review contains only ${refs.length} images.`)];
    }
    if (incomplete.length) {
      return [issue(null, "reference_review_incomplete", "error", `${incomplete.length} reference images lack observations or slide applications.`)];
    }
  } catch (error) {
    return [issue(null, "reference_review_invalid", "error", `Could not parse reference review JSON: ${error.message}`)];
  }
  return [];
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

function checkVisualAnchorManifest(fileName, slideEntries) {
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
    const slideEntries = byPage.get(slide) || [];
    if (slideEntries.length !== 1) {
      issues.push(issue(slide, "content_visual_anchor_missing", "error", "Content slide must have exactly one manifest-backed visual anchor.", {
        manifest_entries: slideEntries.length,
      }));
      continue;
    }

    const entry = slideEntries[0];
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
    if (entry.renderer === "rough_svg") {
      const dimValid = Number.isFinite(Number(entry.image_width)) && Number(entry.image_width) > 0
        && Number.isFinite(Number(entry.image_height)) && Number(entry.image_height) > 0;
      const areaValid = isRectLike(entry.anchor_area) && isRectLike(entry.image_area);
      if (!dimValid || !areaValid) {
        issues.push(issue(slide, "content_visual_anchor_image_missing", "error", "rough_svg visual anchors must record positive image dimensions and actual image placement.", {
          image_width: entry.image_width,
          image_height: entry.image_height,
          image_area: entry.image_area,
          anchor_area: entry.anchor_area,
        }));
      } else if (!isContained(entry.image_area, entry.anchor_area) || !hasMatchingAspectRatio(entry.image_area, entry.image_width, entry.image_height)) {
        issues.push(issue(slide, "content_visual_anchor_image_invalid", "error", "rough_svg visual anchor image must stay inside the anchor area and preserve aspect ratio.", {
          image_width: entry.image_width,
          image_height: entry.image_height,
          image_area: entry.image_area,
          anchor_area: entry.anchor_area,
        }));
      }
    }
  }

  return issues;
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

  for (const slide of slides) {
    issues.push(...checkSlideXml(slide.name, slide.xml));
  }
  issues.push(...checkSectionOrder(slides));
  issues.push(...checkRenderEvidence(args.requireRenderDir, slides.length));
  issues.push(...checkReferenceReviewEvidence(args.requireReferenceReview));
  issues.push(...checkVisualAnchorManifest(args.requireVisualAnchorManifest, slides));

  const presentationXml = presentationFiles.find((file) => file.name === "ppt/presentation.xml");
  if (presentationXml && /<p:transition\b|<p:timing\b/.test(presentationXml.xml)) {
    issues.push(issue(null, "presentation_motion", "error", "Presentation-level motion XML was found."));
  }

  const report = {
    file: path.resolve(args.input),
    generated_at: new Date().toISOString(),
    summary: summarize(issues, slides.length),
    issues,
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
