const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  chooseTemplateLayout,
  createVisualAnchorImage,
  createVisualAnchorSvg,
  getVisualAnchorRenderer,
  renderVisualAnchorRoughSvg,
  renderVisualAnchorPptNative,
  resolveVisualAnchorRenderPath,
  validateVisualAnchorSpec,
  writeVisualAnchorImage,
} = require("../pptx/hw_diagram_helpers");
const JSZip = require("jszip");
const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
const { cases: generatedCaseMatrix, DEFAULT_LAYOUT } = require("../../references/visual_diagram_test_cases");

process.env.HW_VISUAL_ANCHOR_RENDERER = "rough_svg";

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
  const sequence = createVisualAnchorSvg(baseSpec({
    id: "long_sequence",
    kind: "Sequence",
    template: "process",
    visual_spec: {
      steps: Array.from({ length: 7 }, (_, idx) => ({ id: `s${idx}`, label: `步骤${idx + 1}` })),
      highlight: "s6",
    },
  }));
  assertIncludes(sequence, ["步骤1", "步骤7"], "process");

  const loop = createVisualAnchorSvg(baseSpec({
    id: "long_loop",
    kind: "Loop",
    template: "closed_loop",
    visual_spec: {
      center: "循环中心",
      steps: Array.from({ length: 6 }, (_, idx) => ({ id: `l${idx}`, label: `环节${idx + 1}` })),
      highlight: "l5",
    },
  }));
  assertIncludes(loop, ["环节1", "环节6"], "closed_loop");

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
}

