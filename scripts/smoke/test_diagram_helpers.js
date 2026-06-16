const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  chooseTemplateLayout,
  createVisualAnchorImage,
  createVisualAnchorSvg,
  renderVisualAnchorRoughSvg,
  renderVisualAnchorPptNative,
  resolveVisualAnchorRenderPath,
  validateVisualAnchorSpec,
  writeVisualAnchorImage,
} = require("../pptx/hw_diagram_helpers");
const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
const { cases: generatedCaseMatrix, DEFAULT_LAYOUT } = require("./fixtures/visual_diagram_test_cases");

function baseSpec(overrides) {
  return {
    id: "test",
    title: "Test Visual Anchor",
    kind: "Hierarchy",
    template: "tree",
    claim: "测试图像契约。",
    visual_spec: {},
    ...overrides,
  };
}

function renderNativeForTest(spec) {
  const pptx = createHuaweiDeck({ title: "native canonical test" });
  const slide = pptx.addSlide();
  renderVisualAnchorPptNative(slide, spec);
}

function renderNativeSlideForTest(spec, area) {
  const pptx = createHuaweiDeck({ title: "native canonical test" });
  const slide = pptx.addSlide();
  renderVisualAnchorPptNative(slide, spec, area);
  return slide;
}

function assertIncludes(svg, values, context) {
  for (const value of values) {
    assert(svg.includes(String(value)), `${context} should render ${value}`);
  }
}

function assertNotIncludes(svg, values, context) {
  for (const value of values) {
    assert(!svg.includes(String(value)), `${context} should not render stale fixture label ${value}`);
  }
}

function parseViewBox(svg) {
  const match = svg.match(/viewBox="([^"]+)"/);
  assert(match, "SVG should include a viewBox");
  const [x, y, w, h] = match[1].split(/\s+/).map(Number);
  assert([x, y, w, h].every(Number.isFinite), "viewBox should contain numeric bounds");
  return { x, y, w, h };
}

