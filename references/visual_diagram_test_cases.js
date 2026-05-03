const DEFAULT_LAYOUT = "16:9";

function variedText(base, idx, variant = 0) {
  const samples = [
    `${base}${idx + 1}`,
    `${base}${idx + 1}职责清晰`,
    `${base}${idx + 1}统一调度`,
    `${base}${idx + 1}生成导出`,
    `${base}${idx + 1}规则检查`,
    `${base}${idx + 1}原生回退`,
    `${base}${idx + 1}交付审阅`,
    `${base}${idx + 1}协同路径`,
    `${base}${idx + 1}长文回归`,
    `${base}${idx + 1}视觉锚点长文本回归`,
  ];
  return samples[(idx + variant) % samples.length];
}

function makeSteps(prefix, count, labelBase, _noteBase, variant = 0) {
  return Array.from({ length: count }, (_, idx) => ({
    id: `${prefix}${idx + 1}`,
    label: variedText(labelBase, idx, variant),
  }));
}

function makeTree(count, variant = 0) {
  const nodes = Array.from({ length: count }, (_, idx) => `N${idx + 1}`);
  const edges = [];
  for (let idx = 1; idx < count; idx += 1) {
    edges.push([nodes[Math.floor((idx - 1) / 2)], nodes[idx]]);
  }
  const labels = Object.fromEntries(nodes.map((node, idx) => [node, idx % 3 === 0 ? `${20 + idx * 3}%` : variedText("节点", idx, variant)]));
  return { nodes, edges, labels, highlight: nodes[nodes.length - 1] };
}

function makeLayeredArchitecture(layerCount, itemsPerLayer, sideCount, variant = 0) {
  const layers = Array.from({ length: layerCount }, (_, layerIdx) => ({
    id: `l${layerIdx + 1}`,
    label: `${variedText("第", layerIdx, variant)}层`,
    items: Array.from({ length: itemsPerLayer[layerIdx] || itemsPerLayer[itemsPerLayer.length - 1] || 2 }, (_, itemIdx) => variedText(`L${layerIdx + 1}-`, itemIdx, variant + layerIdx)),
  }));
  const side_modules = Array.from({ length: sideCount }, (_, idx) => variedText("侧向能力", idx, variant + 2));
  const edges = [];
  for (let layerIdx = 0; layerIdx < layers.length - 1; layerIdx += 1) {
    const fromItems = layers[layerIdx].items;
    const toItems = layers[layerIdx + 1].items;
    fromItems.forEach((from, idx) => edges.push([from, toItems[idx % toItems.length]]));
  }
  side_modules.slice(0, Math.min(side_modules.length, layers[1]?.items.length || 0)).forEach((side, idx) => {
    edges.push([side, layers[1].items[idx]]);
  });
  return { layers, side_label: variedText("侧向组", 0, variant), side_modules, edges };
}

function makeQuadrantItems(count, variant = 0) {
  return Array.from({ length: count }, (_, idx) => ({
    label: variedText("对象", idx, variant),
    x: Number((((idx % 5) + 1) / 6).toFixed(2)),
    y: Number((((idx * 3) % 5 + 1) / 6).toFixed(2)),
  }));
}

function makeNetworkNodes(count, prefix = "节点", variant = 0) {
  return Array.from({ length: count }, (_, idx) => ({
    id: `n${idx + 1}`,
    label: variedText(prefix, idx, variant),
  }));
}

function withMeta(id, kind, template, claim, visual_spec, layout = DEFAULT_LAYOUT) {
  return {
    id,
    title: id,
    kind,
    template,
    claim,
    layout,
    render_options: { aspectRatio: layout },
    visual_spec,
  };
}

