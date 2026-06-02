"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const pptxgen = require("pptxgenjs");
const {
  createHuaweiDeck,
  repairPptxForPowerPointCom,
} = require("../../pptx/hw_pptx_helpers");
const {
  createVisualAnchorImage,
  renderVisualAnchorPptNative,
  resolveVisualAnchorRenderPath,
} = require("../../pptx/hw_diagram_helpers");
const { ANCHOR_ELIGIBILITY } = require("../../pptx/contracts/visual_templates");
const { defaultVisualSpecFor, officialDrawRows } = require("../../pptx/dsl/component_registry");
const { compileSlideDsl } = require("../../pptx/dsl/compile_slide_dsl");
const { parseSlideBodyDsl } = require("../../pptx/dsl/jsx_dsl");
const { cases } = require("../fixtures/visual_diagram_test_cases");

const ShapeType = pptxgen.ShapeType || { rect: "rect", line: "line" };
const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "dsl_draw_matrix");
const SOURCE_DIR = path.join(OUT_DIR, "sources");
const SOURCE_PPTX = path.join(OUT_DIR, "dsl_draw_matrix_source.pptx");
const PPTX_OUT = path.join(OUT_DIR, "dsl_draw_matrix.pptx");
const FULL_REVIEW_PPTX = path.join(OUT_DIR, "dsl_draw_matrix_full_review.pptx");
const MANIFEST_OUT = path.join(OUT_DIR, "dsl_draw_matrix_manifest.json");
const RAW_MEASUREMENT_OUT = path.join(OUT_DIR, "dsl_draw_matrix_com_measurement.json");
const COMPILE_OUT = path.join(OUT_DIR, "dsl_draw_compile_report.json");
const MEASURE_OUT = path.join(OUT_DIR, "dsl_draw_measurement_report.json");
const PT_PER_IN = 72;
const GREEN = "00A651";
const REVIEW_TIERS = Object.freeze([
  { tier: "large", label: "偏分栏大图", realLayout: "BiasedColumn", supportingLayout: "BiasedColumn", area: { x: 0.45, y: 1.22, w: 9.18, h: 5.3 } },
  { tier: "medium", label: "二/三分栏中图", realLayout: "TwoColumn", supportingLayout: "ThreeColumn", area: { x: 0.45, y: 1.22, w: 6.12, h: 5.3 } },
  { tier: "small", label: "三/四分栏小图", realLayout: "ThreeColumn", supportingLayout: "FourColumn", area: { x: 0.45, y: 1.22, w: 4.08, h: 5.3 } },
]);