function testReasonableLongTextWrapsInsideSvgViews() {
  const tree = createVisualAnchorSvg(baseSpec({
    id: "long_text_tree",
    kind: "Hierarchy",
    template: "tree",
    visual_spec: {
      nodes: ["scripts", "pptx", "qa", "smoke", "helpers", "export", "checker", "tests"],
      edges: [["scripts", "pptx"], ["scripts", "qa"], ["scripts", "smoke"], ["pptx", "helpers"], ["pptx", "export"], ["qa", "checker"], ["smoke", "tests"]],
      labels: {
        scripts: "脚本入口统一调度工作区",
        pptx: "生成与导出目录职责边界清晰",
        qa: "交付前硬规则检查目录",
        smoke: "冒烟测试覆盖长文本",
        helpers: "页面框架与图表辅助函数",
        export: "PPTX 图片导出与参考图审阅",
        checker: "规则检查契约与样例",
        tests: "契约测试与长标签样例",
      },
      highlight: "pptx",
    },
  }));
  assertIncludes(tree, ["生成与导出", "硬规则", "冒烟测试"], "long_text_tree");
  assertNoOversizedSvgTextLine(tree, 520, "long_text_tree");

  const process = createVisualAnchorSvg(baseSpec({
    id: "long_text_process",
    kind: "Sequence",
    template: "process",
    visual_spec: {
      steps: [
        { id: "plan", label: "先完成页面级观点规划" },
        { id: "render", label: "SVG helper 文本按宽度换行" },
        { id: "qa", label: "导出图片逐页视觉检查" },
        { id: "ship", label: "沉淀为可复用技能契约" },
      ],
      highlight: "render",
    },
  }));
  assertIncludes(process, ["SVG", "视觉", "helper"], "long_text_process");
  assertNoOversizedSvgTextLine(process, 620, "long_text_process");

  const network = createVisualAnchorSvg(baseSpec({
    id: "long_text_network",
    kind: "Network",
    template: "hub_spoke_network",
    visual_spec: {
      hub: { id: "hub", label: "hw-ppt-gen 统一渲染入口" },
      nodes: [
        { id: "diagram", label: "hw_diagram_helpers.js" },
        { id: "native", label: "ppt_native fallback renderer" },
        { id: "qa", label: "check_huawei_pptx.js" },
        { id: "export", label: "export_pptx_images.js" },
      ],
      edges: [["hub", "diagram"], ["hub", "native"], ["hub", "qa"], ["hub", "export"], ["diagram", "qa"]],
      highlight: "diagram",
    },
  }));
  assertIncludes(network, ["hw_diagram", "fallback", "export_pptx"], "long_text_network");
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
    ["Sequence", "process", {
      steps: [
        { id: "read", label: "读取材料" },
        { id: "plan", label: "页面计划" },
        { id: "render", label: "渲染锚点" },
        { id: "qa", label: "质量检查" },
      ],
      highlight: "render",
    }],
    ["Sequence", "process", {
      orientation: "vertical",
      steps: [
        { id: "a", label: "阶段一" },
        { id: "b", label: "阶段二" },
        { id: "c", label: "阶段三" },
      ],
      highlight: "b",
    }],
    ["Loop", "closed_loop", {
      center: "视觉锚点 QA",
      steps: [
        { id: "render", label: "渲染" },
        { id: "record", label: "记录" },
        { id: "check", label: "检查" },
        { id: "fix", label: "修正" },
      ],
      highlight: "check",
    }],
    ["Hierarchy", "capability_stack", {
      levels: [
        { label: "解释模块" },
        { label: "视觉锚点" },
        { label: "页面骨架" },
      ],
      highlight: "视觉锚点",
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

function testOverflowAndTinyTextAreRejected() {
  assert.throws(
    () => createVisualAnchorSvg(baseSpec({
      id: "too_dense_process",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          {
            id: "dense",
            label: "这是一个明显超过流程节点两行容量的超长阶段标题，应该拒绝渲染而不是自动省略或继续缩小字体",
          },
          { id: "ok", label: "交付" },
        ],
        highlight: "dense",
      },
    })),
    /Diagram text exceeds/
  );

  assert.throws(
    () => createVisualAnchorSvg(baseSpec({
      id: "tiny_quadrant_label",
      kind: "Matrix",
      template: "quadrant_matrix",
      visual_spec: {
        x_axis: { left: "低", right: "高", label: "价值" },
        y_axis: { bottom: "低", top: "高", label: "可行性" },
        items: Array.from({ length: 13 }, (_, idx) => ({ label: `对象${idx + 1}`, x: (idx + 1) / 14, y: ((idx * 5) % 13 + 1) / 14 })),
      },
    })),
    /quadrant_matrix supports at most 8 items/
  );
}

async function testNativeRendererRejectsShrinkFitAndOverflow() {
  const pptx = createHuaweiDeck({ title: "native text guard" });
  const slide = pptx.addSlide();
  assert.throws(
    () => renderVisualAnchorPptNative(slide, baseSpec({
      id: "native_process_overflow",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          {
            id: "s1",
            label: "这是一个明显超过 PPT 原生流程节点容量的超长阶段标题，不能依靠 PowerPoint shrink fit 缩小",
          },
          { id: "s2", label: "交付" },
        ],
        highlight: "s1",
      },
    }), { x: 0.7, y: 1.1, w: 3, h: 2 }),
    /ppt_native text exceeds/
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
    const image = createVisualAnchorImage(spec, { aspectRatio: "16:9", width: 1280 });
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
  const image = createVisualAnchorImage(spec, { width: 1600 });
  assert.equal(image.width, 1600);
  assert(image.height > 0);
  const crop = parseViewBox(image.svg);
  assert(crop.w > 0 && crop.h > 0);
  assert(crop.w < 1600 && crop.h < 900);
  assert.throws(() => createVisualAnchorImage(spec, { aspectRatio: "9:16", width: 900 }), /Unsupported diagram aspectRatio: 9:16/);
}

function testGeneratedCaseMatrixCoverage() {
  assert(generatedCaseMatrix.length >= 200, "generated case matrix should provide at least 10 variants per template");
  const byTemplate = new Map();
  const roughCases = [];
  const fixedCases = [];
  generatedCaseMatrix.forEach((spec) => {
    validateVisualAnchorSpec(spec);
    const renderPath = resolveVisualAnchorRenderPath(spec, { HW_VISUAL_ANCHOR_RENDERER: "rough_svg" });
    if (renderPath === "rough_svg") {
      roughCases.push(spec);
      const list = byTemplate.get(spec.template) || [];
      list.push(spec);
      byTemplate.set(spec.template, list);
    } else {
      fixedCases.push({ spec, renderPath });
    }
  });

  assert.equal(byTemplate.size, 20, "generated matrix should cover every rough-svg base template");
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
  assert(roughCases.length >= 200, "rough-svg case matrix should still provide at least 10 variants per rough template");
  assert(fixedCases.some(({ spec, renderPath }) => spec.kind === "Evidence" && renderPath === "evidence"), "matrix should include a fixed-rule Evidence case");
  assert(fixedCases.some(({ spec, renderPath }) => spec.kind === "Matrix" && spec.template === "table" && renderPath === "ppt_native"), "matrix should include a fixed-rule native table case");

  const spotCheckTemplates = ["process", "layered_architecture", "hub_spoke_network", "bar_chart"];
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
  renderVisualAnchorPptNative(slide, baseSpec({
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
  }), { x: 0.7, y: 1.1, w: 7.5, h: 4.7 });
  const buffer = await pptx.write({ outputType: "nodebuffer" });
  const zip = await JSZip.loadAsync(buffer);
  const slideXml = await zip.files["ppt/slides/slide1.xml"].async("string");
  const negativeExtents = [...slideXml.matchAll(/<a:ext cx="(-?\d+)" cy="(-?\d+)"/g)]
    .filter((match) => Number(match[1]) < 0 || Number(match[2]) < 0);
  assert.deepStrictEqual(negativeExtents, [], "ppt_native network connectors must not emit negative extents");
}

