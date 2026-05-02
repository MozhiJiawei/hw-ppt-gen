const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pptxgen = require("pptxgenjs");
const { createVisualAnchorImage, renderVisualAnchorPptNative, resolveVisualAnchorRenderPath, validateVisualAnchorSpec } = require("../pptx/hw_diagram_helpers");

const ShapeType = pptxgen.ShapeType || { rect: "rect", line: "line" };
const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_SPEC = path.join(ROOT, "references", "visual_diagram_test_cases.js");
const DEFAULT_OUT = path.join(ROOT, ".tmp", "diagram_component_smoke");

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

Creates two review decks from the same visual-anchor cases:
- rough_svg: SVG+PNG assets embedded into a PPT review deck.
- ppt_native: native PPT preview shapes for the same semantic cases.
Evidence and Matrix/table remain fixed-rule exceptions outside the renderer switch.`);
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
  process.env.HW_VISUAL_ANCHOR_RENDERER = "rough_svg";
  const kindDir = safePathPart(spec.kind);
  const templateDir = safePathPart(spec.template);
  const caseDir = path.join(outRoot, kindDir, templateDir);
  fs.mkdirSync(caseDir, { recursive: true });

  const image = createVisualAnchorImage(spec, spec.render_options || { aspectRatio: "16:9" });
  const baseName = safePathPart(spec.id || spec.template);
  const svgPath = path.join(caseDir, `${baseName}.svg`);
  const pngPath = path.join(caseDir, `${baseName}.png`);
  fs.writeFileSync(svgPath, image.svg, "utf8");
  await sharp(Buffer.from(image.svg)).png().toFile(pngPath);

  return {
    id: spec.id,
    title: spec.title,
    claim: spec.claim,
    scenario: spec.scenario,
    kind: spec.kind,
    template: spec.template,
    svg: path.relative(ROOT, svgPath).replace(/\\/g, "/"),
    png: path.relative(ROOT, pngPath).replace(/\\/g, "/"),
    width: image.width,
    height: image.height,
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

function groupAssetsByTemplate(assets) {
  const groups = new Map();
  for (const asset of assets) {
    const key = `${asset.kind || "unknown"} / ${asset.template || "unknown"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }
  return [...groups.entries()];
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
      fontSize: 8,
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
  slide.addText("Visual anchor rough_svg smoke review", {
    x: 0.45,
    y: 7.18,
    w: 5.5,
    h: 0.16,
    fontFace: "Arial",
    fontSize: 6,
    color: "8C8C8C",
    margin: 0,
  });
  slide.addText(`${pageNo}/${totalPages}`, {
    x: 11.55,
    y: 7.18,
    w: 1.15,
    h: 0.16,
    fontFace: "Arial",
    fontSize: 6,
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
    fontSize: 6,
    color: "595959",
    margin: 0,
    fit: "shrink",
  });
}

function getCaseDescription(asset) {
  return asset.scenario || asset.claim || asset.title || asset.id || asset.template || "未命名用例";
}

function sortReviewItems(items) {
  return [...items].sort((a, b) => {
    const aLong = String(a.id || "").startsWith("long_text") ? 0 : 1;
    const bLong = String(b.id || "").startsWith("long_text") ? 0 : 1;
    if (aLong !== bLong) return aLong - bLong;
    return 0;
  });
}