async function main() {
  cleanOutputDir();
  writeCompanionEvidence();

  const drawRows = officialDrawRows();
  const drawIds = drawRows.map((row) => drawId(row));
  const drawSet = new Set(drawIds);
  const fixtureGroups = groupCasesByDraw(cases.filter((item) => drawSet.has(drawId(item))));
  drawRows.forEach((row) => {
    if (!fixtureGroups.has(drawId(row))) {
      fixtureGroups.set(drawId(row), [buildRegistryDefaultCase(row)]);
    }
  });
  const allDrawCases = [...fixtureGroups.values()].flat();

  const compileRows = [];
  for (const spec of allDrawCases) {
    const row = drawRows.find((candidate) => drawId(candidate) === drawId(spec));
    for (const tier of REVIEW_TIERS) {
      const fixture = buildDrawFixture(spec, row, tier);
      const parsed = parseSlideBodyDsl(fixture.markup, fixture.scope);
      const result = compileSlideDsl(parsed.bodyDsl, { throwOnError: false });
      assert.equal(
        result.ok,
        true,
        `${drawId(spec)} ${tier.tier} fixture should compile through Body DSL: ${result.feedbackIssues.map((issue) => issue.message).join("; ")}`
      );
      compileRows.push({
        id: spec.id,
        draw: drawId(spec),
        tier: tier.tier,
        tierLabel: tier.label,
        area: tier.area,
        layoutTag: fixture.layoutTag,
        anchorEligibility: row.anchorEligibility,
        renderer: row.renderer,
        componentId: fixture.componentId,
        markup: fixture.markup,
        renderModel: compactRenderModel(result.renderModel),
        primitive: extractDrawPrimitive(result.renderModel, fixture.componentId),
        feedbackIssues: result.feedbackIssues,
      });
    }
  }
  fs.writeFileSync(COMPILE_OUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    source_fixture: "scripts/smoke/fixtures/visual_diagram_test_cases.js",
    draw_count: drawIds.length,
    source_case_count: allDrawCases.length,
    tier_count: REVIEW_TIERS.length,
    compiled_case_count: compileRows.length,
    rows: compileRows,
  }, null, 2), "utf8");

  const renderedRows = compileRows.map((row) => renderPreflight(row));

  const renderedCount = renderedRows.filter((row) => row.status === "rendered").length;
  const rejectedCount = renderedRows.filter((row) => row.status === "rejected").length;
  const coverageByDraw = drawRows.map((row) => {
    const rows = renderedRows.filter((entry) => entry.draw === drawId(row));
    return {
      draw: drawId(row),
      source_case_count: fixtureGroups.get(drawId(row)).length,
      rendered_count: rows.filter((entry) => entry.status === "rendered").length,
      rejected_count: rows.filter((entry) => entry.status === "rejected").length,
      tiers: Object.fromEntries(REVIEW_TIERS.map((tier) => [
        tier.tier,
        rows.filter((entry) => entry.tier === tier.tier).reduce((acc, entry) => {
          acc[entry.status] = (acc[entry.status] || 0) + 1;
          return acc;
        }, {}),
      ])),
    };
  });
  const missingRenderedDraws = coverageByDraw.filter((entry) => entry.rendered_count === 0).map((entry) => entry.draw);
  assert.deepStrictEqual(missingRenderedDraws, [], "every official draw id must have at least one rendered DSL review slide");

  fs.writeFileSync(path.join(OUT_DIR, "dsl_draw_render_coverage.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    source_case_count: allDrawCases.length,
    tier_count: REVIEW_TIERS.length,
    attempted_case_count: renderedRows.length,
    rendered_count: renderedCount,
    rejected_count: rejectedCount,
    coverage_by_draw: coverageByDraw,
    rejected_rows: renderedRows.filter((row) => row.status === "rejected"),
  }, null, 2), "utf8");

  const fullReview = createHuaweiDeck({ title: "DSL Draw Matrix Full Review" });
  renderedRows.forEach((row) => renderReviewSlide(fullReview, row));
  await fullReview.writeFile({ fileName: FULL_REVIEW_PPTX });
  await repairPptxForPowerPointCom(FULL_REVIEW_PPTX);

  const measurementSentinels = selectMeasurementSentinels(renderedRows);
  const sourcePptx = createHuaweiDeck({ title: "DSL Draw Matrix Measurement Source" });
  const measuredSourceRows = measurementSentinels.map((row) => renderSourceSlide(sourcePptx, row));
  await sourcePptx.writeFile({ fileName: SOURCE_PPTX });
  await repairPptxForPowerPointCom(SOURCE_PPTX);
  const rawMeasurement = readMeasurement();

  const measurementRows = measuredSourceRows.map((row) => measurementRowForDraw(row, rawMeasurement));
  fs.writeFileSync(MEASURE_OUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    source_pptx: relativePath(SOURCE_PPTX),
    review_pptx: relativePath(PPTX_OUT),
    full_review_pptx: relativePath(FULL_REVIEW_PPTX),
    raw_measurement: relativePath(RAW_MEASUREMENT_OUT),
    attempted_case_count: renderedRows.length,
    rendered_count: renderedCount,
    rejected_count: rejectedCount,
    measured_sentinel_count: measurementRows.length,
    measurement_call_count: 1,
    rows: measurementRows,
  }, null, 2), "utf8");

  const pptx = createHuaweiDeck({ title: "DSL Draw Matrix Review" });
  measurementRows.forEach((row) => renderReviewSlide(pptx, row));
  const manifest = writeVisualAnchorManifest(pptx, MANIFEST_OUT, measurementRows);
  await pptx.writeFile({ fileName: PPTX_OUT });
  await repairPptxForPowerPointCom(PPTX_OUT);

  console.log(`DSL draw matrix passed: ${drawIds.length} draw ids, ${compileRows.length} compiled fixtures, ${renderedCount} rendered scenarios, ${rejectedCount} rejected scenarios, ${PPTX_OUT}`);
}