function decodeXmlText(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function estimateSvgTextWidth(text, size) {
  let units = 0;
  for (const char of String(text ?? "")) {
    if (char === " ") units += 0.35;
    else if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) units += 1.5;
    else if (/[A-Z0-9#%@&]/.test(char)) units += 1.05;
    else if (/[a-z]/.test(char)) units += 0.9;
    else if (/[._:/+-]/.test(char)) units += 0.7;
    else units += 0.78;
  }
  return Math.max(size * 0.8, units * size * 0.62);
}

function extractSvgTextLines(svg) {
  const lines = [];
  for (const textMatch of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const size = Number((textMatch[1].match(/font-size="([^"]+)"/) || [])[1] || 28);
    for (const lineMatch of textMatch[2].matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)) {
      lines.push({ size, text: decodeXmlText(lineMatch[1].replace(/<[^>]+>/g, "")) });
    }
  }
  return lines;
}

function assertNoOversizedSvgTextLine(svg, maxWidth, context) {
  const oversized = extractSvgTextLines(svg)
    .map((line) => ({ ...line, width: estimateSvgTextWidth(line.text, line.size) }))
    .filter((line) => line.width > maxWidth);
  assert.deepStrictEqual(
    oversized.map((line) => `${line.text} (${Math.round(line.width)}px)`),
    [],
    `${context} should wrap long SVG text within a reasonable width`
  );
}

function countArrowHeadPaths(svg) {
  return (svg.match(/<path d="M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+"/g) || []).length;
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function hasReasonableLongText(value) {
  return collectStrings(value).some((text) => /[\u4e00-\u9fff]/.test(text) && text.length >= 8)
    || collectStrings(value).some((text) => /(?:ppt_native|check_huawei|PowerPoint|fallback)/.test(text));
}

function testImageContractAndAspectRatio() {
  const spec = baseSpec({
    id: "image_contract",
    title: "PPT 页面标题不应进入 SVG",
    claim: "页面级 claim 应留在 PPT 文本框。",
    visual_spec: {
      nodes: ["root", "child"],
      edges: [["root", "child"]],
      labels: { root: "10%", child: "20%" },
      highlight: "child",
    },
  });

  const image = createVisualAnchorImage(spec, { aspectRatio: "16:9", width: 1200 });
  assert.equal(image.format, "svg");
  assert.equal(image.width, 1200);
  assert(image.height > 0);
  assert(image.svg.startsWith("<svg"), "image export should return SVG markup, not a PPT slide");
  const crop = parseViewBox(image.svg);
  assert(crop.w < 1600 && crop.h < 900, "SVG should crop to the content-focused export box");
  assert(crop.x >= 0 && crop.y >= 0, "cropped viewBox should stay inside the source canvas");
  assert(!image.svg.includes("PPT 页面标题不应进入 SVG"), "diagram image should not render PPT-level title text");
  assert(!image.svg.includes("页面级 claim 应留在 PPT 文本框"), "diagram image should not render PPT-level claim text");

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-image-"));
  const outPath = writeVisualAnchorImage(spec, outDir, { aspectRatio: "16:9", width: 800 });
  assert.equal(path.extname(outPath), ".svg");
  assert(parseViewBox(fs.readFileSync(outPath, "utf8")).w > 0);
}

function testLayeredArchitectureIsDataDriven() {
  const spec = baseSpec({
    id: "custom_architecture",
    kind: "Hierarchy",
    template: "layered_architecture",
    visual_spec: {
      layers: [
        { id: "entry", label: "入口", items: ["Partner Portal", "Admin Console"] },
        { id: "policy", label: "策略层", items: ["Risk Policy", "Quota Guard", "Routing Brain"] },
        { id: "runtime", label: "执行层", items: ["Batch Runner", "Realtime Worker"] },
      ],
      side_label: "Control Plane",
      side_modules: ["Audit Lake", "SLO Board", "Cost Watch", "Incident Desk"],
      edges: [
        ["Partner Portal", "Risk Policy"],
        ["Admin Console", "Quota Guard"],
        ["Risk Policy", "Batch Runner"],
        ["Routing Brain", "Realtime Worker"],
        ["Cost Watch", "Routing Brain"],
      ],
    },
  });

  const svg = createVisualAnchorSvg(spec);
  assertIncludes(
    svg,
    ["Partner Portal", "Admin Console", "Risk Policy", "Quota Guard", "Routing Brain", "Batch Runner", "Realtime Worker", "Audit Lake", "SLO Board", "Cost Watch", "Incident Desk"],
    "layered_architecture"
  );
  assertNotIncludes(svg, ["Agent Gateway", "工具编排", "模型服务"], "layered_architecture");
}

function testTreeIsDataDriven() {
  const nodes = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const labels = Object.fromEntries(nodes.map((node, idx) => [node, `${idx + 1}x`]));
  const spec = baseSpec({
    id: "custom_tree",
    kind: "Hierarchy",
    template: "tree",
      visual_spec: {
        nodes,
        edges: [["A", "B"], ["A", "C"], ["B", "D"], ["B", "E"], ["C", "F"], ["F", "G"], ["G", "H"], ["G", "I"]],
        labels,
        highlight: "I",
      },
  });

  const svg = createVisualAnchorSvg(spec);
  assertIncludes(svg, nodes.map((node) => `#${node}`), "tree");
  assertIncludes(svg, Object.values(labels), "tree");
  assertNotIncludes(svg, ["#0", "#79", "Archive 不是 cache"], "tree");
}

function testInputsAreNotSilentlyTruncated() {
  const bars = createVisualAnchorSvg(baseSpec({
    id: "wide_bars",
    kind: "Quantity",
    template: "bar_chart",
    visual_spec: {
      y_label: "得分",
      categories: ["A", "B", "C", "D", "E", "F", "G"],
      series: [
        { name: "S1", values: [1, 2, 3, 4, 5, 6, 7] },
        { name: "S2", values: [2, 3, 4, 5, 6, 7, 8] },
        { name: "S3", values: [3, 4, 5, 6, 7, 8, 9] },
        { name: "S4", values: [4, 5, 6, 7, 8, 9, 10] },
      ],
      highlight: { category: "G", series: "S4" },
    },
  }));
  assertIncludes(bars, ["A", "G", "S1", "S4", "10"], "bar_chart");

  const loop = createVisualAnchorSvg(baseSpec({
    id: "long_dual_loop",
    kind: "Loop",
    template: "dual_loop",
    visual_spec: {
      loops: [
        { id: "inner", label: "内循环", steps: Array.from({ length: 3 }, (_, idx) => ({ id: `i${idx}`, label: `内环节${idx + 1}` })) },
        { id: "outer", label: "外循环", steps: Array.from({ length: 4 }, (_, idx) => ({ id: `o${idx}`, label: `外环节${idx + 1}` })) },
      ],
      highlight: "outer",
    },
  }));
  assertIncludes(loop, ["内循环", "外循环", "外环节4"], "dual_loop");

  const matrix = createVisualAnchorSvg(baseSpec({
    id: "dense_matrix",
    kind: "Matrix",
    template: "quadrant_matrix",
    visual_spec: {
      x_axis: { left: "低", right: "高", label: "横轴" },
      y_axis: { bottom: "低", top: "高", label: "纵轴" },
      items: Array.from({ length: 8 }, (_, idx) => ({ label: `对象${idx + 1}`, x: (idx + 1) / 9, y: ((idx * 3) % 8 + 1) / 9 })),
      highlight: "对象8",
    },
  }));
  assertIncludes(matrix, ["对象1", "对象8"], "quadrant_matrix");

  const network = createVisualAnchorSvg(baseSpec({
    id: "dense_network",
    kind: "Network",
    template: "hub_spoke_network",
    visual_spec: {
      hub: { id: "hub", label: "中心" },
      nodes: Array.from({ length: 9 }, (_, idx) => ({ id: `n${idx}`, label: `节点${idx + 1}` })),
      edges: [["hub", "n0"], ["hub", "n1"], ["hub", "n2"], ["hub", "n3"], ["hub", "n4"], ["hub", "n5"], ["hub", "n6"], ["hub", "n7"], ["hub", "n8"], ["n8", "n0"]],
      highlight: "n8",
    },
  }));
  assertIncludes(network, ["节点1", "节点9"], "hub_spoke_network");

}

function testReasonableLongTextWrapsInsideSvgViews() {
  const tree = createVisualAnchorSvg(baseSpec({
    id: "long_text_tree",
    kind: "Hierarchy",
    template: "tree",
    visual_spec: {
      nodes: ["scripts", "pptx", "review", "smoke", "helpers", "export", "checker", "tests"],
      edges: [["scripts", "pptx"], ["scripts", "review"], ["scripts", "smoke"], ["pptx", "helpers"], ["pptx", "export"], ["review", "checker"], ["smoke", "tests"]],
      labels: {
        scripts: "脚本入口统一调度工作区",
        pptx: "生成与导出目录职责边界清晰",
        review: "交付前检查目录",
        smoke: "冒烟测试覆盖长文本",
        helpers: "页面框架与图表辅助函数",
        export: "PPTX 图片导出与参考图审阅",
        checker: "规则检查契约与样例",
        tests: "契约测试与长标签样例",
      },
      highlight: "pptx",
    },
  }));
  assertIncludes(tree, ["生成与导出", "检查目录", "冒烟测试"], "long_text_tree");
  assertNoOversizedSvgTextLine(tree, 520, "long_text_tree");

  const process = createVisualAnchorSvg(baseSpec({
    id: "long_text_bar_chart",
    kind: "Quantity",
    template: "bar_chart",
    visual_spec: {
      y_label: "SVG helper 文本按宽度换行",
      categories: ["页面级观点规划", "拆分视觉锚点", "导出图片逐页检查"],
      series: [{ name: "质量", values: [1, 2, 3] }],
      highlight: { category: "拆分视觉锚点", series: "质量" },
    },
  }));
  assertIncludes(process, ["SVG", "视觉", "helper"], "long_text_bar_chart");
  assertNoOversizedSvgTextLine(process, 620, "long_text_bar_chart");

  const network = createVisualAnchorSvg(baseSpec({
    id: "long_text_network",
    kind: "Network",
    template: "hub_spoke_network",
    visual_spec: {
      hub: { id: "hub", label: "hw-ppt-gen 统一渲染入口" },
      nodes: [
        { id: "diagram", label: "hw_diagram_helpers.js" },
        { id: "native", label: "PPT 原生图形模块" },
        { id: "review", label: "导出图片与人工检查" },
        { id: "export", label: "export_pptx_images.js" },
      ],
      edges: [["hub", "diagram"], ["hub", "native"], ["hub", "review"], ["hub", "export"], ["diagram", "review"]],
      highlight: "diagram",
    },
  }));
  assertIncludes(network, ["hw_diagram", "PPT 原生", "export_pptx"], "long_text_network");
  assertNoOversizedSvgTextLine(network, 520, "long_text_network");
  assert(!network.includes(">hw_diagram_helpers.js<"), "long_text_network should wrap long helper file names instead of keeping them as one line");
  assert(!network.includes(">export_pptx_images.js<"), "long_text_network should wrap long export file names instead of keeping them as one line");

  const denseNetworkNodes = Array.from({ length: 11 }, (_, idx) => ({
    id: `n${idx + 1}`,
    label: idx % 2 ? `renderer_pipeline_long_token_${idx + 1}.js` : `节点${idx + 1}视觉锚点长文本回归`,
  }));
  assert.throws(
    () => createVisualAnchorSvg(baseSpec({
      id: "long_text_dense_network",
      kind: "Network",
      template: "dependency_graph",
      visual_spec: {
        nodes: denseNetworkNodes,
        edges: denseNetworkNodes.slice(0, -1).map((node, idx) => [node.id, denseNetworkNodes[idx + 1].id]),
        highlight: "n7",
      },
    })),
    /Diagram text exceeds/,
    "overly dense network labels should be rejected instead of truncated"
  );
}

function testStandaloneExplanationTextStaysOutOfSvg() {
  const fixtures = [
    ["Loop", "dual_loop", {
      loops: [
        { id: "a", label: "生成环", steps: [{ id: "render", label: "渲染" }, { id: "record", label: "记录" }] },
        { id: "b", label: "检查环", steps: [{ id: "check", label: "检查" }, { id: "fix", label: "修正" }] },
      ],
      highlight: "b",
    }],
    ["Hierarchy", "layered_architecture", {
      layers: [
        { id: "a", label: "页面骨架", items: ["标题", "页脚"] },
        { id: "b", label: "视觉锚点", items: ["节点", "连线"] },
        { id: "c", label: "解释文本", items: ["总结", "旁注"] },
      ],
      side_label: "外部输入",
      side_modules: ["来源", "证据"],
      edges: [["标题", "节点"], ["节点", "总结"], ["来源", "节点"]],
    }],
    ["Matrix", "quadrant_matrix", {
      x_axis: { left: "低", right: "高", label: "价值" },
      y_axis: { bottom: "低", top: "高", label: "可行性" },
      items: [
        { label: "方案A", x: 0.3, y: 0.6 },
        { label: "方案B", x: 0.7, y: 0.8 },
      ],
      highlight: "方案B",
    }],
    ["Network", "hub_spoke_network", {
      hub: { id: "hub", label: "生成入口" },
      nodes: [
        { id: "diagram", label: "图形" },
        { id: "ppt", label: "PPT" },
      ],
      edges: [["hub", "diagram"], ["hub", "ppt"]],
      highlight: "diagram",
    }],
  ];

  const staleStandaloneText = [
    "每一步都留下可检查证据",
    "自上而下推进",
    "适合阶段门",
    "评测结果回到 Archive",
    "越往上越接近",
    "分层协同",
    "先定位关系",
    "网络图只用于真正",
    "互相校准",
    "Value",
    "合计",
  ];

  fixtures.forEach(([kind, template, visualSpec]) => {
    const svg = createVisualAnchorSvg(baseSpec({ id: `no_explanation_${template}`, kind, template, visual_spec: visualSpec }));
    assertNotIncludes(svg, staleStandaloneText, `${kind}/${template}`);
  });

  const barChart = createVisualAnchorSvg(baseSpec({
    id: "no_empty_bar_chart_callout",
    kind: "Quantity",
    template: "bar_chart",
    visual_spec: {
      y_label: "得分",
      categories: ["A", "B"],
      series: [{ name: "S", values: [1, 2] }],
      highlight: { category: "B", series: "S" },
    },
  }));
  assertNotIncludes(barChart, ["M 1188 470 C 1320 420 1435 462 1450 566"], "bar_chart should not keep empty explanatory bubble");

  const proportionChart = createVisualAnchorSvg(baseSpec({
    id: "no_empty_proportion_callout",
    kind: "Quantity",
    template: "proportion_chart",
    visual_spec: {
      total_label: "占比",
      segments: [{ label: "A", value: 40 }, { label: "B", value: 60 }],
      highlight: "B",
    },
  }));
  assertNotIncludes(proportionChart, ["M 1005 308 C 1188 246 1376 312 1412 458"], "proportion_chart should not keep empty explanatory bubble");
}

function testDenseQuadrantLabelsRenderWithAdaptiveText() {
  const svg = createVisualAnchorSvg(baseSpec({
      id: "tiny_quadrant_label",
      kind: "Matrix",
      template: "quadrant_matrix",
      visual_spec: {
        x_axis: { left: "低", right: "高", label: "价值" },
        y_axis: { bottom: "低", top: "高", label: "可行性" },
        items: Array.from({ length: 13 }, (_, idx) => ({ label: `对象${idx + 1}`, x: (idx + 1) / 14, y: ((idx * 5) % 13 + 1) / 14 })),
      },
    }));
  assert(svg.startsWith("<svg"), "dense quadrant matrix should render rather than falling back to a rejection slide");
  assertIncludes(svg, ["对象13"], "dense quadrant matrix");
}

function testRoughSvgUsesTightTransparentCanvas() {
  const svg = createVisualAnchorSvg(baseSpec({
    id: "transparent_tight_canvas",
    kind: "Quantity",
    template: "bar_chart",
    visual_spec: {
      y_label: "Score",
      categories: ["A", "B"],
      series: [{ name: "S", values: [1, 2] }],
    },
  }));
  const viewBox = parseViewBox(svg);
  assert(!svg.includes(`<rect width="1600" height="900"`), "rough SVG should not draw a full-canvas white background");
  assert(!svg.includes("M80 120 C310"), "rough SVG should not include decorative full-canvas guide lines");
  assert(viewBox.w < 1400 && viewBox.h < 760, "rough SVG should be cropped to the rendered content instead of the full design canvas");
}

function testPptNativeDoesNotDrawOuterVisualFrame() {
  const area = { x: 0.7, y: 1.1, w: 6, h: 2.4 };
  const slide = renderNativeSlideForTest(baseSpec({
    id: "native_no_outer_frame",
    kind: "Sequence",
    template: "process",
    visual_spec: {
      steps: [
        { id: "s1", label: "规划" },
        { id: "s2", label: "交付" },
      ],
      highlight: "s1",
    },
  }), area);
  const outerFrames = (slide._slideObjects || []).filter((object) => {
    const options = object.options || {};
    return object.shape === "rect"
      && Math.abs(Number(options.x) - area.x) < 0.001
      && Math.abs(Number(options.y) - area.y) < 0.001
      && Math.abs(Number(options.w) - area.w) < 0.001
      && Math.abs(Number(options.h) - area.h) < 0.001
      && options.fill?.color === "FFFFFF"
      && options.line?.color === "D9D9D9";
  });
  assert.strictEqual(outerFrames.length, 0, "ppt_native render should not add a white outer frame around the visual area");
}

function testStructuredNativeComponentsUseNaturalBounds() {
  const area = { x: 0.7, y: 1.1, w: 7.4, h: 3.4 };

  const dataSlide = renderNativeSlideForTest(baseSpec({
    id: "native_natural_cards",
    kind: "Quantity",
    template: "data_cards",
    visual_spec: {
      cards: [
        { id: "a", label: "A", value: "1" },
        { id: "b", label: "B", value: "2" },
        { id: "c", label: "C", value: "3" },
      ],
    },
  }), area);
  const cardRects = (dataSlide._slideObjects || []).filter((object) => object.shape === "rect" && object.options?.fill?.color === "F7F7F7");
  assert(cardRects.length >= 3, "data_cards should render native card rectangles");
  assert(cardRects.every((object) => object.options.h < area.h * 0.5), "data_cards should keep natural card height instead of stretching to the module height");
  const cardStripW = cardRects.reduce((max, object) => Math.max(max, object.options.x + object.options.w), 0) - Math.min(...cardRects.map((object) => object.options.x));
  assert(cardStripW > area.w * 0.55 && cardStripW < area.w * 0.75, "data_cards should use a readable natural strip without stretching across the whole module");
  const cardTexts = (dataSlide._slideObjects || []).filter((object) => object._type === "text" && object.options?.fontFace);
  assert(cardTexts.every((object) => object.options.fontFace === "Microsoft YaHei"), "data_cards should use Microsoft YaHei for native text");
  assert(cardTexts.some((object) => object.options.fontSize >= 24), "large data_cards should keep prominent value text");

  const gridSlide = renderNativeSlideForTest(baseSpec({
    id: "native_natural_heatmap",
    kind: "Quantity",
    template: "heatmap",
    visual_spec: {
      rows: ["R1", "R2"],
      columns: ["C1", "C2"],
      values: [[1, 2], [3, 4]],
    },
  }), area);
  const gridCells = (gridSlide._slideObjects || []).filter((object) => object.shape === "rect" && ["FFFFFF", "F7F7F7"].includes(object.options?.fill?.color));
  assert(gridCells.length >= 4, "heatmap should render native grid cells");
  assert(gridCells.reduce((sum, object) => sum + object.options.h, 0) / gridCells.length < area.h / 3, "heatmap cells should keep natural height instead of stretching to fill the module");

  const smallHeatmapArea = { x: 0.45, y: 1.22, w: 4.08, h: 5.3 };
  const smallGridSlide = renderNativeSlideForTest(baseSpec({
    id: "native_small_heatmap_labels",
    kind: "Quantity",
    template: "heatmap",
    visual_spec: {
      rows: ["维度1", "维度2职责清晰", "维度3统一调度"],
      columns: ["方案1职责清晰", "方案2统一调度", "方案3生成导出", "方案4规则检查"],
      values: [[0.2, 0.3, 0.4, 0.5], [0.4, 0.6, 0.8, 0], [0.6, 0.9, 0.2, 0.5]],
      highlight: { row: "维度3统一调度", column: "方案4规则检查" },
    },
  }), smallHeatmapArea);
  const smallGridTextObjects = smallGridSlide._slideObjects || [];
  const smallCells = smallGridTextObjects.filter((object) => object._type === "text" && ["F7F7F7", "FFFFFF", "FFF1EF"].includes(object.options?.fill?.color) && object.options?.line?.color);
  const firstCell = smallCells.find((object) => object.options?.fill?.color === "F7F7F7" && object.options?.line?.color === "D9D9D9");
  const rowLabel = smallGridTextObjects.find((object) => object._type === "text" && object.options?.align === "right" && object.text?.[0]?.text === "维度2职责清晰");
  assert(firstCell, "small heatmap should render grid cells");
  assert(rowLabel, "small heatmap should render row labels");
  assert(firstCell.options.x - (rowLabel.options.x + rowLabel.options.w) >= 0.1, "small heatmap row labels should keep a visible gutter before the first cell");
  assert(Math.max(...smallCells.map((object) => object.options.h)) <= 0.85, "small heatmap cells should keep compact natural row height instead of stretching down the module");

  const tableSlide = renderNativeSlideForTest(baseSpec({
    id: "native_natural_table",
    kind: "Matrix",
    template: "table",
    visual_spec: {
      rows: [
        ["指标", "当前", "目标"],
        ["质量", "可用", "优秀"],
        ["效率", "手工", "自动"],
      ],
    },
  }), area);
  const table = (tableSlide._slideObjects || []).find((object) => object._type === "table");
  assert(table, "Matrix/table should render an editable native table");
  assert(table.options.w / 914400 < area.w && table.options.h / 914400 < area.h, "Matrix/table should keep natural table bounds instead of filling the module");
}

function testStructuredNativeComponentsUseTieredFonts() {
  const spec = baseSpec({
    id: "native_tiered_cards",
    kind: "Quantity",
    template: "data_cards",
    visual_spec: {
      cards: [
        { id: "a", label: "转化率", value: "4.71x", unit: "加速" },
        { id: "b", label: "平均长度", value: "7.45", unit: "token" },
        { id: "c", label: "吞吐", value: "5.91x", unit: "倍" },
      ],
    },
  });
  const large = renderNativeSlideForTest(spec, { x: 0.7, y: 1.1, w: 7.4, h: 3.4 });
  const medium = renderNativeSlideForTest(spec, { x: 0.7, y: 1.1, w: 5, h: 2.8 });
  const small = renderNativeSlideForTest(spec, { x: 0.7, y: 1.1, w: 3.8, h: 2.2 });
  const maxFont = (slide) => Math.max(...(slide._slideObjects || [])
    .filter((object) => object._type === "text")
    .map((object) => object.options?.fontSize || 0));
  const fontSet = (slide) => new Set((slide._slideObjects || [])
    .filter((object) => object._type === "text")
    .map((object) => object.options?.fontSize || 0));
  assert.strictEqual(maxFont(large), 24, "biased-column native data cards should use the large PPT font tier");
  assert.strictEqual(maxFont(medium), 18, "two-column native data cards should use the medium PPT value tier");
  assert.strictEqual(maxFont(small), 18, "three-column native data cards should keep readable value text instead of shrinking values below 18pt");
  assert(fontSet(medium).has(12), "two-column native data cards should preserve 12pt supporting text");
  assert(fontSet(small).has(10), "three-column native data cards should use the compact 10pt supporting tier");

  const previewMedium = renderNativeSlideForTest(spec, { x: 0.45, y: 1.22, w: 6.12, h: 5.3 });
  const previewSmall = renderNativeSlideForTest(spec, { x: 0.45, y: 1.22, w: 4.08, h: 5.3 });
  const cardHeights = (slide) => (slide._slideObjects || [])
    .filter((object) => object.shape === "rect" && ["F7F7F7", "FFF1EF"].includes(object.options?.fill?.color))
    .map((object) => object.options?.h || 0);
  assert(Math.max(...cardHeights(previewMedium)) <= 1.45, "two-column preview data_cards should keep natural card height instead of stretching vertically");
  assert(Math.max(...cardHeights(previewSmall)) <= 1.25, "three-column preview data_cards should keep natural card height instead of stretching vertically");

  const compactCards = renderNativeSlideForTest(baseSpec({
    id: "native_compact_cards_fit_labels",
    kind: "Quantity",
    template: "data_cards",
    visual_spec: {
      cards: [
        { id: "train", label: "继续训练", value: "50B/150B", unit: "tokens" },
        { id: "h100", label: "主评测条件", value: "H100 b=1" },
        { id: "kernel", label: "改造面", value: "KV/kernel" },
      ],
    },
  }), { x: 0.45, y: 1.22, w: 4.08, h: 1.15 });
  const compactObjects = compactCards._slideObjects || [];
  const compactRects = compactObjects.filter((object) => object.shape === "rect" && object.text == null && object.options?.fill?.color === "F7F7F7");
  assert.strictEqual(compactRects.length, 3, "compact data_cards should render three card rectangles");
  compactRects.forEach((rect) => {
    const rectRight = rect.options.x + rect.options.w;
    const rectBottom = rect.options.y + rect.options.h;
    const innerTexts = compactObjects.filter((object) =>
      object._type === "text"
      && object.text
      && object.options.x >= rect.options.x
      && object.options.x < rectRight
    );
    assert(innerTexts.length >= 2, "compact data_cards should render value and label text in each card");
    assert(innerTexts.every((object) => object.options.y + object.options.h <= rectBottom + 0.001), "compact data_cards text should stay inside its card rectangle");
  });
}

function testNativeProcessHeightTracksTextSize() {
  const slide = renderNativeSlideForTest(baseSpec({
    id: "native_process_height_tracks_text",
    kind: "Sequence",
    template: "process",
    visual_spec: {
      steps: [
        { id: "s1", label: "阶段1" },
        { id: "s2", label: "阶段2职责清晰" },
        { id: "s3", label: "阶段3统一调度" },
      ],
      highlight: "s3",
    },
  }), { x: 0.45, y: 1.22, w: 6.12, h: 5.3 });
  const processRects = (slide._slideObjects || []).filter((object) => object.shape === "rect" && ["FFFFFF", "FFF1EF"].includes(object.options?.fill?.color));
  assert(processRects.length >= 3, "process should render native step rectangles");
  assert(Math.max(...processRects.map((object) => object.options.h)) < 0.75, "process card height should shrink with smaller text instead of retaining a fixed tall box");
}

async function testNativeRendererRejectsShrinkFitAndOverflow() {
  const pptx = createHuaweiDeck({ title: "native text guard" });
  const slide = pptx.addSlide();
  assert.doesNotThrow(
    () => renderVisualAnchorPptNative(slide, baseSpec({
      id: "native_process_overflow",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          {
            id: "s1",
            label: "跨团队协同排期",
          },
          { id: "s2", label: "交付" },
        ],
        highlight: "s1",
      },
    }), { x: 0.7, y: 1.1, w: 6, h: 2.4 }),
    "native process should adapt text before rejecting a normal visual area"
  );
  assert.throws(
    () => renderVisualAnchorPptNative(slide, baseSpec({
      id: "native_process_impossible_box",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          { id: "s1", label: "超长阶段标题超长阶段标题超长阶段标题" },
          { id: "s2", label: "交付" },
        ],
        highlight: "s1",
      },
    }), { x: 0.7, y: 1.1, w: 0.45, h: 0.35 }),
    /ppt_native (text|sequence area)/
  );
}

