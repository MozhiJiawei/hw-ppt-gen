const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const pptxgen = require("pptxgenjs");

const {
  createHuaweiDeck,
  repairPptxForPowerPointCom,
  textBox,
} = require("../../pptx/hw_pptx_helpers");
const {
  createVisualAnchorImage,
  renderVisualAnchorPptNative,
  resolveVisualAnchorRenderPath,
  TEMPLATE_RENDERERS,
} = require("../../pptx/hw_diagram_helpers");
const { requestPowerPointBroker } = require("../../pptx/powerpoint_com_broker");
const {
  MEASURE_SUPPORT,
  VISUAL_ANCHOR_TAXONOMY,
} = require("../../pptx/layout/content_body_taxonomy");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "com_measurement_quality_guard");
const SOURCE_PPTX = path.join(OUT_DIR, "com_measurement_quality_guard_source.pptx");
const MEASUREMENT = path.join(OUT_DIR, "com_measurement_quality_guard.json");
const PROOF_PPTX = path.join(OUT_DIR, "com_measurement_quality_guard_review.pptx");
const ShapeType = pptxgen.ShapeType || { rect: "rect", line: "line" };
const PT_PER_IN = 72;
const SLOT = { x: 1, y: 1, w: 5.1, h: 3.35 };
const GREEN = "00A651";
const GRAY = "A6A6A6";
const RED = "C00000";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout;
}

async function requirePowerPointCom() {
  if (process.platform !== "win32") throw new Error("PowerPoint measurement quality guard requires Windows.");
  await requestPowerPointBroker("ping", {}, { timeoutMs: 30000 });
}