function buildDrawFixture(spec, row, tier) {
  const componentId = `draw_${safeId(spec.kind)}_${safeId(spec.template)}_${safeId(spec.id)}_${tier.tier}`;
  const layoutTag = row.anchorEligibility === ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT ? tier.supportingLayout : tier.realLayout;
  const source = { path: relativePath(path.join(SOURCE_DIR, "companion_evidence.svg")), caption: "DSL draw matrix companion evidence" };
  const scope = {
    source,
    model: spec.visual_spec || {},
    textBody: [
      `draw=${drawId(spec)}`,
      `renderer=${row.renderer}`,
      `budget=${tier.label}`,
      "该页通过 Body DSL 编译、测量并进入 review deck。",
    ],
  };
  const visual = `<Visual id="${componentId}" title="${escapeAttr(spec.title || spec.id)}" claim="${escapeAttr(spec.claim || "DSL draw fixture")}" draw="${drawId(spec)}" model={model} />`;
  const evidence = `<EvidenceFigure id="${componentId}_evidence" title="配套证据" claim="支撑组件页仍需要真实证据锚点。" source={source} fit="contain" />`;
  const markup = row.anchorEligibility === ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT
    ? `<Slide title="DSL Draw：${drawId(spec)}">
  <${layoutTag}>
    <Module title="证据">
      ${evidence}
    </Module>
    <Module title="绘图">
      ${visual}
    </Module>
    <Module title="说明">
      <InsightText body={textBody} maxLines={4} />
    </Module>
    ${layoutTag === "FourColumn" ? `<Module title="检查">
      <InsightText body={textBody} maxLines={3} />
    </Module>` : ""}
  </${layoutTag}>
</Slide>`
    : `<Slide title="DSL Draw：${drawId(spec)}">
  <${layoutTag}>
    <Module title="绘图">
      ${visual}
    </Module>
    <Module title="说明">
      <InsightText body={textBody} maxLines={4} />
    </Module>
    ${layoutTag === "ThreeColumn" ? `<Module title="检查">
      <InsightText body={textBody} maxLines={3} />
    </Module>` : ""}
  </${layoutTag}>
</Slide>`;
  const parsed = parseSlideBodyDsl(markup, scope);
  return {
    componentId,
    layoutTag,
    markup,
    scope,
    bodyDsl: parsed.bodyDsl,
  };
}

function addRejectedSlide(pptx, row, error) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  slide.addText(`DSL Draw Rejected：${row.draw}`, {
    x: 0.45,
    y: 0.34,
    w: 12.2,
    h: 0.38,
    fontFace: "Microsoft YaHei",
    fontSize: 18,
    bold: true,
    color: "C00000",
    margin: 0,
    fit: "shrink",
  });
  slide.addText(`${row.id} · ${row.tierLabel} · ${row.layoutTag}`, {
    x: 0.45,
    y: 0.84,
    w: 12.2,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 10,
    color: "595959",
    margin: 0,
    fit: "shrink",
  });
  slide.addShape(ShapeType.rect, {
    x: 0.8,
    y: 1.45,
    w: 11.75,
    h: 4.6,
    fill: { color: "FFF1EF" },
    line: { color: "C00000", width: 1 },
  });
  slide.addText("Rejected by DSL render/layout capacity guard", {
    x: 1.08,
    y: 1.78,
    w: 11.15,
    h: 0.3,
    fontFace: "Microsoft YaHei",
    fontSize: 16,
    bold: true,
    color: "C00000",
    margin: 0,
  });
  slide.addText(String(error.message || error), {
    x: 1.08,
    y: 2.25,
    w: 11.15,
    h: 2.55,
    fontFace: "Microsoft YaHei",
    fontSize: 11,
    color: "333333",
    margin: 0.02,
    fit: "shrink",
    breakLine: false,
  });
  slide.addText("该页保留在 review deck 中，表示 DSL 编译通过，但当前内容密度超过该版面预算。", {
    x: 1.08,
    y: 5.18,
    w: 11.15,
    h: 0.24,
    fontFace: "Microsoft YaHei",
    fontSize: 10,
    color: "595959",
    margin: 0,
    fit: "shrink",
  });
}

function renderPreflight(row) {
  try {
    const visualSpec = row.primitive.visual_anchor || row.primitive.component;
    const renderPath = resolveVisualAnchorRenderPath(visualSpec);
    if (renderPath === "rough_svg") {
      createVisualAnchorImage(visualSpec, {
        width: row.tier === "large" ? 1400 : row.tier === "medium" ? 1100 : 860,
        sizeTier: row.tier,
      });
    } else {
      const pptx = new pptxgen();
      pptx.layout = "LAYOUT_WIDE";
      renderVisualAnchorPptNative(pptx.addSlide(), visualSpec, row.area);
    }
    return {
      ...row,
      status: "rendered",
      visualSpec,
      renderResult: { renderer: renderPath, rendered: true },
    };
  } catch (error) {
    if (!isExpectedRenderRejection(error)) throw error;
    return { ...row, status: "rejected", reason: error.message };
  }
}