function testLayeredArchitectureKeepsSideModuleEdges() {
  const sideModules = Array.from({ length: 5 }, (_, idx) => `侧向能力${idx + 1}check_huawei_${idx + 1}`);
  const edges = [
    ["L1-A", "L2-A"],
    ...sideModules.map((moduleName, idx) => [moduleName, idx % 2 ? "L2-A" : "L3-A"]),
  ];
  const svg = createVisualAnchorSvg(baseSpec({
    id: "layered_many_side_edges",
    kind: "Hierarchy",
    template: "layered_architecture",
    visual_spec: {
      layers: [
        { id: "l1", label: "第1层视觉锚点长文本", items: ["L1-A", "L1-B"] },
        { id: "l2", label: "第2层", items: ["L2-A", "L2-B"] },
        { id: "l3", label: "第3层", items: ["L3-A", "L3-B"] },
      ],
      side_label: "侧向能力",
      side_modules: sideModules,
      edges,
    },
  }));
  assert(countArrowHeadPaths(svg) >= edges.length, "layered_architecture should render side-module edges even when there are more than three side modules");
  assertNoOversizedSvgTextLine(svg, 520, "layered_many_side_edges");
}

function testValidatorRejectsDroppedRelationships() {
  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_slide_annotation",
      visual_spec: {
        nodes: ["A", "B"],
        edges: [["A", "B"]],
        labels: { A: "1", B: "2" },
        highlight: "B",
        annotation: "这类解释应放在 PPT 可编辑文本中",
      },
    })),
    /visual_spec.annotation is not supported/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_slide_callout",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          { id: "a", label: "生成" },
          { id: "b", label: "解释" },
        ],
        callout: "这类解释应该放在 PPT 可编辑文本中",
      },
    })),
    /visual_spec.callout is not supported/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_nested_caption",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          { id: "a", label: "生成", caption: "这类说明不属于流程节点" },
          { id: "b", label: "解释" },
        ],
      },
    })),
    /visual_spec\.steps\[0\]\.caption is not supported/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_nested_note",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          { id: "a", label: "生成", note: "图内说明" },
          { id: "b", label: "解释" },
        ],
      },
    })),
    /visual_spec\.steps\[0\]\.note is not supported/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_unknown_top_level",
      kind: "Quantity",
      template: "bar_chart",
      visual_spec: {
        y_label: "得分",
        categories: ["A"],
        series: [{ name: "S", values: [1] }],
        business_judgment: "这类判断应进入 PPT 文本层",
      },
    })),
    /visual_spec\.business_judgment is not part of the visual_spec schema/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_missing_axis_label",
      kind: "Quantity",
      template: "bar_chart",
      visual_spec: {
        categories: ["A"],
        series: [{ name: "S", values: [1] }],
      },
    })),
    /bar_chart requires visual_spec\.y_label/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_missing_total_label",
      kind: "Quantity",
      template: "proportion_chart",
      visual_spec: {
        segments: [{ label: "A", value: 1 }, { label: "B", value: 2 }],
      },
    })),
    /proportion_chart requires visual_spec\.total_label/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_missing_side_label",
      kind: "Hierarchy",
      template: "layered_architecture",
      visual_spec: {
        layers: [
          { id: "l1", label: "L1", items: ["A"] },
          { id: "l2", label: "L2", items: ["B"] },
          { id: "l3", label: "L3", items: ["C"] },
        ],
        side_modules: ["D"],
        edges: [["A", "B"], ["D", "B"]],
      },
    })),
    /requires visual_spec\.side_label/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_tree_edge",
      visual_spec: {
        nodes: ["A", "B"],
        edges: [["A", "B"], ["B", "C"]],
        labels: { A: "1", B: "2" },
        highlight: "B",
      },
    })),
    /unknown target: C/
  );

  assert.throws(
    () => validateVisualAnchorSpec(baseSpec({
      id: "bad_arch_edge",
      kind: "Hierarchy",
      template: "layered_architecture",
      visual_spec: {
        layers: [
          { id: "l1", label: "L1", items: ["A"] },
          { id: "l2", label: "L2", items: ["B"] },
          { id: "l3", label: "L3", items: ["C"] },
        ],
        side_modules: [],
        edges: [["A", "Missing"]],
      },
    })),
    /unknown target: Missing/
  );
}