async function main() {
  testImageContractAndAspectRatio();
  testLayeredArchitectureIsDataDriven();
  testTreeIsDataDriven();
  testInputsAreNotSilentlyTruncated();
  testReasonableLongTextWrapsInsideSvgViews();
  testStandaloneExplanationTextStaysOutOfSvg();
  testOverflowAndTinyTextAreRejected();
  testLayeredArchitectureKeepsSideModuleEdges();
  testValidatorRejectsDroppedRelationships();
  testAllVisualBaseTemplatesExportImages();
  testTemplateLayoutDefaults();
  testGeneratedCaseMatrixCoverage();
  await testNativeNetworkUsesPowerPointSafeExtents();
  await testNativeRendererRejectsShrinkFitAndOverflow();
  testRendererIsRuntimeOnly();

  console.log("visual anchor helper contract tests passed");
}

function testRendererIsRuntimeOnly() {
  assert.equal(getVisualAnchorRenderer({}), "rough_svg");
  assert.equal(getVisualAnchorRenderer({ HW_VISUAL_ANCHOR_RENDERER: "ppt_native" }), "ppt_native");
  assert.throws(() => getVisualAnchorRenderer({ HW_VISUAL_ANCHOR_RENDERER: "auto" }), /Unsupported HW_VISUAL_ANCHOR_RENDERER/);
  assert.equal(resolveVisualAnchorRenderPath(baseSpec({ kind: "Quantity", template: "bar_chart", visual_spec: { y_label: "得分", categories: ["A"], series: [{ name: "S", values: [1] }] } }), { HW_VISUAL_ANCHOR_RENDERER: "ppt_native" }), "ppt_native");
  assert.equal(resolveVisualAnchorRenderPath(baseSpec({ kind: "Matrix", template: "table", visual_spec: { rows: [["A"]] } }), { HW_VISUAL_ANCHOR_RENDERER: "rough_svg" }), "ppt_native");
  assert.equal(resolveVisualAnchorRenderPath(baseSpec({ kind: "Evidence", template: "source_figure", source: { path: "figure.png", caption: "来源图" }, visual_spec: undefined }), { HW_VISUAL_ANCHOR_RENDERER: "rough_svg" }), "evidence");
  assert.throws(() => validateVisualAnchorSpec(baseSpec({ renderer: "rough_svg" })), /renderer is a runtime setting/);
  assert.throws(() => validateVisualAnchorSpec({ id: "old", title: "Old", claim: "旧接口。", intent: "Quantity", template: "bar_chart", visual_spec: {} }), /Use kind instead/);
  const svgPolicySpec = baseSpec({ visual_spec: { nodes: ["A", "B"], edges: [["A", "B"]], labels: { A: "起点", B: "终点" }, highlight: "B" } });
  const previousRenderer = process.env.HW_VISUAL_ANCHOR_RENDERER;
  process.env.HW_VISUAL_ANCHOR_RENDERER = "ppt_native";
  assert.throws(() => createVisualAnchorSvg(svgPolicySpec), /not rough_svg SVG export/);
  assert.throws(() => renderVisualAnchorRoughSvg(svgPolicySpec), /not rough_svg/);
  process.env.HW_VISUAL_ANCHOR_RENDERER = previousRenderer;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