function renderSourceSlide(pptx, row) {
  try {
    const visualSpec = row.primitive.visual_anchor || row.primitive.component;
    const renderPath = resolveVisualAnchorRenderPath(visualSpec);
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addMeasurementMarker(slide, row.componentId);
    let renderResult = null;
    if (renderPath === "rough_svg") {
      const image = createVisualAnchorImage(visualSpec, {
        width: row.tier === "large" ? 1400 : row.tier === "medium" ? 1100 : 860,
        sizeTier: row.tier,
      });
      const imageArea = fitAreaContain(row.area, image.width, image.height);
      slide.addImage({
        data: `data:${image.mimeType};base64,${Buffer.from(image.svg, "utf8").toString("base64")}`,
        ...imageArea,
      });
      renderResult = {
        renderer: renderPath,
        rendered: true,
        image_format: image.format,
        image_width: image.width,
        image_height: image.height,
        image_area: imageArea,
      };
    } else {
      renderResult = {
        renderer: renderPath,
        rendered: true,
        ...(renderVisualAnchorPptNative(slide, visualSpec, row.area) || {}),
      };
    }
    return {
      ...row,
      status: "rendered",
      visualSpec,
      renderResult,
    };
  } catch (error) {
    if (!isExpectedRenderRejection(error)) throw error;
    const rejected = { ...row, status: "rejected", reason: error.message };
    addRejectedSlide(pptx, rejected, error);
    return rejected;
  }
}