function allSubclassSpecs() {
  const quantityCategories = ["Q1", "Q2", "Q3", "Q4"];
  const heatmapRows = ["安全", "效率", "成本"];
  const heatmapCols = ["方案A", "方案B", "方案C"];
  const processSteps = [
    { id: "s1", label: "发现" },
    { id: "s2", label: "设计" },
    { id: "s3", label: "验证" },
    { id: "s4", label: "交付" },
  ];
  const lanes = [
    { id: "biz", label: "业务", steps: [{ id: "b1", label: "提出目标" }, { id: "b2", label: "确认价值" }] },
    { id: "agent", label: "Agent", steps: [{ id: "a1", label: "生成方案" }, { id: "a2", label: "执行验证" }] },
    { id: "review", label: "评审", steps: [{ id: "r1", label: "检查风险" }, { id: "r2", label: "批准发布" }] },
  ];
  const loopSteps = [
    { id: "observe", label: "观察" },
    { id: "decide", label: "判断" },
    { id: "act", label: "执行" },
    { id: "learn", label: "学习" },
  ];
  const hierarchyNodes = ["Root", "A", "B", "A1", "A2", "B1"];
  const hierarchyLabels = Object.fromEntries(hierarchyNodes.map((node) => [node, `${node} 能力`]));
  const graphNodes = [
    { id: "agent", label: "Agent" },
    { id: "model", label: "模型" },
    { id: "memory", label: "记忆" },
    { id: "tool", label: "工具" },
    { id: "eval", label: "评测" },
  ];

  return [
    ["Quantity", "data_cards", {
      cards: [
        { id: "roi", label: "ROI 提升", value: "42", unit: "%" },
        { id: "cost", label: "成本下降", value: "18", unit: "%" },
        { id: "speed", label: "交付速度", value: "2.3", unit: "x" },
      ],
      highlight: "roi",
    }, ["ROI 提升", "42", "交付速度"]],
    ["Quantity", "bar_chart", {
      y_label: "得分",
      categories: quantityCategories,
      series: [{ name: "Base", values: [12, 18, 20, 22] }, { name: "Agent", values: [18, 24, 31, 35] }],
      highlight: { category: "Q4", series: "Agent" },
    }, ["Base", "Agent", "Q4", "35"]],
    ["Quantity", "line_chart", {
      y_label: "增长率",
      categories: quantityCategories,
      series: [{ name: "转化率", values: [10, 16, 21, 30] }, { name: "留存率", values: [44, 46, 53, 61] }],
      highlight: { category: "Q4", series: "留存率" },
    }, ["转化率", "留存率", "Q4", "61"]],
    ["Quantity", "proportion_chart", {
      total_label: "流量占比",
      segments: [{ label: "搜索", value: 52 }, { label: "推荐", value: 33 }, { label: "直达", value: 15 }],
      highlight: "推荐",
    }, ["流量占比", "搜索", "推荐", "33"]],
    ["Quantity", "heatmap", {
      rows: heatmapRows,
      columns: heatmapCols,
      values: [[0.2, 0.7, 0.4], [0.8, 0.5, 0.3], [0.3, 0.6, 0.9]],
      highlight: { row: "成本", column: "方案C" },
    }, ["安全", "方案C", "0.9"]],
    ["Sequence", "process", { steps: processSteps, highlight: "s3" }, ["发现", "验证", "交付"]],
    ["Sequence", "timeline", { steps: processSteps.map((step, i) => ({ ...step, time: `T${i + 1}` })), highlight: "s4" }, ["T1", "T4", "交付"]],
    ["Sequence", "swimlane", { lanes, highlight: "a2" }, ["业务", "Agent", "批准发布", "执行验证"]],
    ["Loop", "closed_loop", { center: "闭环系统", steps: loopSteps, highlight: "learn" }, ["闭环系统", "观察", "学习"]],
    ["Loop", "dual_loop", {
      loops: [
        { id: "inner", label: "快速反馈", steps: loopSteps.slice(0, 3) },
        { id: "outer", label: "长期学习", steps: loopSteps.slice(1) },
      ],
      highlight: "outer",
    }, ["快速反馈", "长期学习", "学习"]],
    ["Loop", "spiral_iteration_ladder", { center: "能力演进", steps: loopSteps.concat([{ id: "scale", label: "扩展" }]), highlight: "scale" }, ["能力演进", "观察", "扩展"]],
    ["Hierarchy", "tree", { nodes: hierarchyNodes, edges: [["Root", "A"], ["Root", "B"], ["A", "A1"], ["A", "A2"], ["B", "B1"]], labels: hierarchyLabels, highlight: "A2" }, ["#Root", "#A2", "A2 能力"]],
    ["Hierarchy", "layered_architecture", {
      layers: [
        { id: "l1", label: "入口层", items: ["门户", "API"] },
        { id: "l2", label: "服务层", items: ["策略", "编排"] },
        { id: "l3", label: "资源层", items: ["模型", "数据"] },
      ],
      side_label: "治理能力",
      side_modules: ["审计"],
      edges: [["门户", "策略"], ["API", "编排"], ["编排", "模型"], ["审计", "策略"]],
    }, ["入口层", "编排", "审计"]],
    ["Hierarchy", "capability_stack", { levels: [{ label: "体验层" }, { label: "平台层" }, { label: "基础层" }], highlight: "平台层" }, ["体验层", "平台层", "基础层"]],
    ["Matrix", "quadrant_matrix", { x_axis: { left: "低", right: "高", label: "价值" }, y_axis: { bottom: "低", top: "高", label: "可行性" }, items: [{ label: "方案A", x: 0.2, y: 0.7 }, { label: "方案B", x: 0.8, y: 0.8 }], highlight: "方案B" }, ["价值", "可行性", "方案B"]],
    ["Matrix", "capability_matrix", { rows: ["产品", "工程"], columns: ["当前", "目标"], values: [["可用", "优秀"], ["手工", "自动"]], highlight: { row: "工程", column: "目标" } }, ["产品", "工程", "自动"]],
    ["Network", "hub_spoke_network", { hub: { id: "agent", label: "Agent" }, nodes: graphNodes.slice(1), edges: [["agent", "model"], ["agent", "memory"], ["agent", "tool"], ["agent", "eval"], ["memory", "eval"]], highlight: "eval" }, ["Agent", "模型", "评测"]],
    ["Network", "dependency_graph", { nodes: graphNodes, edges: [["agent", "model"], ["agent", "memory"], ["tool", "eval"], ["memory", "tool"]], highlight: "tool" }, ["Agent", "模型", "工具"]],
    ["Network", "module_interaction_map", { nodes: graphNodes, edges: [["agent", "model"], ["model", "memory"], ["memory", "tool"], ["tool", "eval"], ["eval", "agent"]], highlight: "eval" }, ["Agent", "记忆", "评测"]],
    ["Network", "causal_influence_graph", { nodes: graphNodes, edges: [["model", "agent"], ["memory", "agent"], ["agent", "tool"], ["tool", "eval"]], highlight: "agent" }, ["模型", "Agent", "评测"]],
  ].map(([kind, template, visual_spec, expected]) => baseSpec({
    id: `subclass_${template}`,
    title: `${template} Test`,
    kind,
    template,
    claim: `${template} 应导出图片。`,
    visual_spec,
    expected,
  }));
}

