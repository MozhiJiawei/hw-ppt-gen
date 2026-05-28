const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pptxgen = require("pptxgenjs");
const { createVisualAnchorImage, renderVisualAnchorPptNative, resolveVisualAnchorRenderPath, validateVisualAnchorSpec } = require("../pptx/hw_diagram_helpers");

const ShapeType = pptxgen.ShapeType || { rect: "rect", line: "line" };
const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_SPEC = path.join(ROOT, "scripts", "smoke", "fixtures", "visual_diagram_test_cases.js");
const DEFAULT_OUT = path.join(ROOT, ".tmp", "diagram_component_smoke");
const ROUGH_SIZE_TIERS = [
  { tier: "large", label: "偏分栏大图", width: 1400 },
  { tier: "medium", label: "二分栏中图", width: 1100 },
  { tier: "small", label: "三分栏小图", width: 860 },
];
const NATIVE_SIZE_TIERS = [
  { tier: "large", label: "偏分栏大图", share: "3/4", area: { x: 0.45, y: 1.22, w: 9.18, h: 5.3 } },
  { tier: "medium", label: "二分栏中图", share: "1/2", area: { x: 0.45, y: 1.22, w: 6.12, h: 5.3 } },
  { tier: "small", label: "三分栏小图", share: "1/3", area: { x: 0.45, y: 1.22, w: 4.08, h: 5.3 } },
];