async function main() {
  await requirePowerPointCom();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sourceFiles = writeEvidenceSources();
  const cases = buildMeasurementCases(sourceFiles);

  await buildSourceDeck(cases);
  const manifest = readMeasurement();
  const results = analyzeManifest(cases, manifest);
  await buildProofDeck(cases, results);

  const report = {
    generated_at: new Date().toISOString(),
    renderer: manifest.renderer,
    source_pptx: SOURCE_PPTX,
    proof_pptx: PROOF_PPTX,
    measurement_manifest: MEASUREMENT,
    case_count: results.length,
    cases: results.map((result) => ({
      id: result.id,
      family: result.family,
      kind: result.kind,
      template: result.template,
      render_path: result.renderPath,
      shape_count: result.shapeCount,
      slot_in: result.slot,
      com_actual_in: result.actual,
      text_range: result.textRange || null,
      status: result.status,
    })),
  };
  fs.writeFileSync(path.join(OUT_DIR, "com_measurement_quality_guard_report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(`PowerPoint COM measurement quality guard passed: ${results.length} cases`);
  console.log(`Measurement manifest: ${MEASUREMENT}`);
  console.log(`Review PPTX: ${PROOF_PPTX}`);
}

function writeEvidenceSources() {
  return {
    figure: path.join(ROOT, "assets", "slides_ref", "05 内容 二分栏.png"),
    screenshot: path.join(ROOT, "assets", "slides_ref", "08 内容 四分栏.png"),
    chart: path.join(ROOT, "assets", "slides_ref", "04 手绘图 柱状图.png"),
    table: path.join(ROOT, "assets", "slides_ref", "07 内容 三分栏.png"),
  };
}

function buildMeasurementCases(sourceFiles) {
  const cases = new Map();
  const add = (entry) => {
    if (cases.has(entry.id)) throw new Error(`Duplicate COM measurement guard case id: ${entry.id}`);
    cases.set(entry.id, entry);
  };

  [
    textCase("text_short_bullets", [
      "收益口径：T/NFE 是平均推进长度。",
      "关键转化：batch=1 实测才到 4.71x/5.91x。",
    ]),
    textCase("text_long_wrapped_cn", [
      "共同点：都用主模型能力提高 draft 质量，突破小模型 drafter 接受率瓶颈。",
      "差异点：TiDAR 不是预测未来 token，而是把下一批草稿压进同一次 forward。",
      "落地边界：先复现 1.5B，再评估 8B 投入。",
    ]),
    textCase("text_mixed_latin_numbers", [
      "TiDAR: diffusion pre-draft + AR sampling + exact KV cache.",
      "Metric: 7.45 / 8.25 tokens, 4.71x / 5.91x throughput.",
    ]),
  ].forEach(add);

  for (const key of measuredTaxonomyKeys()) {
    add(caseForTaxonomyKey(key, sourceFiles));
  }

  [
    kpiCase("variant_quantity_data_cards_four_long", [
      { id: "a", label: "平均推进长度", value: "7.45", unit: "token" },
      { id: "b", label: "8B接收长度", value: "8.25", unit: "token" },
      { id: "c", label: "batch=1吞吐", value: "5.91x" },
      { id: "d", label: "H100复现实测", value: "b=1" },
    ]),
    tableCase("variant_matrix_table_wrapped", [
      ["组件", "当前问题", "重构后规则"],
      ["文本框", "预估高度容易和 PowerPoint 实际换行不一致", "TextRange2 BoundHeight 读回"],
      ["证据图", "保持来源图比例和可读地板", "COM 读 shape union"],
      ["表格", "列宽导致行高变化", "native table 实测"],
    ]),
    visualCase("variant_sequence_process_vertical", visualSpec("Sequence", "process", {
      steps: steps("vp", ["调研输入", "生成页面", "COM测量", "布局收敛"], "vp4"),
      orientation: "vertical",
      highlight: "vp3",
    })),
  ].forEach(add);

  assertGuardCoverage([...cases.values()]);
  return [...cases.values()].map((entry, index) => ({ ...entry, ordinal: index + 1 }));
}

function measuredTaxonomyKeys() {
  return Object.entries(VISUAL_ANCHOR_TAXONOMY)
    .filter(([, entry]) => entry.measureSupport === MEASURE_SUPPORT.MEASURED)
    .map(([key]) => key)
    .sort();
}

function assertGuardCoverage(cases) {
  const covered = new Set(cases.filter((item) => item.kind !== "Text").map((item) => `${item.kind}/${item.template}`));
  const missingTaxonomy = measuredTaxonomyKeys().filter((key) => !covered.has(key));
  assert.deepStrictEqual(missingTaxonomy, [], "COM measurement guard must cover every measured taxonomy component");

  const taxonomyTemplates = new Set(Object.keys(VISUAL_ANCHOR_TAXONOMY).map((key) => key.split("/")[1]));
  const missingRenderer = Object.keys(TEMPLATE_RENDERERS)
    .filter((template) => taxonomyTemplates.has(template))
    .filter((template) => !cases.some((item) => item.template === template));
  assert.deepStrictEqual(missingRenderer, [], "COM measurement guard must cover every implemented visual renderer template");
}

function caseForTaxonomyKey(key, sourceFiles) {
  const [kind, template] = key.split("/");
  if (kind === "Evidence") {
    return evidenceCase(`component_${safeId(key)}`, template, sourceFiles[evidenceSourceKey(template)], `真实 ${template} source image。`);
  }
  if (template === "data_cards") {
    return kpiCase(`component_${safeId(key)}`, [
      { id: "a", label: "1.5B接收", value: "7.45" },
      { id: "b", label: "8B接收", value: "8.25" },
      { id: "c", label: "真实吞吐", value: "4.71/5.91x" },
    ]);
  }
  if (template === "table") {
    return tableCase(`component_${safeId(key)}`, [
      ["项", "口径", "判断"],
      ["收益", "7.45/8.25 token", "平均推进长度"],
      ["转化", "4.71x/5.91x", "batch=1 实测"],
      ["边界", "H100 b=1", "先复现再投入"],
    ]);
  }
  return visualCase(`component_${safeId(key)}`, visualSpec(kind, template, visualSpecPayload(template)));
}

function evidenceSourceKey(template) {
  return ({
    source_figure: "figure",
    source_chart: "chart",
  })[template] || "figure";
}

function visualSpec(kind, template, visual_spec) {
  return {
    id: `${safeId(kind)}_${safeId(template)}`,
    title: `${kind}/${template}`,
    claim: `${kind}/${template} real renderer input.`,
    kind,
    template,
    visual_spec,
  };
}

function visualSpecPayload(template) {
  const payloads = {
    bar_chart: {
      y_label: "Score",
      categories: ["Q1", "Q2职责清晰", "Q3统一调度"],
      series: [
        { name: "系列1职责清晰", values: [10, 12, 14] },
        { name: "系列2统一调度", values: [14, 17, 20] },
      ],
      highlight: { category: "Q3统一调度", series: "系列2统一调度" },
    },
    line_chart: {
      y_label: "Rate",
      categories: ["T1", "T2", "T3", "T4"],
      series: [
        { name: "基线", values: [12, 15, 16, 18] },
        { name: "优化后", values: [14, 17, 21, 24] },
      ],
      highlight: { category: "T4", series: "优化后" },
    },
    proportion_chart: {
      total_label: "结构占比",
      segments: [
        { label: "训练", value: 35 },
        { label: "推理", value: 45 },
        { label: "部署", value: 20 },
      ],
      highlight: "推理",
    },
    heatmap: gridPayload(),
    process: {
      steps: steps("p", ["调研输入", "生成页面", "COM测量", "布局收敛"], "p4"),
      highlight: "p3",
    },
    timeline: {
      steps: steps("tl", ["里程碑1", "里程碑2职责清晰", "里程碑3统一调度"], "tl3")
        .map((step, idx) => ({ ...step, time: `M${idx + 1}` })),
      highlight: "tl3",
    },
    swimlane: {
      lanes: [
        { id: "lane1", label: "角色1", steps: steps("l1s", ["动作1-1", "动作1-2职责清晰"], "l1s2") },
        { id: "lane2", label: "角色2职责清晰", steps: steps("l2s", ["动作2-1职责清晰", "动作2-2统一调度"], "l2s2") },
      ],
      highlight: "l2s2",
    },
    closed_loop: {
      center: "反馈闭环",
      steps: steps("cl", ["生成", "验证", "修正", "沉淀"], "cl3"),
      highlight: "cl3",
    },
    dual_loop: {
      loops: [
        { id: "outer", label: "外环策略", steps: steps("o", ["规划", "复盘"], "o2") },
        { id: "inner", label: "内环执行", steps: steps("i", ["生成", "校验", "修复"], "i2") },
      ],
      highlight: "inner",
    },
    spiral_iteration_ladder: {
      center: "能力爬升",
      steps: steps("sp", ["复现", "测量", "优化", "固化"], "sp4"),
      highlight: "sp3",
    },
    tree: {
      nodes: ["root", "layout", "measure", "render", "qa"],
      edges: [["root", "layout"], ["root", "measure"], ["layout", "render"], ["measure", "qa"]],
      labels: { root: "主路径", layout: "排版层", measure: "COM测量", render: "渲染", qa: "QA" },
      highlight: "measure",
    },
    layered_architecture: {
      layers: [
        { id: "l1", label: "输入层", items: ["brief", "assets"] },
        { id: "l2", label: "布局层", items: ["primitive", "measure"] },
        { id: "l3", label: "渲染层", items: ["pptx", "png"] },
      ],
      side_label: "质量",
      side_modules: ["COM broker"],
      edges: [["brief", "primitive"], ["assets", "measure"], ["primitive", "pptx"], ["measure", "png"], ["COM broker", "measure"]],
    },
    capability_stack: {
      levels: [{ label: "基础测量" }, { label: "组件排版" }, { label: "整页收敛" }],
      highlight: "组件排版",
    },
    quadrant_matrix: {
      x_axis: { left: "低收益", right: "高收益", label: "收益" },
      y_axis: { bottom: "低确定", top: "高确定", label: "确定性" },
      items: [
        { label: "复现", x: 0.25, y: 0.75 },
        { label: "重构", x: 0.72, y: 0.58 },
        { label: "冒险", x: 0.65, y: 0.25 },
      ],
      highlight: "重构",
    },
    capability_matrix: gridPayload(),
    hub_spoke_network: {
      hub: { id: "hub", label: "COM broker" },
      nodes: [{ id: "n1", label: "measure" }, { id: "n2", label: "export" }, { id: "n3", label: "QA" }],
      edges: [["hub", "n1"], ["hub", "n2"], ["hub", "n3"]],
      highlight: "n1",
    },
    dependency_graph: networkPayload("模块"),
    module_interaction_map: networkPayload("服务", true),
    causal_influence_graph: networkPayload("因子"),
  };
  const payload = payloads[template];
  if (!payload) throw new Error(`Missing real component payload for template: ${template}`);
  return payload;
}

function steps(prefix, labels, highlight) {
  return labels.map((label, idx) => ({ id: `${prefix}${idx + 1}`, label, highlight }));
}

function gridPayload() {
  return {
    rows: ["训练", "推理", "部署"],
    columns: ["成本", "收益", "风险"],
    values: [[0.2, 0.7, 0.4], [0.5, 0.9, 0.3], [0.6, 0.8, 0.5]],
    highlight: { row: "推理", column: "收益" },
  };
}

function networkPayload(prefix, closed = false) {
  const nodes = ["n1", "n2", "n3", "n4"].map((id, idx) => ({ id, label: `${prefix}${idx + 1}` }));
  const edges = closed
    ? [["n1", "n2"], ["n2", "n3"], ["n3", "n4"], ["n4", "n1"]]
    : [["n1", "n2"], ["n2", "n3"], ["n1", "n4"]];
  return { nodes, edges, highlight: "n3" };
}

function safeId(value) {
  return String(value || "case").replace(/[^\w]+/g, "_").toLowerCase();
}

function textCase(id, lines) {
  return {
    id,
    family: "StructuredText",
    kind: "Text",
    template: "rich_bullet_block",
    renderPath: "text",
    slot: { ...SLOT, w: 4.35, h: 2.35 },
    render: (slide, area) => textBox(slide, lines.map((line) => `- ${line}`).join("\n"), {
      ...area,
      fontSize: 12,
      bold: true,
      color: "333333",
      margin: 0.08,
      lineSpacingMultiple: 1.45,
    }),
  };
}

function evidenceCase(id, template, sourcePath, caption) {
  const spec = {
    id,
    title: id,
    claim: caption,
    kind: "Evidence",
    template,
    source: { path: sourcePath, caption },
  };
  return visualCase(id, spec, { family: "Evidence", slot: { ...SLOT, w: 5.1, h: 3.1 } });
}

function kpiCase(id, cards) {
  return visualCase(id, {
    id,
    title: id,
    claim: "KPI cards COM measurement guard.",
    kind: "Quantity",
    template: "data_cards",
    visual_spec: { cards, highlight: cards[cards.length - 1]?.id },
  }, { family: "Quantity", slot: { ...SLOT, w: 4.85, h: 1.55 } });
}

function tableCase(id, rows) {
  return visualCase(id, {
    id,
    title: id,
    claim: "Native table COM measurement guard.",
    kind: "Matrix",
    template: "table",
    visual_spec: { rows },
  }, { family: "Matrix", slot: { ...SLOT, w: 4.85, h: 3.1 } });
}

function visualCase(id, spec, overrides = {}) {
  return {
    id,
    family: overrides.family || spec.kind,
    kind: spec.kind,
    template: spec.template,
    renderPath: resolveVisualAnchorRenderPath(spec),
    slot: overrides.slot || SLOT,
    spec,
    render: (slide, area) => renderVisual(slide, spec, area),
  };
}

function renderVisual(slide, spec, area) {
  const renderPath = resolveVisualAnchorRenderPath(spec);
  if (renderPath === "rough_svg") {
    const image = createVisualAnchorImage(spec, { width: 1200 });
    const fitted = fitContain(area, image.width, image.height);
    slide.addImage({
      data: `data:${image.mimeType};base64,${Buffer.from(image.svg, "utf8").toString("base64")}`,
      x: fitted.x,
      y: fitted.y,
      w: fitted.w,
      h: fitted.h,
    });
    return;
  }
  renderVisualAnchorPptNative(slide, spec, area);
}

function fitContain(area, sourceW, sourceH) {
  const slotRatio = area.w / area.h;
  const sourceRatio = sourceW / sourceH;
  if (sourceRatio >= slotRatio) {
    const h = area.w / sourceRatio;
    return { x: area.x, y: area.y + (area.h - h) / 2, w: area.w, h };
  }
  const w = area.h * sourceRatio;
  return { x: area.x + (area.w - w) / 2, y: area.y, w, h: area.h };
}

async function buildSourceDeck(cases) {
  const pptx = createHuaweiDeck({
    title: "COM measurement quality guard source",
    subject: "One real component per slide for PowerPoint COM bounds readback",
  });
  for (const testCase of cases) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addMeasurementMarker(slide, testCase.id);
    testCase.render(slide, testCase.slot);
  }
  await pptx.writeFile({ fileName: SOURCE_PPTX });
  await repairPptxForPowerPointCom(SOURCE_PPTX);
}

function addMeasurementMarker(slide, id) {
  textBox(slide, `MEASURE_ID:${id}`, {
    x: 0.05,
    y: 0.05,
    w: 2.2,
    h: 0.14,
    fontSize: 7,
    color: "FFFFFF",
    margin: 0,
  });
}

function readMeasurement() {
  run("node", ["scripts/pptx/measure_pptx_layout.js", path.relative(ROOT, SOURCE_PPTX), "--out", path.relative(ROOT, MEASUREMENT)], { timeout: 240000 });
  return JSON.parse(fs.readFileSync(MEASUREMENT, "utf8"));
}

function analyzeManifest(cases, manifest) {
  assert(
    ["powerpoint_com_measurement", "powerpoint_com_measurement_broker"].includes(manifest.renderer),
    "measurement manifest should be produced by PowerPoint COM"
  );
  assert.equal(manifest.unit, "pt", "measurement manifest should use PowerPoint points");
  const results = cases.map((testCase) => analyzeCase(testCase, manifest));
  const failures = results.filter((result) => !["ok", "overhang"].includes(result.status));
  assert.deepStrictEqual(failures.map((failure) => `${failure.id}: ${failure.status}`), [], "all COM measurement cases must have valid bounds");
  return results;
}

function analyzeCase(testCase, manifest) {
  const slide = slideById(manifest, testCase.id);
  const shapes = targetShapes(slide);
  assert(shapes.length > 0, `${testCase.id} should expose at least one measurable shape`);
  const union = visualUnionBounds(shapes);
  const actual = boundsToInches(union);
  const slotBounds = areaToBounds(testCase.slot);
  const status = classifyBounds(union, slotBounds, testCase.id);
  const textShape = shapes.find((shape) => shape.has_text && Number(shape.bound_width) > 0 && Number(shape.bound_height) > 0);
  const textRange = testCase.renderPath === "text" && textShape
    ? {
        x: round(Number(textShape.bound_left) / PT_PER_IN),
        y: round(Number(textShape.bound_top) / PT_PER_IN),
        w: round(Number(textShape.bound_width) / PT_PER_IN),
        h: round(Number(textShape.bound_height) / PT_PER_IN),
      }
    : null;
  if (testCase.renderPath === "text") {
    assert(textRange, `${testCase.id} should expose TextRange2 bounds`);
    assert(textRange.w > 0 && textRange.h > 0, `${testCase.id} TextRange2 bounds should be positive`);
  }
  return {
    ...testCase,
    actual,
    textRange,
    shapeCount: shapes.length,
    status,
  };
}

function slideById(manifest, id) {
  const slide = manifest.slides.find((entry) => entry.measurement_id === id);
  assert(slide, `measurement slide missing: ${id}`);
  return slide;
}

function isMarkerShape(shape) {
  return String(shape.text || "").includes("MEASURE_ID:");
}

function targetShapes(slide) {
  return (slide.shapes || []).filter((shape) => !isMarkerShape(shape));
}

function visualUnionBounds(shapes) {
  const bounds = shapes
    .map((shape) => visualShapeBounds(shape))
    .filter(Boolean);
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

function unionBounds(shapes) {
  const realShapes = shapes.filter((shape) => Number(shape.width) > 0 && Number(shape.height) > 0);
  assert(realShapes.length > 0, "expected at least one measured shape");
  const left = Math.min(...realShapes.map((shape) => shape.left));
  const top = Math.min(...realShapes.map((shape) => shape.top));
  const right = Math.max(...realShapes.map((shape) => shape.left + shape.width));
  const bottom = Math.max(...realShapes.map((shape) => shape.top + shape.height));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function areaToBounds(area) {
  return {
    left: area.x * PT_PER_IN,
    top: area.y * PT_PER_IN,
    right: (area.x + area.w) * PT_PER_IN,
    bottom: (area.y + area.h) * PT_PER_IN,
  };
}

function classifyBounds(bounds, slotBounds, label, tolerancePt = 8) {
  assert(bounds.width > 4 && bounds.height > 4, `${label} COM bounds should be non-trivial`);
  assert(bounds.left > -PT_PER_IN && bounds.top > -PT_PER_IN, `${label} COM bounds should stay near the slide canvas`);
  assert(bounds.right < 14 * PT_PER_IN && bounds.bottom < 8 * PT_PER_IN, `${label} COM bounds should stay near the slide canvas`);
  const escaped = bounds.left < slotBounds.left - tolerancePt
    || bounds.top < slotBounds.top - tolerancePt
    || bounds.right > slotBounds.right + tolerancePt
    || bounds.bottom > slotBounds.bottom + tolerancePt;
  return escaped ? "overhang" : "ok";
}

function boundsToInches(bounds) {
  return {
    x: round(bounds.left / PT_PER_IN),
    y: round(bounds.top / PT_PER_IN),
    w: round(bounds.width / PT_PER_IN),
    h: round(bounds.height / PT_PER_IN),
  };
}

async function buildProofDeck(cases, results) {
  const pptx = createHuaweiDeck({
    title: "COM measurement quality guard review",
    subject: "Visual proof deck generated from PowerPoint COM readback",
  });
  addProofIntroSlide(pptx, results);
  results.forEach((result) => addProofSingleSlide(pptx, result));
  await pptx.writeFile({ fileName: PROOF_PPTX });
  await repairPptxForPowerPointCom(PROOF_PPTX);
}

function addProofIntroSlide(pptx, results) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  proofTitle(slide, "COM measurement quality guard");
  textBox(slide, "Only the green frame is drawn. It is derived from PowerPoint COM readback; input slots are listed as numbers only.", {
    x: 0.65,
    y: 0.86,
    w: 11.8,
    h: 0.28,
    fontSize: 10,
    color: "595959",
    bold: true,
    margin: 0,
  });
  const byFamily = groupCounts(results, "family");
  const rows = [
    ["scope", `${results.length} real rendered components`],
    ["text", `${byFamily.StructuredText || 0} TextRange2 cases`],
    ["evidence", `${byFamily.Evidence || 0} source image cases`],
    ["quantity", `${byFamily.Quantity || 0} KPI/chart cases`],
    ["sequence", `${byFamily.Sequence || 0} process/timeline/swimlane cases`],
    ["loop", `${byFamily.Loop || 0} loop cases`],
    ["hierarchy", `${byFamily.Hierarchy || 0} hierarchy cases`],
    ["matrix", `${byFamily.Matrix || 0} table/matrix cases`],
    ["network", `${byFamily.Network || 0} network cases`],
  ];
  drawTable(slide, rows, 0.95, 1.45, 5.3, 0.33);
  drawTemplateMatrix(slide, results, 6.65, 1.45);
}

function addProofGridSlide(pptx, results, page) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  proofTitle(slide, `COM actual bounds ${page}`);
  const positions = [
    { x: 0.55, y: 1.05, w: 5.9, h: 2.55 },
    { x: 6.9, y: 1.05, w: 5.9, h: 2.55 },
    { x: 0.55, y: 4.05, w: 5.9, h: 2.55 },
    { x: 6.9, y: 4.05, w: 5.9, h: 2.55 },
  ];
  results.forEach((result, idx) => drawProofTile(slide, result, positions[idx]));
}

function addProofSingleSlide(pptx, result) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  proofTitle(slide, `${result.ordinal}. ${result.kind}/${result.template}`);
  textBox(slide, `${result.renderPath}; COM actual ${result.actual.w} x ${result.actual.h} in; shapes=${result.shapeCount}; status=${result.status}`, {
    x: 0.65,
    y: 0.83,
    w: 7.4,
    h: 0.24,
    fontSize: 9.5,
    color: "595959",
    bold: true,
    margin: 0,
    fit: "shrink",
  });
  result.render(slide, result.slot);
  drawComFrame(slide, result.textRange || result.actual);
  addMeasurementNumbers(slide, result);
}

