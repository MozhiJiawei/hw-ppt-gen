const DEFAULT_LAYOUT = "16:9";

function makeSteps(prefix, count, labelBase, noteBase) {
  return Array.from({ length: count }, (_, idx) => ({
    id: `${prefix}${idx + 1}`,
    label: `${labelBase}${idx + 1}`,
    note: `${noteBase}${idx + 1}`,
  }));
}

function makeTree(count) {
  const nodes = Array.from({ length: count }, (_, idx) => `N${idx + 1}`);
  const edges = [];
  for (let idx = 1; idx < count; idx += 1) {
    edges.push([nodes[Math.floor((idx - 1) / 2)], nodes[idx]]);
  }
  const labels = Object.fromEntries(nodes.map((node, idx) => [node, `${20 + idx * 3}%`]));
  return { nodes, edges, labels, highlight: nodes[nodes.length - 1] };
}

function makeLayeredArchitecture(layerCount, itemsPerLayer, sideCount) {
  const layers = Array.from({ length: layerCount }, (_, layerIdx) => ({
    id: `l${layerIdx + 1}`,
    label: `第${layerIdx + 1}层`,
    items: Array.from({ length: itemsPerLayer[layerIdx] || itemsPerLayer[itemsPerLayer.length - 1] || 2 }, (_, itemIdx) => `L${layerIdx + 1}-${itemIdx + 1}`),
  }));
  const side_modules = Array.from({ length: sideCount }, (_, idx) => `S${idx + 1}`);
  const edges = [];
  for (let layerIdx = 0; layerIdx < layers.length - 1; layerIdx += 1) {
    const fromItems = layers[layerIdx].items;
    const toItems = layers[layerIdx + 1].items;
    fromItems.forEach((from, idx) => edges.push([from, toItems[idx % toItems.length]]));
  }
  side_modules.slice(0, Math.min(side_modules.length, layers[1]?.items.length || 0)).forEach((side, idx) => {
    edges.push([side, layers[1].items[idx]]);
  });
  return { layers, side_modules, edges };
}

function makeQuadrantItems(count) {
  return Array.from({ length: count }, (_, idx) => ({
    label: `对象${idx + 1}`,
    x: Number((((idx % 5) + 1) / 6).toFixed(2)),
    y: Number((((idx * 3) % 5 + 1) / 6).toFixed(2)),
    note: `注${idx + 1}`,
  }));
}

