const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

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
const ALLOWED_FONT_SIZES = new Set([6, 12, 14, 18, 24]);
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
  console.error("Usage: node scripts/check_huawei_pptx.js <deck.pptx> [--out .tmp/report.json]");
}

function parseArgs(argv) {
  const args = { input: argv[2], out: null, requireRenderDir: null, requireReferenceReview: null };
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
    issues.push(issue(slide, "font_size_unexpected", "warning", `Slide uses font sizes outside the Huawei size set 12/14/18/24pt plus 6pt footer/caption exception.`, { values: unexpectedFontSizes.sort((a, b) => a - b) }));
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
    const title = shapes
      .filter((shape) => shape.text && shape.y !== null && shape.y < 0.82 && shape.x !== null && shape.x < 1.2)
      .sort((a, b) => a.y - b.y || a.x - b.x)[0];
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

  const largeCards = shapes.filter((shape) => CONTENT_CARD_FILLS.has(shape.fill) && shape.area >= 2.8);
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
  issues.push(...checkRenderEvidence(args.requireRenderDir, slides.length));
  issues.push(...checkReferenceReviewEvidence(args.requireReferenceReview));

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