function addMeasurementNumbers(slide, result) {
  const rows = [
    ["input slot", result.slot],
    ["COM union", result.actual],
  ];
  if (result.textRange) rows.push(["TextRange2", result.textRange]);
  const x = 7.2;
  const y = 1.08;
  rows.forEach(([label, area], idx) => {
    textBox(slide, label, {
      x,
      y: y + idx * 0.42,
      w: 1.0,
      h: 0.26,
      fontSize: 9,
      bold: true,
      color: idx === 0 ? "595959" : GREEN,
      margin: 0,
    });
    textBox(slide, `x=${area.x} y=${area.y} w=${area.w} h=${area.h}`, {
      x: x + 1.05,
      y: y + idx * 0.42,
      w: 4.4,
      h: 0.26,
      fontSize: 9,
      color: "333333",
      margin: 0,
    });
  });
}

function drawProofTile(slide, result, tile) {
  const scale = Math.min(tile.w / SLOT.w, tile.h / SLOT.h);
  const renderArea = {
    x: tile.x + 0.08,
    y: tile.y + 0.42,
    w: result.slot.w * scale,
    h: result.slot.h * scale,
  };
  const dx = renderArea.x - result.slot.x * scale;
  const dy = renderArea.y - result.slot.y * scale;
  const actual = scaleArea(result.textRange || result.actual, scale, dx, dy);

  textBox(slide, `${result.ordinal}. ${result.kind}/${result.template}`, {
    x: tile.x,
    y: tile.y,
    w: tile.w,
    h: 0.22,
    fontSize: 9.5,
    bold: true,
    color: RED,
    margin: 0,
    fit: "shrink",
  });
  textBox(slide, `${result.renderPath}; COM ${result.actual.w} x ${result.actual.h} in; shapes=${result.shapeCount}`, {
    x: tile.x,
    y: tile.y + 0.22,
    w: tile.w,
    h: 0.18,
    fontSize: 7.5,
    color: "595959",
    margin: 0,
    fit: "shrink",
  });

  result.render(slide, renderArea);
  drawComFrame(slide, actual);
}