function testAllVisualBaseTemplatesExportImages() {
  const specs = allSubclassSpecs();
  assert.equal(specs.length, 20, "base template fixture count should cover visual-anchor capabilities");
  const uniqueTemplates = new Set(specs.map((spec) => spec.template));
  assert.equal(uniqueTemplates.size, specs.length, "each subclass fixture should use a distinct template key");

  for (const spec of specs) {
    const renderer = resolveVisualAnchorRenderPath(spec);
    if (renderer === "rough_svg") {
      const image = createVisualAnchorImage(spec, { aspectRatio: "16:9", width: 1280 });
      assert.equal(image.format, "svg", `${spec.template} should export an SVG image`);
      assert.equal(image.width, 1280, `${spec.template} should honor requested width`);
      assert(image.height > 0, `${spec.template} should export a positive cropped height`);
      assert(image.height < image.width, `${spec.template} should crop to a landscape image element`);
      assertIncludes(image.svg, spec.expected, spec.template);
    } else if (renderer === "ppt_native") {
      renderNativeForTest(spec);
    }
  }
}

function testTemplateLayoutDefaults() {
  const spec = baseSpec({
    id: "layout_defaults",
    visual_spec: {
      nodes: ["A", "B"],
      edges: [["A", "B"]],
      labels: { A: "起点", B: "终点" },
      highlight: "B",
    },
  });
  assert.equal(chooseTemplateLayout(spec), "16:9");
  const image = createVisualAnchorImage(spec, { width: 1600 });
  assert.equal(image.width, 1600);
  assert(image.height > 0);
  const crop = parseViewBox(image.svg);
  assert(crop.w > 0 && crop.h > 0);
  assert(crop.w < 1600 && crop.h < 900);
  assert.throws(() => createVisualAnchorImage(spec, { aspectRatio: "9:16", width: 900 }), /Unsupported diagram aspectRatio: 9:16/);
}