function makeNetworkNodes(count, prefix = "节点") {
  return Array.from({ length: count }, (_, idx) => ({
    id: `n${idx + 1}`,
    label: `${prefix}${idx + 1}`,
    note: `连接${idx + 1}`,
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
      label: `指标${cardIdx + 1}`,
      value: `${20 + idx * 3 + cardIdx * 7}`,
      unit: cardIdx % 2 ? "%" : "分",
      note: `变化${cardIdx + 1}`,
    }));
    return withMeta(`data_cards_${idx + 1}`, "Quantity", "data_cards", "KPI 卡片属于数量型视觉锚点，同一语义可走 rough_svg 或 PPT 原生。", {
      cards,
      highlight: cards[cards.length - 1].id,
    }, aspectRatio);
  });

  add("bar_chart", (idx, aspectRatio) => {
    const categoryCount = 3 + (idx % 6);
    const seriesCount = 2 + (idx % 3);
    const categories = Array.from({ length: categoryCount }, (_, i) => `Q${i + 1}`);
    const series = Array.from({ length: seriesCount }, (_, seriesIdx) => ({
      name: `系列${seriesIdx + 1}`,
      values: categories.map((_, i) => 10 + seriesIdx * 4 + i * (2 + ((idx + seriesIdx) % 3))),
    }));
    return withMeta(`bar_chart_${idx + 1}`, "Quantity", "bar_chart", "多系列柱状图需要同时适配不同栏目数和系列数。", {
      y_label: "Score",
      categories,
      series,
      highlight: { category: categories[categories.length - 1], series: series[series.length - 1].name },
    }, aspectRatio);
  });

  add("line_chart", (idx, aspectRatio) => {
    const pointCount = 4 + (idx % 5);
    const seriesCount = 2 + (idx % 2);
    const categories = Array.from({ length: pointCount }, (_, i) => `T${i + 1}`);
    const series = Array.from({ length: seriesCount }, (_, seriesIdx) => ({
      name: `趋势${seriesIdx + 1}`,
      values: categories.map((_, i) => 12 + seriesIdx * 8 + i * (3 + ((idx + i) % 2))),
    }));
    return withMeta(`line_chart_${idx + 1}`, "Quantity", "line_chart", "折线图需要覆盖不同采样点密度和多条趋势线。", {
      y_label: "Rate",
      categories,
      series,
      highlight: { category: categories[categories.length - 1], series: series[0].name },
    }, aspectRatio);
  });

  add("proportion_chart", (idx, aspectRatio) => {
    const segmentCount = 3 + (idx % 4);
    const segments = Array.from({ length: segmentCount }, (_, i) => ({ label: `来源${i + 1}`, value: 10 + i * 7 + idx }));
    return withMeta(`proportion_chart_${idx + 1}`, "Quantity", "proportion_chart", "环形图需要在不同分段数量下保持可读。", {
      total_label: "结构占比",
      segments,
      highlight: segments[Math.floor(segmentCount / 2)].label,
    }, aspectRatio);
  });

  add("heatmap", (idx, aspectRatio) => {
    const rowCount = 3 + (idx % 3);
    const colCount = 3 + ((idx + 1) % 4);
    const rows = Array.from({ length: rowCount }, (_, i) => `维度${i + 1}`);
    const columns = Array.from({ length: colCount }, (_, i) => `方案${i + 1}`);
    const values = rows.map((_, r) => columns.map((_, c) => Number((((r + 1) * (c + 2) + idx) % 10 / 10).toFixed(1))));
    return withMeta(`heatmap_${idx + 1}`, "Quantity", "heatmap", "热力图需要覆盖不同二维表规模。", {
      rows,
      columns,
      values,
      highlight: { row: rows[rows.length - 1], column: columns[columns.length - 1] },
    }, aspectRatio);
  });

  add("process", (idx, aspectRatio) => withMeta(`process_${idx + 1}`, "Sequence", "process", "横向流程图需要在步骤变多时自动换行或收窄。", {
    steps: makeSteps("hp", 3 + (idx % 6), "阶段", "说明"),
    highlight: `hp${3 + (idx % 6)}`,
  }, aspectRatio));

  add("process", (idx, aspectRatio) => withMeta(`process_vertical_${idx + 1}`, "Sequence", "process", "纵向流程图需要覆盖不同层级长度。", {
    steps: makeSteps("vp", 3 + (idx % 5), "关口", "动作"),
    orientation: "vertical",
    highlight: `vp${2 + (idx % 5)}`,
  }, aspectRatio));

  add("timeline", (idx, aspectRatio) => withMeta(`timeline_${idx + 1}`, "Sequence", "timeline", "时间线需要兼容横版、方版和竖版。", {
    steps: makeSteps("tl", 3 + (idx % 5), "里程碑", "结果").map((step, i) => ({ ...step, time: `M${i + 1}` })),
    highlight: `tl${3 + (idx % 5)}`,
  }, aspectRatio));

  add("swimlane", (idx, aspectRatio) => {
    const laneCount = 2 + (idx % 4);
    const stepCount = 2 + (idx % 3);
    const lanes = Array.from({ length: laneCount }, (_, laneIdx) => ({
      id: `lane${laneIdx + 1}`,
      label: `角色${laneIdx + 1}`,
      steps: Array.from({ length: stepCount }, (_, stepIdx) => ({
        id: `lane${laneIdx + 1}_step${stepIdx + 1}`,
        label: `动作${laneIdx + 1}-${stepIdx + 1}`,
      })),
    }));
    return withMeta(`swimlane_${idx + 1}`, "Sequence", "swimlane", "泳道图需要覆盖角色数和每道步骤数同时变化。", {
      lanes,
      highlight: lanes[Math.floor(laneCount / 2)].steps[stepCount - 1].id,
    }, aspectRatio);
  });

  add("closed_loop", (idx, aspectRatio) => withMeta(`closed_loop_${idx + 1}`, "Loop", "closed_loop", "闭环图需要覆盖 4 到 7 个环节。", {
    center: "Agent Loop",
    steps: makeSteps("cl", 4 + (idx % 4), "环节", "反馈"),
    highlight: `cl${4 + (idx % 4)}`,
  }, aspectRatio));

  add("dual_loop", (idx, aspectRatio) => {
    const loopCount = 2 + (idx % 3);
    const loops = Array.from({ length: loopCount }, (_, loopIdx) => ({
      id: `loop${loopIdx + 1}`,
      label: `循环${loopIdx + 1}`,
      steps: makeSteps(`dl${loopIdx + 1}_`, 2 + ((idx + loopIdx) % 3), "步骤", "").map((step) => ({ id: step.id, label: step.label })),
    }));
    return withMeta(`dual_loop_${idx + 1}`, "Loop", "dual_loop", "双环图现在要支持 2 到 4 个环。", {
      loops,
      highlight: loops[loops.length - 1].id,
    }, aspectRatio);
  });

  add("spiral_iteration_ladder", (idx, aspectRatio) => withMeta(`spiral_iteration_ladder_${idx + 1}`, "Loop", "spiral_iteration_ladder", "螺旋梯需要覆盖更长的演进路径。", {
    center: "能力爬升",
    steps: makeSteps("sp", 4 + (idx % 5), "阶段", "增益"),
    highlight: `sp${4 + (idx % 5)}`,
  }, aspectRatio));

  add("tree", (idx, aspectRatio) => withMeta(`tree_${idx + 1}`, "Hierarchy", "tree", "树图需要在节点变多时保持分层清晰。", makeTree(5 + idx), aspectRatio));

  add("layered_architecture", (idx, aspectRatio) => withMeta(`layered_architecture_${idx + 1}`, "Hierarchy", "layered_architecture", "分层架构图需要覆盖层数、层内元素数和侧向能力数量变化。", makeLayeredArchitecture(3 + (idx % 3), [2 + (idx % 3), 3 + (idx % 2), 2 + ((idx + 1) % 3), 2], 1 + (idx % 5)), aspectRatio));

  add("capability_stack", (idx, aspectRatio) => withMeta(`capability_stack_${idx + 1}`, "Hierarchy", "capability_stack", "金字塔需要覆盖 3 到 6 层的成熟度表达。", {
    levels: Array.from({ length: 3 + (idx % 4) }, (_, i) => ({ label: `能力层${i + 1}`, note: `说明${i + 1}` })),
    highlight: `能力层${2 + (idx % 3)}`,
  }, aspectRatio));

  add("quadrant_matrix", (idx, aspectRatio) => {
    const items = makeQuadrantItems(3 + idx);
    return withMeta(`quadrant_matrix_${idx + 1}`, "Matrix", "quadrant_matrix", "四象限图需要覆盖更密的点位分布。", {
      x_axis: { left: "低", right: "高", label: "价值" },
      y_axis: { bottom: "低", top: "高", label: "可行性" },
      items,
      highlight: items[items.length - 1].label,
    }, aspectRatio);
  });

  add("capability_matrix", (idx, aspectRatio) => {
    const rowCount = 2 + (idx % 4);
    const colCount = 2 + ((idx + 1) % 4);
    const rows = Array.from({ length: rowCount }, (_, i) => `对象${i + 1}`);
    const columns = Array.from({ length: colCount }, (_, i) => `阶段${i + 1}`);
    const values = rows.map((_, r) => columns.map((_, c) => `值${r + 1}-${c + 1}`));
    return withMeta(`capability_matrix_${idx + 1}`, "Matrix", "capability_matrix", "能力矩阵需要覆盖不同表格长宽。", {
      rows,
      columns,
      values,
      highlight: { row: rows[rows.length - 1], column: columns[columns.length - 1] },
    }, aspectRatio);
  });

  add("hub_spoke_network", (idx, aspectRatio) => {
    const nodes = makeNetworkNodes(3 + idx);
    const hub = { id: "hub", label: "中枢" };
    const edges = nodes.map((node) => [hub.id, node.id]).concat(nodes.length > 2 ? [[nodes[0].id, nodes[nodes.length - 1].id]] : []);
    return withMeta(`hub_spoke_network_${idx + 1}`, "Network", "hub_spoke_network", "中心辐射网络需要覆盖外围节点不断增多。", {
      hub,
      nodes,
      edges,
      highlight: nodes[nodes.length - 1].id,
    }, aspectRatio);
  });

  add("dependency_graph", (idx, aspectRatio) => {
    const nodes = makeNetworkNodes(4 + idx, "模块");
    const edges = nodes.slice(0, -1).map((node, i) => [node.id, nodes[i + 1].id]).concat(nodes.length > 4 ? [[nodes[0].id, nodes[nodes.length - 1].id]] : []);
    return withMeta(`dependency_graph_${idx + 1}`, "Network", "dependency_graph", "依赖图需要覆盖链式和跨层依赖。", {
      nodes,
      edges,
      highlight: nodes[Math.floor(nodes.length / 2)].id,
    }, aspectRatio);
  });

  add("module_interaction_map", (idx, aspectRatio) => {
    const nodes = makeNetworkNodes(4 + idx, "服务");
    const edges = nodes.map((node, i) => [node.id, nodes[(i + 1) % nodes.length].id]);
    return withMeta(`module_interaction_map_${idx + 1}`, "Network", "module_interaction_map", "模块交互图需要覆盖回路和闭合调用。", {
      nodes,
      edges,
      highlight: nodes[0].id,
    }, aspectRatio);
  });

  add("causal_influence_graph", (idx, aspectRatio) => {
    const nodes = makeNetworkNodes(4 + idx, "因子");
    const edges = nodes.slice(0, -1).map((node, i) => [node.id, nodes[i + 1].id]);
    return withMeta(`causal_influence_graph_${idx + 1}`, "Network", "causal_influence_graph", "因果图需要覆盖更多影响因子。", {
      nodes,
      edges,
      highlight: nodes[nodes.length - 1].id,
    }, aspectRatio);
  });

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