function scaleArea(area, scale, dx, dy) {
  return {
    x: area.x * scale + dx,
    y: area.y * scale + dy,
    w: area.w * scale,
    h: area.h * scale,
  };
}

function drawComFrame(slide, area) {
  slide.addShape(ShapeType.rect, {
    ...area,
    fill: { color: "FFFFFF", transparency: 100 },
    line: { color: GREEN, width: 1.8 },
  });
  textBox(slide, "COM actual", {
    x: area.x,
    y: area.y + area.h + 0.03,
    w: Math.max(0.8, area.w),
    h: 0.14,
    fontSize: 6.5,
    color: GREEN,
    bold: true,
    margin: 0,
    fit: "shrink",
  });
}

function proofTitle(slide, title) {
  textBox(slide, title, {
    x: 0.55,
    y: 0.25,
    w: 12.2,
    h: 0.38,
    fontSize: 20,
    bold: true,
    color: RED,
    margin: 0,
  });
  slide.addShape(ShapeType.line, { x: 0.55, y: 0.74, w: 12.2, h: 0, line: { color: RED, width: 0.6 } });
}

function drawTable(slide, rows, x, y, w, rowH) {
  rows.forEach((row, idx) => {
    const fill = idx % 2 ? "FFFFFF" : "F7F7F7";
    textBox(slide, row[0], { x, y: y + idx * rowH, w: 1.45, h: rowH, fontSize: 9, bold: true, color: RED, fill: { color: fill }, margin: 0.04 });
    textBox(slide, row[1], { x: x + 1.45, y: y + idx * rowH, w: w - 1.45, h: rowH, fontSize: 9, color: "333333", fill: { color: fill }, margin: 0.04 });
  });
}

function drawTemplateMatrix(slide, results, x, y) {
  const rows = results.map((result) => [`${result.kind}/${result.template}`, result.renderPath, `${result.actual.w}x${result.actual.h}`]);
  textBox(slide, "measured cases", { x, y: y - 0.34, w: 5.2, h: 0.24, fontSize: 11, bold: true, color: RED, margin: 0 });
  rows.forEach((row, idx) => {
    const col = Math.floor(idx / 12);
    const rowIdx = idx % 12;
    const cellX = x + col * 2.55;
    const cellY = y + rowIdx * 0.32;
    textBox(slide, row[0], { x: cellX, y: cellY, w: 1.35, h: 0.28, fontSize: 6.6, bold: true, color: "333333", margin: 0.01, fit: "shrink" });
    textBox(slide, row[1], { x: cellX + 1.37, y: cellY, w: 0.62, h: 0.28, fontSize: 6.3, color: GREEN, margin: 0.01, fit: "shrink" });
    textBox(slide, row[2], { x: cellX + 2.0, y: cellY, w: 0.52, h: 0.28, fontSize: 6.3, color: RED, margin: 0.01, fit: "shrink" });
  });
}

function groupCounts(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