function testRoughSvgSizeTiersKeepSmallColumnTextReadable() {
  const spec = baseSpec({
    id: "tiered_bar_chart",
    kind: "Quantity",
    template: "bar_chart",
    visual_spec: {
      y_label: "清晰度",
      categories: ["偏分栏大图", "二分栏中图", "三分栏小图"],
      series: [{ name: "文字", values: [3, 2, 1] }],
      highlight: { category: "三分栏小图", series: "文字" },
    },
  });
  const large = createVisualAnchorImage(spec, { width: 1400, sizeTier: "large" });
  const small = createVisualAnchorImage(spec, { width: 860, sizeTier: "small" });
  const largeCrop = parseViewBox(large.svg);
  const smallCrop = parseViewBox(small.svg);
  assert(smallCrop.w < largeCrop.w * 0.8, "small tier should export a narrower logical viewBox instead of reusing the large-column image geometry");
  assert(small.svg.includes("三分栏小图"), "small tier should still render the original label text");
  assert(extractSvgTextLines(small.svg).some((line) => line.size >= 18), "small tier should preserve normal SVG text sizes after geometry compaction");
  assert.throws(() => createVisualAnchorImage(spec, { sizeTier: "poster" }), /Unsupported rough_svg size tier/);
}

function testGeneratedCaseMatrixCoverage() {
  assert(generatedCaseMatrix.length >= 200, "generated case matrix should provide at least 10 variants per template");
  const byTemplate = new Map();
  const roughCases = [];
  const nativeCases = [];
  const fixedCases = [];
  generatedCaseMatrix.forEach((spec) => {
    validateVisualAnchorSpec(spec);
    const renderPath = resolveVisualAnchorRenderPath(spec);
    if (renderPath === "rough_svg") {
      roughCases.push(spec);
      const list = byTemplate.get(spec.template) || [];
      list.push(spec);
      byTemplate.set(spec.template, list);
    } else if (renderPath === "ppt_native") {
      nativeCases.push(spec);
    } else {
      fixedCases.push({ spec, renderPath });
    }
  });

  assert(byTemplate.size >= 10, "rough-svg grouping should cover the canonical rough-svg templates");
  byTemplate.forEach((specs, template) => {
    assert(specs.length >= 10, `${template} should have at least 10 variants`);
    specs.forEach((spec) => assert.equal(spec.render_options?.aspectRatio, DEFAULT_LAYOUT, `${template} should use the chosen default layout`));
    const longTextSpec = specs.find((spec) => hasReasonableLongText(spec.visual_spec));
    assert(longTextSpec, `${template} should include ordinary generated cases with long or mixed-length text`);
    try {
      const image = createVisualAnchorImage(longTextSpec, longTextSpec.render_options);
      assertNoOversizedSvgTextLine(image.svg, 780, `${template} generated long-text case`);
    } catch (error) {
      assert(
        /Diagram text exceeds|supports at most|below the \d+px minimum/.test(String(error.message)),
        `${template} generated long-text case should either render cleanly or fail on a text-capacity guard: ${error.message}`
      );
    }
  });
  assert(roughCases.length >= 90, "generated case matrix should still provide many rough-svg variants");
  assert(nativeCases.length >= 80, "generated case matrix should include many canonical native variants");
  assert(fixedCases.some(({ spec, renderPath }) => spec.kind === "Evidence" && renderPath === "evidence"), "matrix should include a fixed-rule Evidence case");

  const spotCheckTemplates = ["bar_chart", "layered_architecture", "hub_spoke_network", "dual_loop"];
  spotCheckTemplates.forEach((template) => {
    const candidates = generatedCaseMatrix.filter((entry) => entry.template === template);
    assert(candidates.length, `matrix should include ${template}`);
    let image = null;
    for (const spec of candidates) {
      try {
        image = createVisualAnchorImage(spec, spec.render_options);
        break;
      } catch (error) {
        assert(
          /Diagram text exceeds|supports at most|below the \d+px minimum/.test(String(error.message)),
          `${spec.id} should either render or fail on a text-capacity guard: ${error.message}`
        );
      }
    }
    assert(image, `${template} should include at least one renderable generated case`);
    assert.equal(image.format, "svg");
    assert(image.svg.startsWith("<svg"), `${template} should render svg markup`);
  });
}