function addCaseImageSlide(slide, asset) {
  const pngPath = path.join(ROOT, asset.png);
  const imageArea = { x: 0.45, y: 1.12, w: 12.25, h: 5.86 };
  const fitted = fitAreaContain(imageArea, asset.width, asset.height);
  slide.addShape(ShapeType.rect, {
    ...imageArea,
    fill: { color: "FFFFFF" },
    line: { color: "D9D9D9", width: 0.5 },
  });
  slide.addImage({
    path: pngPath,
    ...fitted,
  });
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

async function writeRoughReviewDeck(assets, outRoot, manifest) {
  const groups = groupAssetsByTemplate(assets);
  const reviewAssets = sortReviewItems(assets);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "hw-ppt-gen";
  pptx.subject = "Visual anchor rough_svg smoke review";
  pptx.title = "Visual Anchor Rough SVG Smoke Review";
  pptx.company = "Huawei-style PPTX generator";
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
    lang: "zh-CN",
  };

  const totalPages = reviewAssets.length + 1;
  const cover = pptx.addSlide();
  cover.background = { color: "FFFFFF" };
  addSlideTitle(cover, "视觉锚点 Rough SVG Smoke Review", `${assets.length} images · ${groups.length} templates · ${manifest.generated_at}`);
  cover.addText("封面后每页展示一个用例，页标题为用例描述，图片保持比例放入正文区域。用于快速检查配色、裁切、文字可读性和模板差异。", {
    x: 0.75,
    y: 1.55,
    w: 11.8,
    h: 0.5,
    fontFace: "Microsoft YaHei",
    fontSize: 14,
    color: "333333",
    margin: 0,
    fit: "shrink",
  });
  cover.addText(groups.map(([name, group]) => `${name}: ${group.length}`).join("\n"), {
    x: 0.85,
    y: 2.35,
    w: 11.5,
    h: 3.7,
    fontFace: "Arial",
    fontSize: 9,
    color: "595959",
    breakLine: false,
    margin: 0.04,
    fit: "shrink",
  });
  addFooter(cover, 1, totalPages);

  reviewAssets.forEach((asset, assetIdx) => {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addSlideTitle(slide, getCaseDescription(asset), `${asset.kind} / ${asset.template} · ${asset.id}`);
    addCaseImageSlide(slide, asset);
    addFooter(slide, assetIdx + 2, totalPages);
  });

  const pptxPath = path.join(outRoot, "visual_anchor_rough_svg_review.pptx");
  await pptx.writeFile({ fileName: pptxPath });
  return pptxPath;
}