function selectMeasurementSentinels(rows) {
  const selected = [];
  const seen = new Set();
  for (const row of rows) {
    if (row.status !== "rendered") continue;
    const key = `${row.draw}|${row.tier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(row);
  }
  const expected = new Set(officialDrawRows().flatMap((row) => REVIEW_TIERS.map((tier) => `${drawId(row)}|${tier.tier}`)));
  const missing = [...expected].filter((key) => !seen.has(key));
  assert.deepStrictEqual(missing, [], "COM measurement sentinels must cover every draw id and tier");
  return selected;
}

function renderReviewSlide(pptx, row) {
  if (row.status !== "rendered") {
    addRejectedSlide(pptx, row, new Error(row.reason || "Rejected by render capacity guard."));
    return;
  }
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addReviewHeader(slide, row);
  const visualSpec = row.primitive.visual_anchor || row.primitive.component;
  const renderPath = resolveVisualAnchorRenderPath(visualSpec);
  if (renderPath === "rough_svg") {
    const image = createVisualAnchorImage(visualSpec, {
      width: row.tier === "large" ? 1400 : row.tier === "medium" ? 1100 : 860,
      sizeTier: row.tier,
    });
    const imageArea = fitAreaContain(row.area, image.width, image.height);
    slide.addImage({
      data: `data:${image.mimeType};base64,${Buffer.from(image.svg, "utf8").toString("base64")}`,
      ...imageArea,
    });
  } else {
    renderVisualAnchorPptNative(slide, visualSpec, row.area);
  }
  if (row.comActual) drawComFrame(slide, row.comActual);
  addReviewFooter(slide, row);
}

function addMeasurementMarker(slide, id) {
  slide.addText(`MEASURE_ID:${id}`, {
    x: 0.05,
    y: 0.05,
    w: 2.4,
    h: 0.14,
    fontFace: "Arial",
    fontSize: 7,
    color: "FFFFFF",
    margin: 0,
  });
}

function addReviewHeader(slide, row) {
  slide.addText(`DSL Draw：${row.draw}`, {
    x: 0.45,
    y: 0.3,
    w: 12.25,
    h: 0.34,
    fontFace: "Microsoft YaHei",
    fontSize: 18,
    bold: true,
    color: "C00000",
    margin: 0,
    fit: "shrink",
  });
  slide.addShape(ShapeType.line, {
    x: 0.45,
    y: 0.78,
    w: 12.25,
    h: 0,
    line: { color: "C00000", width: 1.1 },
  });
  slide.addText(`${row.id} · ${row.tierLabel} · ${row.layoutTag} · DSL compiled primitive`, {
    x: 0.45,
    y: 0.88,
    w: 12.25,
    h: 0.22,
    fontFace: "Arial",
    fontSize: 10,
    color: "595959",
    margin: 0,
    fit: "shrink",
  });
}

function addReviewFooter(slide, row) {
  slide.addText(`<Visual draw="${row.draw}" model={model} />`, {
    x: row.area.x,
    y: 6.9,
    w: Math.max(row.area.w, 4.0),
    h: 0.18,
    fontFace: "Arial",
    fontSize: 9,
    color: "595959",
    margin: 0,
    fit: "shrink",
  });
}

function extractDrawPrimitive(renderModel, componentId) {
  const primitive = renderModel.modules
    .flatMap((module) => module.componentPrimitives || [])
    .find((item) => {
      const spec = item.visual_anchor || item.component;
      return spec?.id === componentId;
    });
  assert(primitive, `${componentId} should compile to a render primitive`);
  return primitive;
}

function writeVisualAnchorManifest(_pptx, fileName, rows = []) {
  const manifest = {
    generated_at: new Date().toISOString(),
    source: "Body DSL draw matrix",
    slides: rows.map((row, idx) => ({
      page: idx + 1,
      visual_component_id: row.componentId,
      kind: row.draw.split("/")[0],
      template: row.draw.split("/")[1],
      visual_role: row.anchorEligibility === ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT ? "supporting_component" : "visual_anchor",
      renderer: row.renderResult?.renderer || row.renderer,
      rendered: row.status === "rendered",
      status: row.status,
      reason: row.reason,
      id: row.id,
      tier: row.tier,
      layout_tag: row.layoutTag,
      image_width: row.renderResult?.image_width,
      image_height: row.renderResult?.image_height,
      image_area: row.renderResult?.image_area,
      visual_slot: row.area,
      com_actual_area: row.comActual,
      dsl_markup: row.markup,
    })),
  };
  fs.writeFileSync(fileName, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

function isExpectedRenderRejection(error) {
  return /infeasible|text exceeds|supports at most|below the \d+px minimum|font size|capacity guard/i.test(String(error?.message || error));
}

function measurementRowForDraw(row, measurement) {
  if (row.status !== "rendered") return { ...row, measurementStatus: "render_rejected", comActual: null };
  const slide = measurement.slides.find((entry) => entry.measurement_id === row.componentId);
  assert(slide, `${row.componentId} should exist in one-shot COM measurement manifest`);
  const bounds = visualUnionBounds(targetShapes(slide));
  const comActual = boundsToInches(bounds);
  assert(comActual.w > 0 && comActual.h > 0, `${row.componentId} should have positive COM bounds`);
  return {
    ...row,
    measurementStatus: "measured",
    comActual,
    measure: {
      actual_size: roundSize(comActual),
      slot_size: roundSize({ w: row.area.w, h: row.area.h }),
      overhang: classifyBounds(areaToBounds(comActual), areaToBounds(row.area)),
    },
    finalSize: roundSize({ w: row.area.w, h: row.area.h }),
  };
}

function groupCasesByDraw(inputCases) {
  const groups = new Map();
  inputCases.forEach((spec) => {
    const id = drawId(spec);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(spec);
  });
  return groups;
}

function buildRegistryDefaultCase(row) {
  return {
    id: `registry_default_${safeId(row.kind)}_${safeId(row.template)}`,
    title: `registry_default_${drawId(row)}`,
    kind: row.kind,
    template: row.template,
    claim: "Registry default model fills an official draw fixture gap.",
    layout: "16:9",
    visual_spec: defaultVisualSpecFor(row),
    generated_from_registry_default: true,
  };
}

function compactRenderModel(model) {
  return {
    type: model.type,
    reference: model.reference,
    source: model.source,
    modules: model.modules.map((module) => ({
      role: module.role,
      title: module.title,
      componentPrimitives: module.componentPrimitives.map((primitive) => ({
        type: primitive.type,
        kind: primitive.visual_anchor?.kind || primitive.component?.kind,
        template: primitive.visual_anchor?.template || primitive.component?.template,
        sourceComponent: primitive.sourceComponent,
      })),
    })),
  };
}

function writeCompanionEvidence() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SOURCE_DIR, "companion_evidence.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#fff"/>
  <rect x="48" y="62" width="864" height="328" fill="#f7f7f7" stroke="#c00000" stroke-width="8"/>
  <path d="M120 330 L260 238 L410 278 L560 168 L740 238 L850 132" fill="none" stroke="#c00000" stroke-width="10"/>
  <circle cx="260" cy="238" r="16" fill="#c00000"/>
  <circle cx="560" cy="168" r="16" fill="#c00000"/>
  <circle cx="850" cy="132" r="16" fill="#c00000"/>
  <text x="480" y="458" text-anchor="middle" font-size="38" font-family="Microsoft YaHei" fill="#333">DSL Draw Companion Evidence</text>
</svg>`, "utf8");
}