async function testNativeNetworkUsesPowerPointSafeExtents() {
  const pptx = createHuaweiDeck({ title: "native network regression" });
  const slide = pptx.addSlide();
  assert.throws(() => renderVisualAnchorPptNative(slide, baseSpec({
    id: "native_network_regression",
    kind: "Network",
    template: "hub_spoke_network",
    claim: "PowerPoint 不能接受负数 ext。",
    visual_spec: {
      hub: { id: "hub", label: "中心" },
      nodes: [
        { id: "top", label: "上方" },
        { id: "right", label: "右侧" },
        { id: "bottom", label: "下方" },
        { id: "left", label: "左侧" },
      ],
      edges: [["hub", "top"], ["hub", "right"], ["hub", "bottom"], ["hub", "left"]],
      highlight: "left",
    },
  }), { x: 0.7, y: 1.1, w: 7.5, h: 4.7 }), /not ppt_native/);
}

async function main() {
  testImageContractAndAspectRatio();
  testLayeredArchitectureIsDataDriven();
  testTreeIsDataDriven();
  testInputsAreNotSilentlyTruncated();
  testReasonableLongTextWrapsInsideSvgViews();
  testStandaloneExplanationTextStaysOutOfSvg();
  testDenseQuadrantLabelsRenderWithAdaptiveText();
  testRoughSvgUsesTightTransparentCanvas();
  testPptNativeDoesNotDrawOuterVisualFrame();
  testStructuredNativeComponentsUseNaturalBounds();
  testStructuredNativeComponentsUseTieredFonts();
  testNativeProcessHeightTracksTextSize();
  testLayeredArchitectureKeepsSideModuleEdges();
  testValidatorRejectsDroppedRelationships();
  testAllVisualBaseTemplatesExportImages();
  testTemplateLayoutDefaults();
  testRoughSvgSizeTiersKeepSmallColumnTextReadable();
  testGeneratedCaseMatrixCoverage();
  await testNativeNetworkUsesPowerPointSafeExtents();
  await testNativeRendererRejectsShrinkFitAndOverflow();
  testRendererIsRuntimeOnly();

  console.log("visual anchor helper contract tests passed");
}