function parseArgs(argv) {
  const args = { spec: DEFAULT_SPEC, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--spec") args.spec = path.resolve(argv[++i]);
    else if (arg === "--out") args.out = path.resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/smoke/verify_diagram_components.js [--spec path/to/visual_specs.json] [--out .tmp/diagram_component_smoke]

Creates review decks from visual-anchor cases:
- each kind/template directory gets one review PPT using the fixed template implementation.
- rejected over-capacity cases are included as rejection slides in that directory PPT.`);
}

function safePathPart(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "unknown";
}

function cleanDefaultOutputDir(outDir) {
  const relative = path.relative(ROOT, outDir);
  const isTmpChild = relative && !relative.startsWith("..") && !path.isAbsolute(relative) && relative.split(path.sep)[0] === ".tmp";
  if (isTmpChild && fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

function isTextCapacityError(error) {
  return /Diagram text exceeds|supports at most|below the \d+px minimum|ppt_native text exceeds|ppt_native text font size/.test(String(error?.message || error));
}

async function writeDiagramAssets(spec, outRoot) {
  const kindDir = safePathPart(spec.kind);
  const templateDir = safePathPart(spec.template);
  const caseDir = path.join(outRoot, kindDir, templateDir);
  fs.mkdirSync(caseDir, { recursive: true });

  const baseOptions = spec.render_options || { aspectRatio: "16:9" };
  const baseName = safePathPart(spec.id || spec.template);
  const variants = [];
  for (const variant of ROUGH_SIZE_TIERS) {
    const image = createVisualAnchorImage(spec, { ...baseOptions, width: variant.width, sizeTier: variant.tier });
    const svgPath = path.join(caseDir, `${baseName}_${variant.tier}.svg`);
    const pngPath = path.join(caseDir, `${baseName}_${variant.tier}.png`);
    fs.writeFileSync(svgPath, image.svg, "utf8");
    await sharp(Buffer.from(image.svg)).png().toFile(pngPath);
    variants.push({
      tier: variant.tier,
      label: variant.label,
      svg: path.relative(ROOT, svgPath).replace(/\\/g, "/"),
      png: path.relative(ROOT, pngPath).replace(/\\/g, "/"),
      width: image.width,
      height: image.height,
    });
  }
  const image = variants[0];

  return {
    id: spec.id,
    title: spec.title,
    claim: spec.claim,
    scenario: spec.scenario,
    kind: spec.kind,
    template: spec.template,
    svg: image.svg,
    png: image.png,
    width: image.width,
    height: image.height,
    variants,
  };
}

function loadCases(specPath) {
  const ext = path.extname(specPath).toLowerCase();
  if (ext === ".json") {
    const data = JSON.parse(fs.readFileSync(specPath, "utf8"));
    return data.cases || [];
  }
  if (ext === ".js" || ext === ".cjs") {
    delete require.cache[require.resolve(specPath)];
    const data = require(specPath);
    return data.cases || [];
  }
  throw new Error(`Unsupported spec format: ${specPath}`);
}

function addSlideTitle(slide, title, subtitle = "") {
  slide.addText(title, {
    x: 0.45,
    y: 0.28,
    w: 12.25,
    h: 0.36,
    fontFace: "Microsoft YaHei",
    fontSize: 18,
    bold: true,
    color: "C00000",
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  slide.addShape(ShapeType.line, {
    x: 0.45,
    y: 0.78,
    w: 12.25,
    h: 0,
    line: { color: "C00000", width: 1.1 },
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.45,
      y: 0.86,
      w: 12.25,
      h: 0.24,
      fontFace: "Microsoft YaHei",
      fontSize: 10,
      color: "595959",
      margin: 0,
      breakLine: false,
      fit: "shrink",
    });
  }
}

function addFooter(slide, pageNo, totalPages) {
  slide.addShape(ShapeType.line, {
    x: 0.45,
    y: 7.12,
    w: 12.25,
    h: 0,
    line: { color: "D9D9D9", width: 0.5 },
  });
  slide.addText("Visual anchor smoke review", {
    x: 0.45,
    y: 7.18,
    w: 5.5,
    h: 0.16,
    fontFace: "Arial",
    fontSize: 10,
    color: "8C8C8C",
    margin: 0,
  });
  slide.addText(`${pageNo}/${totalPages}`, {
    x: 11.55,
    y: 7.18,
    w: 1.15,
    h: 0.16,
    fontFace: "Arial",
    fontSize: 10,
    color: "8C8C8C",
    align: "right",
    margin: 0,
  });
}

function addImageTile(slide, asset, index, x, y, w, h) {
  const pngPath = path.join(ROOT, asset.png);
  const imageArea = fitAreaContain({ x: x + 0.04, y: y + 0.04, w: w - 0.08, h: h - 0.34 }, asset.width, asset.height);
  slide.addShape(ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: "FFFFFF" },
    line: { color: "D9D9D9", width: 0.5 },
  });
  slide.addImage({
    path: pngPath,
    ...imageArea,
  });
  slide.addText(`${index + 1}. ${asset.id || asset.template}`, {
    x: x + 0.06,
    y: y + h - 0.24,
    w: w - 0.12,
    h: 0.16,
    fontFace: "Arial",
    fontSize: 10,
    color: "595959",
    margin: 0,
    fit: "shrink",
  });
}

function getCaseDescription(asset) {
  return asset.scenario || asset.claim || asset.title || asset.id || asset.template || "未命名用例";
}

function addCaseImageSlide(slide, asset) {
  const pngPath = path.join(ROOT, asset.png);
  const targetWidths = { large: 9.18, medium: 6.12, small: 4.08 };
  const targetW = targetWidths[asset.tier] || 12.25;
  const imageArea = { x: 0.45, y: 1.12, w: targetW, h: 5.86 };
  const fitted = fitAreaContain(imageArea, asset.width, asset.height);
  slide.addImage({
    path: pngPath,
    ...fitted,
  });
  if (asset.label) {
    slide.addText(`${asset.label}：按版面 ${asset.tier === "large" ? "3/4" : asset.tier === "medium" ? "1/2" : asset.tier === "small" ? "1/3" : "full"} 宽度检查`, {
      x: 0.45,
      y: 6.9,
      w: targetW,
      h: 0.18,
      fontFace: "Microsoft YaHei",
      fontSize: 10,
      color: "595959",
      margin: 0,
      fit: "shrink",
    });
  }
}

function addNativeTierLabel(slide, variant) {
  if (!variant?.label) return;
  slide.addText(`${variant.label}：按版面 ${variant.share} 宽度检查`, {
    x: variant.area.x,
    y: 6.9,
    w: variant.area.w,
    h: 0.18,
    fontFace: "Microsoft YaHei",
    fontSize: 10,
    color: "595959",
    margin: 0,
    fit: "shrink",
  });
}

function addRejectedSlide(pptx, spec, renderPath, error, pageNo, totalPages) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addSlideTitle(slide, getCaseDescription(spec), `${renderPath} · ${spec.kind} / ${spec.template} · ${spec.id}`);
  slide.addShape(ShapeType.rect, {
    x: 0.75,
    y: 1.35,
    w: 11.8,
    h: 4.95,
    fill: { color: "FFF1EF" },
    line: { color: "C00000", width: 1 },
  });
  slide.addText("Rejected by visual capacity guard", {
    x: 1.0,
    y: 1.7,
    w: 11.3,
    h: 0.32,
    fontFace: "Microsoft YaHei",
    fontSize: 18,
    bold: true,
    color: "C00000",
    margin: 0,
  });
  slide.addText(error, {
    x: 1.0,
    y: 2.25,
    w: 11.1,
    h: 2.4,
    fontFace: "Microsoft YaHei",
    fontSize: 12,
    color: "333333",
    margin: 0.02,
    fit: "shrink",
    breakLine: false,
  });
  slide.addText("This slide is intentionally generated so rejected cases remain reviewable during visual-anchor template work.", {
    x: 1.0,
    y: 5.15,
    w: 11.1,
    h: 0.28,
    fontFace: "Arial",
    fontSize: 10,
    color: "595959",
    margin: 0,
  });
  addFooter(slide, pageNo, totalPages);
}

function addRenderedSlide(pptx, spec, renderPath, payload, pageNo, totalPages) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  const variant = payload.asset || payload.nativeVariant;
  const variantSuffix = variant?.label ? ` · ${variant.label}` : "";
  addSlideTitle(slide, getCaseDescription(spec), `${renderPath} · ${spec.kind} / ${spec.template} · ${spec.id}${variantSuffix}`);
  if (renderPath === "rough_svg") {
    addCaseImageSlide(slide, payload.asset);
  } else {
    const area = payload.nativeVariant?.area;
    renderVisualAnchorPptNative(slide, spec, area);
    addNativeTierLabel(slide, payload.nativeVariant);
  }
  addFooter(slide, pageNo, totalPages);
}

function verifyNativeCaseCapacity(spec, area) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  renderVisualAnchorPptNative(pptx.addSlide(), spec, area);
}

async function writeTemplateReviewPpt(group, outRoot) {
  const { kind, template, cases } = group;
  const kindDir = safePathPart(kind);
  const templateDir = safePathPart(template);
  const caseDir = path.join(outRoot, "review_pptx", kindDir);
  fs.mkdirSync(caseDir, { recursive: true });

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "hw-ppt-gen";
  pptx.subject = `Visual anchor ${kind}/${template} review`;
  pptx.title = `${kind}/${template} review`;
  pptx.company = "Huawei-style PPTX generator";
  pptx.lang = "zh-CN";
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei", lang: "zh-CN" };

  const reviewEntries = cases.flatMap((entry) => {
    if (!entry.error && entry.renderPath === "rough_svg" && Array.isArray(entry.asset?.variants)) {
      return entry.asset.variants.map((variant) => ({ ...entry, asset: variant }));
    }
    if (!entry.error && entry.renderPath === "ppt_native" && Array.isArray(entry.nativeVariants)) {
      return entry.nativeVariants.map((variant) => ({ ...entry, nativeVariant: variant }));
    }
    return [entry];
  });

  reviewEntries.forEach((entry, idx) => {
    const pageNo = idx + 1;
    const totalPages = reviewEntries.length;
    if (entry.error) addRejectedSlide(pptx, entry.spec, entry.renderPath, entry.error, pageNo, totalPages);
    else addRenderedSlide(pptx, entry.spec, entry.renderPath, entry, pageNo, totalPages);
  });

  const pptxPath = path.join(caseDir, `${templateDir}.pptx`);
  await pptx.writeFile({ fileName: pptxPath });
  return pptxPath;
}

function fitAreaContain(area, imageWidth, imageHeight) {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) return area;
  const areaRatio = area.w / area.h;
  const imageRatio = imageWidth / imageHeight;
  if (imageRatio >= areaRatio) {
    const h = area.w / imageRatio;
    return { x: area.x, y: area.y + (area.h - h) / 2, w: area.w, h };
  }
  const w = area.h * imageRatio;
  return { x: area.x + (area.w - w) / 2, y: area.y, w, h: area.h };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!fs.existsSync(args.spec)) throw new Error(`Spec file not found: ${args.spec}`);
  cleanDefaultOutputDir(args.out);

  const cases = loadCases(args.spec);
  if (!cases.length) throw new Error(`No cases found in spec: ${args.spec}`);

  const renderedCases = [];
  const rejectedCases = [];
  const groups = new Map();
  const addGroupEntry = (spec, renderPath, entry) => {
    const key = `${spec.kind}/${spec.template}`;
    if (!groups.has(key)) groups.set(key, { kind: spec.kind, template: spec.template, cases: [] });
    groups.get(key).cases.push({ spec, renderPath, ...entry });
  };

  for (const spec of cases) {
    validateVisualAnchorSpec(spec);
    const renderPath = resolveVisualAnchorRenderPath(spec);
    try {
      const asset = renderPath === "rough_svg" ? await writeDiagramAssets(spec, args.out) : null;
      const nativeVariants = renderPath === "ppt_native" ? NATIVE_SIZE_TIERS : null;
      if (renderPath === "ppt_native") nativeVariants.forEach((variant) => verifyNativeCaseCapacity(spec, variant.area));
      else if (renderPath === "evidence") verifyNativeCaseCapacity(spec);
      addGroupEntry(spec, renderPath, { asset, nativeVariants });
      renderedCases.push({
        id: spec.id,
        title: spec.title,
        claim: spec.claim,
        kind: spec.kind,
        template: spec.template,
        renderer: renderPath,
        svg: asset?.svg,
        png: asset?.png,
        width: asset?.width,
        height: asset?.height,
        variants: renderPath === "rough_svg" ? asset?.variants?.map((variant) => variant.tier) : nativeVariants?.map((variant) => variant.tier),
      });
    } catch (error) {
      if (!isTextCapacityError(error)) throw error;
      addGroupEntry(spec, renderPath, { error: error.message });
      rejectedCases.push({
        id: spec.id,
        title: spec.title,
        claim: spec.claim,
        kind: spec.kind,
        template: spec.template,
        renderer: renderPath,
        reason: error.message,
      });
    }
  }

  const reviewDecks = [];
  for (const group of groups.values()) {
    const pptxPath = await writeTemplateReviewPpt(group, args.out);
    const relativePptx = path.relative(ROOT, pptxPath).replace(/\\/g, "/");
    reviewDecks.push({
      kind: group.kind,
      template: group.template,
      pptx: relativePptx,
      rendered_count: group.cases.filter((entry) => !entry.error).length,
      rejected_count: group.cases.filter((entry) => entry.error).length,
    });
    for (const entry of [...renderedCases, ...rejectedCases]) {
      if (entry.kind === group.kind && entry.template === group.template) entry.pptx = relativePptx;
    }
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    spec: path.relative(ROOT, args.spec).replace(/\\/g, "/"),
    helper: "scripts/pptx/hw_diagram_helpers.js",
    output_contract: ["one fixed implementation per case", "one review PPT per kind/template directory"],
    review_decks: reviewDecks,
    rendered_cases: renderedCases,
    rejected_cases: rejectedCases,
  };
  fs.writeFileSync(path.join(args.out, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Generated ${reviewDecks.length} directory review PPTs under ${path.join(args.out, "review_pptx")}`);
  console.log(`Included ${renderedCases.length} rendered cases and ${rejectedCases.length} over-capacity rejection slides`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