function cleanOutputDir() {
  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function drawId(value) {
  return `${value.kind}/${value.template}`;
}

function safeId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "unknown";
}

function escapeAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function relativePath(fileName) {
  return path.relative(ROOT, fileName).replace(/\\/g, "/");
}

function readMeasurement() {
  const result = spawnSync("node", [
    "scripts/pptx/measure_pptx_layout.js",
    relativePath(SOURCE_PPTX),
    "--out",
    relativePath(RAW_MEASUREMENT_OUT),
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 240000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`measure_pptx_layout.js failed with ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return JSON.parse(fs.readFileSync(RAW_MEASUREMENT_OUT, "utf8"));
}

function targetShapes(slide) {
  return (slide.shapes || []).filter((shape) => !String(shape.text || "").includes("MEASURE_ID:"));
}

function visualUnionBounds(shapes) {
  const bounds = shapes.map((shape) => visualShapeBounds(shape)).filter(Boolean);
  assert(bounds.length > 0, "expected at least one measured visual bound");
  return unionBounds(bounds);
}

function visualShapeBounds(shape) {
  const hasVisibleBox = Boolean(shape.fill_visible || shape.line_visible);
  const hasTextBounds = shape.has_text
    && Number(shape.bound_width) > 0
    && Number(shape.bound_height) > 0;
  if (shape.has_text && hasTextBounds && !hasVisibleBox) {
    return {
      left: Number(shape.bound_left),
      top: Number(shape.bound_top),
      width: Number(shape.bound_width),
      height: Number(shape.bound_height),
    };
  }
  if (Number(shape.width) > 0 && Number(shape.height) > 0) {
    return {
      left: Number(shape.left),
      top: Number(shape.top),
      width: Number(shape.width),
      height: Number(shape.height),
    };
  }
  if (hasTextBounds) {
    return {
      left: Number(shape.bound_left),
      top: Number(shape.bound_top),
      width: Number(shape.bound_width),
      height: Number(shape.bound_height),
    };
  }
  return null;
}

function unionBounds(items) {
  const real = items.filter((item) => Number(item.width) > 0 && Number(item.height) > 0);
  assert(real.length > 0, "expected at least one non-empty measured shape");
  const left = Math.min(...real.map((item) => item.left));
  const top = Math.min(...real.map((item) => item.top));
  const right = Math.max(...real.map((item) => item.left + item.width));
  const bottom = Math.max(...real.map((item) => item.top + item.height));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function boundsToInches(bounds) {
  return {
    x: round(bounds.left / PT_PER_IN),
    y: round(bounds.top / PT_PER_IN),
    w: round(bounds.width / PT_PER_IN),
    h: round(bounds.height / PT_PER_IN),
  };
}

function areaToBounds(area) {
  return {
    left: Number(area.x || 0) * PT_PER_IN,
    top: Number(area.y || 0) * PT_PER_IN,
    right: (Number(area.x || 0) + Number(area.w || 0)) * PT_PER_IN,
    bottom: (Number(area.y || 0) + Number(area.h || 0)) * PT_PER_IN,
  };
}

function classifyBounds(bounds, slotBounds, tolerancePt = 8) {
  return bounds.left < slotBounds.left - tolerancePt
    || bounds.top < slotBounds.top - tolerancePt
    || bounds.right > slotBounds.right + tolerancePt
    || bounds.bottom > slotBounds.bottom + tolerancePt;
}

function drawComFrame(slide, area) {
  slide.addShape(ShapeType.rect, {
    ...area,
    fill: { color: "FFFFFF", transparency: 100 },
    line: { color: GREEN, width: 1.8 },
  });
  slide.addText("COM actual", {
    x: area.x,
    y: area.y + area.h + 0.03,
    w: Math.max(0.9, area.w),
    h: 0.14,
    fontFace: "Arial",
    fontSize: 6.5,
    color: GREEN,
    bold: true,
    margin: 0,
    fit: "shrink",
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

function roundSize(size = {}) {
  return {
    w: Number(Number(size.w || 0).toFixed(3)),
    h: Number(Number(size.h || 0).toFixed(3)),
  };
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