function testRendererIsRuntimeOnly() {
  assert.equal(resolveVisualAnchorRenderPath(baseSpec({ kind: "Quantity", template: "bar_chart", visual_spec: { y_label: "得分", categories: ["A"], series: [{ name: "S", values: [1] }] } })), "rough_svg");
  assert.equal(resolveVisualAnchorRenderPath(baseSpec({ kind: "Sequence", template: "swimlane", visual_spec: { lanes: [{ id: "a", label: "A", steps: [{ id: "s1", label: "S1" }] }] } })), "ppt_native");
  assert.equal(resolveVisualAnchorRenderPath(baseSpec({ kind: "Network", template: "hub_spoke_network", visual_spec: { hub: { id: "h", label: "H" }, nodes: [{ id: "n1", label: "N1" }, { id: "n2", label: "N2" }], edges: [["h", "n1"], ["h", "n2"]] } })), "rough_svg");
  assert.equal(resolveVisualAnchorRenderPath(baseSpec({ kind: "Matrix", template: "table", visual_spec: { rows: [["A"]] } })), "ppt_native");
  assert.equal(resolveVisualAnchorRenderPath(baseSpec({ kind: "Evidence", template: "source_figure", source: { path: "figure.png", caption: "来源图" }, visual_spec: undefined })), "evidence");
  assert.throws(() => validateVisualAnchorSpec(baseSpec({ renderer: "rough_svg" })), /renderer is a runtime setting/);
  assert.throws(() => validateVisualAnchorSpec({ id: "old", title: "Old", claim: "旧接口。", intent: "Quantity", template: "bar_chart", visual_spec: {} }), /Use kind instead/);
  assert.throws(() => createVisualAnchorSvg(baseSpec({ kind: "Matrix", template: "table", visual_spec: { rows: [["A"]] } })), /not rough_svg SVG export/);
  assert.throws(() => createVisualAnchorSvg(baseSpec({ kind: "Quantity", template: "data_cards", visual_spec: { cards: [{ id: "a", label: "A", value: "1" }] } })), /not rough_svg SVG export/);
  assert.throws(() => renderVisualAnchorPptNative(createHuaweiDeck({ title: "x" }).addSlide(), baseSpec({ kind: "Network", template: "dependency_graph", visual_spec: { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [["a", "b"]] } })), /not ppt_native/);
  assert.throws(() => renderVisualAnchorRoughSvg(baseSpec({ kind: "Matrix", template: "table", visual_spec: { rows: [["A"]] } })), /not rough_svg/);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