async function writeNativeReviewDeck(cases, outRoot, manifest) {
  process.env.HW_VISUAL_ANCHOR_RENDERER = "ppt_native";
  const reviewCases = sortReviewItems(cases);
  const renderableCases = [];
  const rejectedCases = [];
  for (const spec of reviewCases) {
    try {
      validateVisualAnchorSpec(spec);
      const renderPath = resolveVisualAnchorRenderPath(spec, { HW_VISUAL_ANCHOR_RENDERER: "ppt_native" });
      if (!["ppt_native", "evidence"].includes(renderPath)) throw new Error(`Expected ppt_native/evidence render path for ${spec.id}, got ${renderPath}`);
      renderableCases.push({ spec, renderPath });
    } catch (error) {
      if (!isTextCapacityError(error)) throw error;
      rejectedCases.push({
        id: spec.id,
        title: spec.title,
        claim: spec.claim,
        kind: spec.kind,
        template: spec.template,
        renderer: "ppt_native",
        reason: error.message,
      });
    }
  }
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "hw-ppt-gen";
  pptx.subject = "Visual anchor ppt_native smoke review";
  pptx.title = "Visual Anchor PPT Native Smoke Review";
  pptx.company = "Huawei-style PPTX generator";
  pptx.lang = "zh-CN";
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei", lang: "zh-CN" };

  const groups = new Map();
  cases.forEach((spec) => groups.set(`${spec.kind}/${spec.template}`, (groups.get(`${spec.kind}/${spec.template}`) || 0) + 1));
  const totalPages = renderableCases.length + 1;
  const cover = pptx.addSlide();
  cover.background = { color: "FFFFFF" };
  addSlideTitle(cover, "视觉锚点 PPT Native Smoke Review", `${renderableCases.length}/${cases.length} rendered · ${rejectedCases.length} rejected · ${groups.size} templates · ${manifest.generated_at}`);
  cover.addText("封面后每页用 PPT 原生形状渲染同一批语义用例。该卡组验证 ppt_native 全局模式能覆盖现有 visual anchor case。", {
    x: 0.75,
    y: 1.55,
    w: 11.8,
    h: 0.5,
    fontFace: "Microsoft YaHei",
    fontSize: 14,
    color: "333333",
    margin: 0,
    fit: "shrink",
  });
  cover.addText([...groups.entries()].map(([name, count]) => `${name}: ${count}`).join("\n"), {
    x: 0.85,
    y: 2.35,
    w: 11.5,
    h: 3.7,
    fontFace: "Arial",
    fontSize: 9,
    color: "595959",
    breakLine: false,
    margin: 0.04,
    fit: "shrink",
  });
  addFooter(cover, 1, totalPages);

  let nativePage = 0;
  renderableCases.forEach(({ spec }) => {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addSlideTitle(slide, spec.scenario || spec.claim || spec.title || spec.id, `${spec.kind} / ${spec.template} · ${spec.id}`);
    try {
      renderVisualAnchorPptNative(slide, spec);
      nativePage += 1;
      addFooter(slide, nativePage + 1, totalPages);
    } catch (error) {
      if (!isTextCapacityError(error)) throw error;
      pptx._slides.pop();
      rejectedCases.push({
        id: spec.id,
        title: spec.title,
        claim: spec.claim,
        kind: spec.kind,
        template: spec.template,
        renderer: "ppt_native",
        reason: error.message,
      });
    }
  });

  const pptxPath = path.join(outRoot, "visual_anchor_ppt_native_review.pptx");
  await pptx.writeFile({ fileName: pptxPath });
  return { pptxPath, rejectedCases };
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

  const assets = [];
  const fixedRuleCases = [];
  const rejectedCases = [];
  for (const spec of cases) {
    validateVisualAnchorSpec(spec);
    const roughPath = resolveVisualAnchorRenderPath(spec, { HW_VISUAL_ANCHOR_RENDERER: "rough_svg" });
    if (roughPath === "rough_svg") {
      try {
        assets.push(await writeDiagramAssets(spec, args.out));
      } catch (error) {
        if (!isTextCapacityError(error)) throw error;
        rejectedCases.push({
          id: spec.id,
          title: spec.title,
          claim: spec.claim,
          kind: spec.kind,
          template: spec.template,
          renderer: "rough_svg",
          reason: error.message,
        });
      }
    } else {
      fixedRuleCases.push({
        id: spec.id,
        title: spec.title,
        claim: spec.claim,
        kind: spec.kind,
        template: spec.template,
        render_path: roughPath,
      });
    }
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    spec: path.relative(ROOT, args.spec).replace(/\\/g, "/"),
    helper: "scripts/pptx/hw_diagram_helpers.js",
    output_contract: ["image/svg+xml", "image/png"],
    assets,
    fixed_rule_cases: fixedRuleCases,
    rejected_cases: rejectedCases,
  };
  const roughReviewPptx = await writeRoughReviewDeck(assets, args.out, manifest);
  const nativeReview = await writeNativeReviewDeck(cases, args.out, manifest);
  const nativeReviewPptx = nativeReview.pptxPath;
  manifest.rejected_cases.push(...nativeReview.rejectedCases);
  manifest.review_pptx = path.relative(ROOT, roughReviewPptx).replace(/\\/g, "/");
  manifest.review_pptx_by_renderer = {
    rough_svg: path.relative(ROOT, roughReviewPptx).replace(/\\/g, "/"),
    ppt_native: path.relative(ROOT, nativeReviewPptx).replace(/\\/g, "/"),
  };
  fs.writeFileSync(path.join(args.out, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Generated ${assets.length} SVG+PNG pairs under ${args.out}`);
  console.log(`Rejected ${manifest.rejected_cases.length} over-capacity render cases`);
  console.log(`Covered ${fixedRuleCases.length} fixed-rule Evidence/table cases in native review deck`);
  console.log(`Generated rough_svg review deck: ${roughReviewPptx}`);
  console.log(`Generated ppt_native review deck: ${nativeReviewPptx}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