function buildTemplateCases() {
  const cases = [];
  const add = (template, builder) => {
    for (let idx = 0; idx < 10; idx += 1) {
      cases.push(builder(idx, DEFAULT_LAYOUT));
    }
  };

  add("data_cards", (idx, aspectRatio) => {
    const cards = Array.from({ length: 2 + (idx % 3) }, (_, cardIdx) => ({
      id: `k${cardIdx + 1}`,
      label: variedText("指标", cardIdx, idx),
      value: `${20 + idx * 3 + cardIdx * 7}`,
      unit: cardIdx % 2 ? "%" : "分",
    }));
    return withMeta(`data_cards_${idx + 1}`, "Quantity", "data_cards", "KPI 卡片属于数量型视觉锚点，同一语义可走 rough_svg 或 PPT 原生。", {
      cards,
      highlight: cards[cards.length - 1].id,
    }, aspectRatio);
  });

  add("bar_chart", (idx, aspectRatio) => {
    const categoryCount = 3 + (idx % 6);
    const seriesCount = 2 + (idx % 3);
    const categories = Array.from({ length: categoryCount }, (_, i) => variedText("Q", i, idx));
    const series = Array.from({ length: seriesCount }, (_, seriesIdx) => ({
      name: variedText("系列", seriesIdx, idx + 1),
      values: categories.map((_, i) => 10 + seriesIdx * 4 + i * (2 + ((idx + seriesIdx) % 3))),
    }));
    return withMeta(`bar_chart_${idx + 1}`, "Quantity", "bar_chart", "多系列柱状图需要同时适配不同栏目数和系列数。", {
      y_label: variedText("Score", 0, idx),
      categories,
      series,
      highlight: { category: categories[categories.length - 1], series: series[series.length - 1].name },
    }, aspectRatio);
  });

  add("line_chart", (idx, aspectRatio) => {
    const pointCount = 4 + (idx % 5);
    const seriesCount = 2 + (idx % 2);
    const categories = Array.from({ length: pointCount }, (_, i) => variedText("T", i, idx));
    const series = Array.from({ length: seriesCount }, (_, seriesIdx) => ({
      name: variedText("趋势", seriesIdx, idx + 2),
      values: categories.map((_, i) => 12 + seriesIdx * 8 + i * (3 + ((idx + i) % 2))),
    }));
    return withMeta(`line_chart_${idx + 1}`, "Quantity", "line_chart", "折线图需要覆盖不同采样点密度和多条趋势线。", {
      y_label: variedText("Rate", 0, idx),
      categories,
      series,
      highlight: { category: categories[categories.length - 1], series: series[0].name },
    }, aspectRatio);
  });

  add("proportion_chart", (idx, aspectRatio) => {
    const segmentCount = 3 + (idx % 4);
    const segments = Array.from({ length: segmentCount }, (_, i) => ({ label: variedText("来源", i, idx), value: 10 + i * 7 + idx }));
    return withMeta(`proportion_chart_${idx + 1}`, "Quantity", "proportion_chart", "环形图需要在不同分段数量下保持可读。", {
      total_label: variedText("结构占比", 0, idx),
      segments,
      highlight: segments[Math.floor(segmentCount / 2)].label,
    }, aspectRatio);
  });

  add("heatmap", (idx, aspectRatio) => {
    const rowCount = 3 + (idx % 3);
    const colCount = 3 + ((idx + 1) % 4);
    const rows = Array.from({ length: rowCount }, (_, i) => variedText("维度", i, idx));
    const columns = Array.from({ length: colCount }, (_, i) => variedText("方案", i, idx + 1));
    const values = rows.map((_, r) => columns.map((_, c) => Number((((r + 1) * (c + 2) + idx) % 10 / 10).toFixed(1))));
    return withMeta(`heatmap_${idx + 1}`, "Quantity", "heatmap", "热力图需要覆盖不同二维表规模。", {
      rows,
      columns,
      values,
      highlight: { row: rows[rows.length - 1], column: columns[columns.length - 1] },
    }, aspectRatio);
  });

  add("process", (idx, aspectRatio) => withMeta(`process_${idx + 1}`, "Sequence", "process", "横向流程图需要在步骤变多时自动换行或收窄。", {
    steps: makeSteps("hp", 3 + (idx % 6), "阶段", "说明", idx),
    highlight: `hp${3 + (idx % 6)}`,
  }, aspectRatio));

  add("process", (idx, aspectRatio) => withMeta(`process_vertical_${idx + 1}`, "Sequence", "process", "纵向流程图需要覆盖不同层级长度。", {
    steps: makeSteps("vp", 3 + (idx % 5), "关口", "动作", idx + 1),
    orientation: "vertical",
    highlight: `vp${2 + (idx % 5)}`,
  }, aspectRatio));

  add("timeline", (idx, aspectRatio) => withMeta(`timeline_${idx + 1}`, "Sequence", "timeline", "时间线需要兼容横版、方版和竖版。", {
    steps: makeSteps("tl", 3 + (idx % 5), "里程碑", "结果", idx).map((step, i) => ({ ...step, time: variedText("M", i, idx) })),
    highlight: `tl${3 + (idx % 5)}`,
  }, aspectRatio));

  add("swimlane", (idx, aspectRatio) => {
    const laneCount = 2 + (idx % 4);
    const stepCount = 2 + (idx % 3);
    const lanes = Array.from({ length: laneCount }, (_, laneIdx) => ({
      id: `lane${laneIdx + 1}`,
      label: variedText("角色", laneIdx, idx),
      steps: Array.from({ length: stepCount }, (_, stepIdx) => ({
        id: `lane${laneIdx + 1}_step${stepIdx + 1}`,
        label: variedText(`动作${laneIdx + 1}-`, stepIdx, idx + laneIdx),
      })),
    }));
    return withMeta(`swimlane_${idx + 1}`, "Sequence", "swimlane", "泳道图需要覆盖角色数和每道步骤数同时变化。", {
      lanes,
      highlight: lanes[Math.floor(laneCount / 2)].steps[stepCount - 1].id,
    }, aspectRatio);
  });

  add("closed_loop", (idx, aspectRatio) => withMeta(`closed_loop_${idx + 1}`, "Loop", "closed_loop", "闭环图需要覆盖 4 到 7 个环节。", {
    center: variedText("Agent Loop", 0, idx),
    steps: makeSteps("cl", 4 + (idx % 4), "环节", "反馈", idx),
    highlight: `cl${4 + (idx % 4)}`,
  }, aspectRatio));

  add("dual_loop", (idx, aspectRatio) => {
    const loopCount = 2 + (idx % 3);
    const loops = Array.from({ length: loopCount }, (_, loopIdx) => ({
      id: `loop${loopIdx + 1}`,
      label: variedText("循环", loopIdx, idx),
      steps: makeSteps(`dl${loopIdx + 1}_`, 2 + ((idx + loopIdx) % 3), "步骤", "反馈", idx + loopIdx).map((step) => ({ id: step.id, label: step.label })),
    }));
    return withMeta(`dual_loop_${idx + 1}`, "Loop", "dual_loop", "双环图现在要支持 2 到 4 个环。", {
      loops,
      highlight: loops[loops.length - 1].id,
    }, aspectRatio);
  });

  add("spiral_iteration_ladder", (idx, aspectRatio) => withMeta(`spiral_iteration_ladder_${idx + 1}`, "Loop", "spiral_iteration_ladder", "螺旋梯需要覆盖更长的演进路径。", {
    center: variedText("能力爬升", 0, idx),
    steps: makeSteps("sp", 4 + (idx % 5), "阶段", "增益", idx),
    highlight: `sp${4 + (idx % 5)}`,
  }, aspectRatio));

  add("tree", (idx, aspectRatio) => withMeta(`tree_${idx + 1}`, "Hierarchy", "tree", "树图需要在节点变多时保持分层清晰。", makeTree(5 + idx, idx), aspectRatio));

  add("layered_architecture", (idx, aspectRatio) => withMeta(`layered_architecture_${idx + 1}`, "Hierarchy", "layered_architecture", "分层架构图需要覆盖层数、层内元素数和侧向能力数量变化。", makeLayeredArchitecture(3 + (idx % 3), [2 + (idx % 3), 3 + (idx % 2), 2 + ((idx + 1) % 3), 2], 1 + (idx % 5), idx), aspectRatio));

  add("capability_stack", (idx, aspectRatio) => withMeta(`capability_stack_${idx + 1}`, "Hierarchy", "capability_stack", "金字塔需要覆盖 3 到 6 层的成熟度表达。", {
    levels: Array.from({ length: 3 + (idx % 4) }, (_, i) => ({ label: variedText("能力层", i, idx) })),
    highlight: variedText("能力层", 1 + (idx % 3), idx),
  }, aspectRatio));

  add("quadrant_matrix", (idx, aspectRatio) => {
    const items = makeQuadrantItems(3 + idx, idx);
    return withMeta(`quadrant_matrix_${idx + 1}`, "Matrix", "quadrant_matrix", "四象限图需要覆盖更密的点位分布。", {
      x_axis: { left: variedText("低价值", 0, idx), right: variedText("高价值", 0, idx + 1), label: variedText("价值", 0, idx) },
      y_axis: { bottom: variedText("低可行", 0, idx), top: variedText("高可行", 0, idx + 1), label: variedText("可行性", 0, idx) },
      items,
      highlight: items[items.length - 1].label,
    }, aspectRatio);
  });

  add("capability_matrix", (idx, aspectRatio) => {
    const rowCount = 2 + (idx % 4);
    const colCount = 2 + ((idx + 1) % 4);
    const rows = Array.from({ length: rowCount }, (_, i) => variedText("对象", i, idx));
    const columns = Array.from({ length: colCount }, (_, i) => variedText("阶段", i, idx + 1));
    const values = rows.map((_, r) => columns.map((_, c) => variedText(`值${r + 1}-`, c, idx)));
    return withMeta(`capability_matrix_${idx + 1}`, "Matrix", "capability_matrix", "能力矩阵需要覆盖不同表格长宽。", {
      rows,
      columns,
      values,
      highlight: { row: rows[rows.length - 1], column: columns[columns.length - 1] },
    }, aspectRatio);
  });

  add("hub_spoke_network", (idx, aspectRatio) => {
    const nodes = makeNetworkNodes(3 + idx, "节点", idx);
    const hub = { id: "hub", label: variedText("中枢", 0, idx) };
    const edges = nodes.map((node) => [hub.id, node.id]).concat(nodes.length > 2 ? [[nodes[0].id, nodes[nodes.length - 1].id]] : []);
    return withMeta(`hub_spoke_network_${idx + 1}`, "Network", "hub_spoke_network", "中心辐射网络需要覆盖外围节点不断增多。", {
      hub,
      nodes,
      edges,
      highlight: nodes[nodes.length - 1].id,
    }, aspectRatio);
  });

  add("dependency_graph", (idx, aspectRatio) => {
    const nodes = makeNetworkNodes(4 + idx, "模块", idx);
    const edges = nodes.slice(0, -1).map((node, i) => [node.id, nodes[i + 1].id]).concat(nodes.length > 4 ? [[nodes[0].id, nodes[nodes.length - 1].id]] : []);
    return withMeta(`dependency_graph_${idx + 1}`, "Network", "dependency_graph", "依赖图需要覆盖链式和跨层依赖。", {
      nodes,
      edges,
      highlight: nodes[Math.floor(nodes.length / 2)].id,
    }, aspectRatio);
  });

  add("module_interaction_map", (idx, aspectRatio) => {
    const nodes = makeNetworkNodes(4 + idx, "服务", idx);
    const edges = nodes.map((node, i) => [node.id, nodes[(i + 1) % nodes.length].id]);
    return withMeta(`module_interaction_map_${idx + 1}`, "Network", "module_interaction_map", "模块交互图需要覆盖回路和闭合调用。", {
      nodes,
      edges,
      highlight: nodes[0].id,
    }, aspectRatio);
  });

  add("causal_influence_graph", (idx, aspectRatio) => {
    const nodes = makeNetworkNodes(4 + idx, "因子", idx);
    const edges = nodes.slice(0, -1).map((node, i) => [node.id, nodes[i + 1].id]);
    return withMeta(`causal_influence_graph_${idx + 1}`, "Network", "causal_influence_graph", "因果图需要覆盖更多影响因子。", {
      nodes,
      edges,
      highlight: nodes[nodes.length - 1].id,
    }, aspectRatio);
  });

  cases.push(withMeta("long_text_tree_1", "Hierarchy", "tree", "长文本回归：树图节点需要在合理长度内换行，不与相邻节点重叠。", {
    nodes: ["scripts", "pptx", "qa", "smoke", "helpers", "export", "checker", "tests"],
    edges: [
      ["scripts", "pptx"],
      ["scripts", "qa"],
      ["scripts", "smoke"],
      ["pptx", "helpers"],
      ["pptx", "export"],
      ["qa", "checker"],
      ["smoke", "tests"],
    ],
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
  }, DEFAULT_LAYOUT));

  cases.push(withMeta("long_text_process_1", "Sequence", "process", "长文本回归：流程节点的中文说明和英文 helper 名称需要被限制在卡片内。", {
    steps: [
      { id: "plan", label: "先完成页面级观点规划" },
      { id: "render", label: "SVG 图内文本按宽度换行" },
      { id: "qa", label: "导出图片逐页视觉检查" },
      { id: "ship", label: "沉淀为可复用技能契约" },
    ],
    highlight: "render",
  }, DEFAULT_LAYOUT));

  cases.push(withMeta("long_text_hub_spoke_network_1", "Network", "hub_spoke_network", "长文本回归：网络节点中的文件名、renderer 名称和中文注释需要保持可读。", {
    hub: { id: "hub", label: "hw-ppt-gen 统一渲染入口" },
    nodes: [
      { id: "diagram", label: "hw_diagram_helpers.js" },
      { id: "native", label: "ppt_native fallback renderer" },
      { id: "qa", label: "check_huawei_pptx.js" },
      { id: "export", label: "export_pptx_images.js" },
    ],
    edges: [["hub", "diagram"], ["hub", "native"], ["hub", "qa"], ["hub", "export"], ["diagram", "qa"]],
    highlight: "diagram",
  }, DEFAULT_LAYOUT));

  cases.push({
    id: "evidence_source_figure_1",
    title: "evidence_source_figure_1",
    kind: "Evidence",
    template: "source_figure",
    claim: "原始图像作为视觉锚点时不进入 renderer 分支，而由证据模块处理。",
    layout: DEFAULT_LAYOUT,
    source: {
      path: "assets/slides_ref/10 内容 图文并茂2.png",
      caption: "图文并茂参考：大视觉区域与侧边解读共同构成证据模块。",
      relevance: "high",
      treatment: "fit_with_legend",
    },
  });

  cases.push(withMeta("matrix_table_1", "Matrix", "table", "生成或转写表格作为视觉锚点时固定使用 PPT 原生表格。", {
    rows: [
      ["能力", "当前状态", "统一后规则"],
      ["原始表格", "散落在页面逻辑中", "Matrix/table 固定 native"],
      ["概念图", "由模板分别处理", "统一 visual anchor"],
      ["原图索引", "证据引用", "Evidence 固定证据模块"],
    ],
  }, DEFAULT_LAYOUT));

  return cases;
}

const cases = buildTemplateCases();

module.exports = {
  DEFAULT_LAYOUT,
  cases,
  buildTemplateCases,
};
