const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  chooseTemplateLayout,
  createHandDrawnDiagramImage,
  createHandDrawnDiagramSvg,
  validateHandDrawnDiagramSpec,
  writeHandDrawnDiagramImage,
} = require("./hw_diagram_helpers");
const { cases: generatedCaseMatrix, DEFAULT_LAYOUT } = require("../references/visual_diagram_test_cases");

function baseSpec(overrides) {
  return {
    id: "test",
    title: "Test Diagram",
    intent: "Hierarchy",
    template: "tree",
    claim: "测试图像契约。",
    visual_spec: {},
    ...overrides,
  };
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

function testImageContractAndAspectRatio() {
  const spec = baseSpec({
    id: "image_contract",
    visual_spec: {
      nodes: ["root", "child"],
      edges: [["root", "child"]],
      labels: { root: "10%", child: "20%" },
      highlight: "child",
    },
  });

  const image = createHandDrawnDiagramImage(spec, { aspectRatio: "16:9", width: 1200 });
  assert.equal(image.format, "svg");
  assert.equal(image.width, 1200);
  assert(image.height > 0);
  assert(image.svg.startsWith("<svg"), "image export should return SVG markup, not a PPT slide");
  const crop = parseViewBox(image.svg);
  assert(crop.w < 1600 && crop.h < 900, "SVG should crop to the content-focused export box");
  assert(crop.x >= 0 && crop.y >= 0, "cropped viewBox should stay inside the source canvas");
  assert(!image.svg.includes("Test Diagram"), "diagram image should not render PPT-level title text by default");
  assert(!image.svg.includes("测试图像契约"), "diagram image should not render PPT-level claim text by default");

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-image-"));
  const outPath = writeHandDrawnDiagramImage(spec, outDir, { aspectRatio: "16:9", width: 800 });
  assert.equal(path.extname(outPath), ".svg");
  assert(parseViewBox(fs.readFileSync(outPath, "utf8")).w > 0);
}

function testLayeredArchitectureIsDataDriven() {
  const spec = baseSpec({
    id: "custom_architecture",
    intent: "Hierarchy",
    template: "layered_architecture",
    visual_spec: {
      layers: [
        { id: "entry", label: "入口", items: ["Partner Portal", "Admin Console"] },
        { id: "policy", label: "策略层", items: ["Risk Policy", "Quota Guard", "Routing Brain"] },
        { id: "runtime", label: "执行层", items: ["Batch Runner", "Realtime Worker"] },
      ],
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

  const svg = createHandDrawnDiagramSvg(spec);
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
    intent: "Hierarchy",
    template: "tree",
    visual_spec: {
      nodes,
      edges: [["A", "B"], ["A", "C"], ["B", "D"], ["B", "E"], ["C", "F"], ["F", "G"], ["G", "H"], ["G", "I"]],
      labels,
      highlight: "I",
      annotation: "自定义节点必须全部绘制。",
    },
  });

  const svg = createHandDrawnDiagramSvg(spec);
  assertIncludes(svg, nodes.map((node) => `#${node}`), "tree");
  assertIncludes(svg, Object.values(labels), "tree");
  assertNotIncludes(svg, ["#0", "#79", "Archive 不是 cache"], "tree");
}

function testInputsAreNotSilentlyTruncated() {
  const sequence = createHandDrawnDiagramSvg(baseSpec({
    id: "long_sequence",
    intent: "Sequence",
    template: "horizontal_sequence",
    visual_spec: {
      steps: Array.from({ length: 7 }, (_, idx) => ({ id: `s${idx}`, label: `步骤${idx + 1}`, note: `说明${idx + 1}` })),
      highlight: "s6",
    },
  }));
  assertIncludes(sequence, ["步骤1", "步骤7", "说明7"], "horizontal_sequence");

  const loop = createHandDrawnDiagramSvg(baseSpec({
    id: "long_loop",
    intent: "Loop",
    template: "closed_loop",
    visual_spec: {
      center: "循环中心",
      steps: Array.from({ length: 6 }, (_, idx) => ({ id: `l${idx}`, label: `环节${idx + 1}`, note: `反馈${idx + 1}` })),
      highlight: "l5",
    },
  }));
  assertIncludes(loop, ["环节1", "环节6", "反馈6"], "closed_loop");

  const matrix = createHandDrawnDiagramSvg(baseSpec({
    id: "dense_matrix",
    intent: "Matrix",
    template: "quadrant_matrix",
    visual_spec: {
      x_axis: { left: "低", right: "高", label: "横轴" },
      y_axis: { bottom: "低", top: "高", label: "纵轴" },
      items: Array.from({ length: 10 }, (_, idx) => ({ label: `对象${idx + 1}`, x: (idx + 1) / 11, y: ((idx * 3) % 10 + 1) / 11, note: `注${idx + 1}` })),
      highlight: "对象10",
    },
  }));
  assertIncludes(matrix, ["对象1", "对象10", "注10"], "quadrant_matrix");

  const network = createHandDrawnDiagramSvg(baseSpec({
    id: "dense_network",
    intent: "Network",
    template: "hub_spoke_network",
    visual_spec: {
      hub: { id: "hub", label: "中心" },
      nodes: Array.from({ length: 9 }, (_, idx) => ({ id: `n${idx}`, label: `节点${idx + 1}`, note: `连接${idx + 1}` })),
      edges: [["hub", "n0"], ["hub", "n1"], ["hub", "n2"], ["hub", "n3"], ["hub", "n4"], ["hub", "n5"], ["hub", "n6"], ["hub", "n7"], ["hub", "n8"], ["n8", "n0"]],
      highlight: "n8",
    },
  }));
  assertIncludes(network, ["节点1", "节点9", "连接9"], "hub_spoke_network");

  const bars = createHandDrawnDiagramSvg(baseSpec({
    id: "wide_bars",
    intent: "Quantity",
    template: "grouped_bar_chart",
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
      annotation: "宽表不能吞列。",
    },
  }));
  assertIncludes(bars, ["A", "G", "S1", "S4", "10"], "grouped_bar_chart");
}

function testValidatorRejectsDroppedRelationships() {
  assert.throws(
    () => validateHandDrawnDiagramSpec(baseSpec({
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
    () => validateHandDrawnDiagramSpec(baseSpec({
      id: "bad_arch_edge",
      intent: "Hierarchy",
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
    { id: "s1", label: "发现", note: "定位问题" },
    { id: "s2", label: "设计", note: "形成方案" },
    { id: "s3", label: "验证", note: "检查收益" },
    { id: "s4", label: "交付", note: "沉淀证据" },
  ];
  const lanes = [
    { id: "biz", label: "业务", steps: [{ id: "b1", label: "提出目标" }, { id: "b2", label: "确认价值" }] },
    { id: "agent", label: "Agent", steps: [{ id: "a1", label: "生成方案" }, { id: "a2", label: "执行验证" }] },
    { id: "review", label: "评审", steps: [{ id: "r1", label: "检查风险" }, { id: "r2", label: "批准发布" }] },
  ];
  const loopSteps = [
    { id: "observe", label: "观察", note: "收集信号" },
    { id: "decide", label: "判断", note: "选择策略" },
    { id: "act", label: "执行", note: "触发动作" },
    { id: "learn", label: "学习", note: "更新经验" },
  ];
  const hierarchyNodes = ["Root", "A", "B", "A1", "A2", "B1"];
  const hierarchyLabels = Object.fromEntries(hierarchyNodes.map((node) => [node, `${node} 能力`]));
  const graphNodes = [
    { id: "agent", label: "Agent", note: "中心调度" },
    { id: "model", label: "模型", note: "推理" },
    { id: "memory", label: "记忆", note: "检索" },
    { id: "tool", label: "工具", note: "执行" },
    { id: "eval", label: "评测", note: "反馈" },
  ];

  return [
    ["Quantity", "grouped_bar_chart", {
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
    ["Quantity", "donut_proportion_chart", {
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
    ["Sequence", "horizontal_process", { steps: processSteps, highlight: "s3" }, ["发现", "验证", "交付"]],
    ["Sequence", "vertical_process", { steps: processSteps, highlight: "s2" }, ["发现", "设计", "交付"]],
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
    ["Loop", "spiral_iteration_ladder", { center: "能力演进", steps: loopSteps.concat([{ id: "scale", label: "扩展", note: "放大收益" }]), highlight: "scale" }, ["能力演进", "观察", "扩展"]],
    ["Hierarchy", "tree", { nodes: hierarchyNodes, edges: [["Root", "A"], ["Root", "B"], ["A", "A1"], ["A", "A2"], ["B", "B1"]], labels: hierarchyLabels, highlight: "A2" }, ["#Root", "#A2", "A2 能力"]],
    ["Hierarchy", "layered_architecture", {
      layers: [
        { id: "l1", label: "入口层", items: ["门户", "API"] },
        { id: "l2", label: "服务层", items: ["策略", "编排"] },
        { id: "l3", label: "资源层", items: ["模型", "数据"] },
      ],
      side_modules: ["审计"],
      edges: [["门户", "策略"], ["API", "编排"], ["编排", "模型"], ["审计", "策略"]],
    }, ["入口层", "编排", "审计"]],
    ["Hierarchy", "pyramid_capability_stack", { levels: [{ label: "体验层", note: "用户价值" }, { label: "平台层", note: "通用能力" }, { label: "基础层", note: "数据模型" }], highlight: "平台层" }, ["体验层", "平台层", "基础层"]],
    ["Matrix", "quadrant_matrix", { x_axis: { left: "低", right: "高", label: "价值" }, y_axis: { bottom: "低", top: "高", label: "可行性" }, items: [{ label: "方案A", x: 0.2, y: 0.7 }, { label: "方案B", x: 0.8, y: 0.8 }], highlight: "方案B" }, ["价值", "可行性", "方案B"]],
    ["Matrix", "capability_matrix", { rows: ["产品", "工程"], columns: ["当前", "目标"], values: [["可用", "优秀"], ["手工", "自动"]], highlight: { row: "工程", column: "目标" } }, ["产品", "工程", "自动"]],
    ["Network", "hub_spoke_network", { hub: { id: "agent", label: "Agent" }, nodes: graphNodes.slice(1), edges: [["agent", "model"], ["agent", "memory"], ["agent", "tool"], ["agent", "eval"], ["memory", "eval"]], highlight: "eval" }, ["Agent", "模型", "评测"]],
    ["Network", "dependency_graph", { nodes: graphNodes, edges: [["agent", "model"], ["agent", "memory"], ["tool", "eval"], ["memory", "tool"]], highlight: "tool" }, ["Agent", "模型", "工具"]],
    ["Network", "module_interaction_map", { nodes: graphNodes, edges: [["agent", "model"], ["model", "memory"], ["memory", "tool"], ["tool", "eval"], ["eval", "agent"]], highlight: "eval" }, ["Agent", "记忆", "评测"]],
    ["Network", "causal_influence_graph", { nodes: graphNodes, edges: [["model", "agent"], ["memory", "agent"], ["agent", "tool"], ["tool", "eval"]], highlight: "agent" }, ["模型", "Agent", "评测"]],
  ].map(([intent, template, visual_spec, expected]) => baseSpec({
    id: `subclass_${template}`,
    title: `${template} Test`,
    intent,
    template,
    claim: `${template} 应导出图片。`,
    visual_spec,
    expected,
  }));
}

function testAllVisualBaseTemplatesExportImages() {
  const specs = allSubclassSpecs();
  assert.equal(specs.length, 20, "base template fixture count should cover visually distinct diagram capabilities");
  const uniqueTemplates = new Set(specs.map((spec) => spec.template));
  assert.equal(uniqueTemplates.size, specs.length, "each subclass fixture should use a distinct template key");

  for (const spec of specs) {
    const image = createHandDrawnDiagramImage(spec, { aspectRatio: "16:9", width: 1280 });
    assert.equal(image.format, "svg", `${spec.template} should export an SVG image`);
    assert.equal(image.width, 1280, `${spec.template} should honor requested width`);
    assert(image.height > 0, `${spec.template} should export a positive cropped height`);
    assert(image.height < image.width, `${spec.template} should crop to a landscape image element`);
    assertIncludes(image.svg, spec.expected, spec.template);
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
  const image = createHandDrawnDiagramImage(spec, { width: 1600 });
  assert.equal(image.width, 1600);
  assert(image.height > 0);
  const crop = parseViewBox(image.svg);
  assert(crop.w > 0 && crop.h > 0);
  assert(crop.w < 1600 && crop.h < 900);
  assert.throws(() => createHandDrawnDiagramImage(spec, { aspectRatio: "9:16", width: 900 }), /Unsupported diagram aspectRatio: 9:16/);
}

function testGeneratedCaseMatrixCoverage() {
  assert(generatedCaseMatrix.length >= 200, "generated case matrix should provide at least 10 variants per template");
  const byTemplate = new Map();
  generatedCaseMatrix.forEach((spec) => {
    validateHandDrawnDiagramSpec(spec);
    const list = byTemplate.get(spec.template) || [];
    list.push(spec);
    byTemplate.set(spec.template, list);
  });

  assert.equal(byTemplate.size, 20, "generated matrix should cover every base template");
  byTemplate.forEach((specs, template) => {
    assert(specs.length >= 10, `${template} should have at least 10 variants`);
    specs.forEach((spec) => assert.equal(spec.render_options?.aspectRatio, DEFAULT_LAYOUT, `${template} should use the chosen default layout`));
  });

  const spotChecks = [
    "horizontal_process_10",
    "dual_loop_10",
    "layered_architecture_10",
    "hub_spoke_network_10",
    "grouped_bar_chart_10",
  ];
  spotChecks.forEach((id) => {
    const spec = generatedCaseMatrix.find((entry) => entry.id === id);
    assert(spec, `matrix should include ${id}`);
    const image = createHandDrawnDiagramImage(spec, spec.render_options);
    assert.equal(image.format, "svg");
    assert(image.svg.startsWith("<svg"), `${id} should render svg markup`);
  });
}

testImageContractAndAspectRatio();
testLayeredArchitectureIsDataDriven();
testTreeIsDataDriven();
testInputsAreNotSilentlyTruncated();
testValidatorRejectsDroppedRelationships();
testAllVisualBaseTemplatesExportImages();
testTemplateLayoutDefaults();
testGeneratedCaseMatrixCoverage();

console.log("diagram helper contract tests passed");
