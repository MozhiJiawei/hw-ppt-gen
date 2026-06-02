"use strict";

const {
  ANCHOR_ELIGIBILITY,
  MEASURE_SUPPORT,
  RESIZE_POLICY,
  getVisualTemplateContract,
  officialVisualTemplateRows,
  visualTemplateKey,
} = require("../contracts/visual_templates");

const MATURITY = Object.freeze({
  OFFICIAL: "official",
  EXPERIMENTAL: "experimental",
  INTERNAL: "internal",
});

const FAMILY = Object.freeze({
  LAYOUT: "layout",
  VISUAL_ANCHOR: "visual_anchor",
  SUPPORTING_COMPONENT: "supporting_component",
  TEXT: "text",
  ESCAPE_HATCH: "drawing",
  INTERNAL: "internal",
});

const FORBIDDEN_PROPS = Object.freeze(new Set([
  "style",
  "x",
  "y",
  "w",
  "h",
  "width",
  "height",
  "left",
  "top",
  "right",
  "bottom",
  "margin",
  "padding",
  "zIndex",
  "z-index",
  "coordinates",
]));

const COMMON_LAYOUT_INTENT = Object.freeze({
  align: Object.freeze(["left", "center", "right"]),
  valign: Object.freeze(["top", "mid", "bottom"]),
  density: Object.freeze(["compact", "normal", "spacious"]),
  priority: Object.freeze(["primary", "secondary", "supporting"]),
});

const COMPONENTS = Object.freeze([
  layoutComponent("Columns", {
    aiVisible: false,
    description: "Body root that chooses the current Huawei body layout family.",
    requiredProps: ["type"],
    propEnums: { type: ["two_column", "biased_column", "three_column", "four_column"] },
    childTags: ["Module"],
    examples: [{
      tag: "Columns",
      props: { type: "two_column" },
      children: [
        { tag: "Module", props: { title: "证据模块" }, children: [] },
        { tag: "Module", props: { title: "结论模块" }, children: [] },
      ],
    }],
    useWhen: "Use a layout tag such as <TwoColumn>, <ThreeColumn>, or <FourColumn> to choose the slide body structure.",
    avoidWhen: "Do not expose internal layout nodes in authored markup; write the web-like layout tag instead.",
    budgetHints: ["Use 2 modules for two_column, 3 for three_column, 4 for four_column."],
    repairHints: ["Match the child Module count to the selected layout type."],
  }),
  layoutComponent("Module", {
    description: "A titled body panel inside a body layout tag.",
    requiredProps: ["title"],
    examples: [{ tag: "Module", props: { title: "证据模块" }, children: [] }],
    budgetHints: ["Keep one primary proof component per module, then add short text or one supporting readout."],
    repairHints: ["Add a real visual component before supporting-only readouts."],
  }),
  visualComponent("EvidenceFigure", "Evidence", "source_figure", {
    description: "Source-backed figure evidence with preserved aspect ratio.",
    requiredProps: ["id", "title", "claim", "source"],
    propEnums: { fit: ["contain"] },
    examples: [{
      tag: "EvidenceFigure",
      props: {
        id: "fig_1",
        title: "来源图",
        claim: "来源图支撑当前模块判断。",
        source: { path: ".tmp/deck/figure_1.png", caption: "Figure 1" },
        fit: "contain",
      },
    }],
    useWhen: "Use when a source image, figure crop, UI capture, or paper visual is the module proof.",
    avoidWhen: "Do not use for generated diagrams or decorative images.",
    budgetHints: ["Evidence preserves aspect ratio; reduce nearby prose when the source is tall or dense."],
  }),
  visualComponent("EvidenceChart", "Evidence", "source_chart", {
    description: "Source-backed chart evidence with preserved aspect ratio.",
    requiredProps: ["id", "title", "claim", "source"],
    propEnums: { fit: ["contain"] },
  }),
  supportingComponent("KpiCards", "Quantity", "data_cards", {
    description: "Compact KPI card row used as a secondary readout next to evidence.",
    requiredProps: ["id", "title", "claim", "cards"],
    propLimits: { maxCards: 4 },
    examples: [{
      tag: "KpiCards",
      props: {
        id: "kpi_1",
        title: "关键读数",
        claim: "读数压缩证据中的结论。",
        cards: [{ label: "收益", value: "4.7x" }, { label: "成本", value: "-32%" }],
        maxCards: 3,
      },
    }],
    useWhen: "Use for a few numeric readouts after the module already has real evidence or drawing proof.",
    avoidWhen: "Do not use as the only proof on a content slide.",
  }),
  supportingComponent("Table", "Matrix", "table", {
    description: "Generated native table for real row/column comparisons.",
    requiredProps: ["id", "title", "claim", "rows"],
    propLimits: { maxItems: 8 },
    useWhen: "Use when the row and column intersection carries meaning.",
    avoidWhen: "Avoid disguised label-value prose lists.",
  }),
  supportingComponent("CapabilityStack", "Hierarchy", "capability_stack", {
    description: "Layered capability stack as a supporting structured readout.",
    requiredProps: ["id", "title", "claim", "levels"],
  }),
  textComponent("InsightText", {
    description: "Editable PPT text for compact judgments, caveats, and conclusions.",
    requiredProps: ["body"],
    propLimits: { maxLines: 6 },
    examples: [{
      tag: "InsightText",
      props: { body: ["判断：核心收益来自并行验证。"], emphasis: ["并行验证"], maxLines: 3 },
    }],
    budgetHints: ["Use 2-5 short claim lines; move dense comparisons into Table or KpiCards."],
  }),
  escapeComponent("Visual", {
    description: "Generated drawing entry for registered kind/template draw functions.",
    requiredProps: ["id", "title", "claim", "draw", "model"],
    examples: [{
      tag: "Visual",
      props: {
        id: "official_process",
        title: "流程",
        claim: "流程来自官方 draw function。",
        draw: "Sequence/process",
        model: { steps: [{ id: "a", label: "输入" }, { id: "b", label: "输出" }] },
      },
    }],
    budgetHints: ["Use only official draw ids from visual template contracts."],
    repairHints: ["If draw is rejected, choose one of the official kind/template pairs from the component detail."],
  }),
  internalComponent("RawVisualSpec", {
    description: "Internal visual-spec carrier used by DSL runtime tests and future migrations.",
  }),
]);

const REGISTRY_BY_TAG = Object.freeze(Object.fromEntries(COMPONENTS.map((item) => [item.tag, Object.freeze(item)])));

function listComponentRegistry(options = {}) {
  const includeInternal = Boolean(options.includeInternal);
  return COMPONENTS
    .filter((entry) => includeInternal || entry.aiVisible)
    .map((entry) => ({ ...entry }));
}

function getComponentContract(tag) {
  return REGISTRY_BY_TAG[String(tag || "").trim()] || null;
}

function listAiComponents() {
  return listComponentRegistry({ includeInternal: false });
}

function officialDrawIds() {
  return officialDrawRows().map((row) => `${row.kind}/${row.template}`).sort();
}

function officialDrawRows() {
  return officialVisualTemplateRows().filter((row) => row.kind !== "Evidence");
}

function parseDrawId(draw) {
  const value = String(draw || "").trim();
  const parts = value.includes("/") ? value.split("/") : value.split(".");
  if (parts.length !== 2) return null;
  const kind = normalizeDrawPart(parts[0]);
  const template = normalizeDrawPart(parts[1]);
  const contract = getVisualTemplateContract(kind, template);
  return contract ? { kind, template, contract } : null;
}

function validateRegisteredProps(tag, props = {}) {
  const contract = getComponentContract(tag);
  if (!contract) {
    return [`Unknown Body DSL component tag: ${tag || "(missing)"}.`];
  }
  const errors = [];
  const propNames = Object.keys(props || {});
  for (const propName of propNames) {
    if (FORBIDDEN_PROPS.has(propName)) {
      errors.push(`${tag}.${propName} is not allowed in Body DSL; use registered layout intent instead of manual styling or coordinates.`);
    }
  }
  for (const required of contract.requiredProps || []) {
    if (props[required] === undefined || props[required] === null || props[required] === "") {
      errors.push(`${tag} requires props.${required}.`);
    }
  }
  for (const [propName, allowed] of Object.entries(contract.layoutIntent || {})) {
    const value = props[propName];
    if (Array.isArray(allowed) && value !== undefined && value !== null && !allowed.includes(value)) {
      errors.push(`${tag}.${propName}=${value} is not supported; allowed: ${allowed.join(", ")}.`);
    } else if (allowed === "number" && value !== undefined && value !== null && !Number.isFinite(Number(value))) {
      errors.push(`${tag}.${propName} must be numeric.`);
    }
  }
  for (const [propName, allowed] of Object.entries(contract.propEnums || {})) {
    const value = props[propName];
    if (value !== undefined && value !== null && !allowed.includes(value)) {
      errors.push(`${tag}.${propName}=${value} is not supported; allowed: ${allowed.join(", ")}.`);
    }
  }
  for (const [propName, max] of Object.entries(contract.propLimits || {})) {
    const value = Number(props[propName]);
    if (props[propName] !== undefined && (!Number.isFinite(value) || value > max || value < 1)) {
      errors.push(`${tag}.${propName} must be a positive number no greater than ${max}.`);
    }
  }
  if (props.fit === "stretch" && contract.role === FAMILY.VISUAL_ANCHOR && contract.visual?.kind === "Evidence") {
    errors.push(`${tag}.fit=stretch is rejected because source evidence must preserve aspect ratio.`);
  }
  if (tag === "Visual" && props.draw && !parseDrawId(props.draw)) {
    errors.push(`Visual.draw=${props.draw} is not an official draw id. Use one of: ${officialDrawIds().slice(0, 8).join(", ")}...`);
  } else if (tag === "Visual" && props.draw) {
    const parsed = parseDrawId(props.draw);
    if (parsed?.kind === "Evidence") {
      errors.push("Visual.draw cannot target Evidence templates; use <EvidenceFigure> or <EvidenceChart> so source evidence stays traceable.");
    }
  }
  return errors;
}

function layoutComponent(tag, options) {
  return baseComponent(tag, FAMILY.LAYOUT, options);
}

function visualComponent(tag, kind, template, options = {}) {
  const visual = getVisualTemplateContract(kind, template);
  return baseComponent(tag, FAMILY.VISUAL_ANCHOR, {
    ...defaultVisualText(kind, template),
    ...options,
    visual: {
      kind,
      template,
      anchorEligibility: ANCHOR_ELIGIBILITY.REAL_ANCHOR,
      renderer: visual?.renderer,
      measureSupport: visual?.measureSupport || MEASURE_SUPPORT.MEASURED,
      resizePolicy: visual?.resizePolicy || RESIZE_POLICY.FLEXIBLE,
    },
    layoutIntent: {
      ...COMMON_LAYOUT_INTENT,
      fit: options.propEnums?.fit || ["contain", "fill"],
    },
  });
}

function supportingComponent(tag, kind, template, options = {}) {
  const visual = getVisualTemplateContract(kind, template);
  return baseComponent(tag, FAMILY.SUPPORTING_COMPONENT, {
    ...defaultVisualText(kind, template),
    ...options,
    visual: {
      kind,
      template,
      anchorEligibility: ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT,
      renderer: visual?.renderer,
      measureSupport: visual?.measureSupport || MEASURE_SUPPORT.MEASURED,
      resizePolicy: visual?.resizePolicy || RESIZE_POLICY.FLEXIBLE,
    },
    layoutIntent: {
      ...COMMON_LAYOUT_INTENT,
      fit: ["contain", "fill"],
    },
  });
}

function textComponent(tag, options = {}) {
  return baseComponent(tag, FAMILY.TEXT, {
    useWhen: "Use for concise editable body text near evidence or generated drawing.",
    avoidWhen: "Avoid using text as a standalone column without visual proof.",
    repairHints: ["Shorten prose or move structured comparisons into a supporting component."],
    ...options,
    layoutIntent: {
      ...COMMON_LAYOUT_INTENT,
      maxLines: "number",
    },
  });
}

function escapeComponent(tag, options = {}) {
  return baseComponent(tag, FAMILY.ESCAPE_HATCH, {
    useWhen: "Use for generated drawing through an official draw id.",
    avoidWhen: "Do not use for arbitrary code or unregistered draw functions.",
    repairHints: ["Pick an official draw id and provide model data matching the generated visual schema."],
    ...options,
  });
}

function internalComponent(tag, options = {}) {
  return baseComponent(tag, FAMILY.INTERNAL, {
    aiVisible: false,
    maturity: MATURITY.INTERNAL,
    requiredProps: [],
    examples: [],
    useWhen: "Internal implementation detail.",
    avoidWhen: "Do not use directly in Body DSL.",
    budgetHints: [],
    alternatives: [],
    repairHints: [],
    ...options,
  });
}

function internalVisualTemplateComponent(row) {
  return internalComponent(`OfficialVisual.${row.kind}.${row.template}`, {
    description: `Internal registry row for ${row.kind}/${row.template}.`,
    visual: {
      kind: row.kind,
      template: row.template,
      anchorEligibility: row.anchorEligibility,
      renderer: row.renderer,
      measureSupport: row.measureSupport,
      resizePolicy: row.resizePolicy,
    },
  });
}

function defaultVisualSpecFor(row) {
  const commonSteps = [{ id: "a", label: "输入" }, { id: "b", label: "验证" }, { id: "c", label: "输出" }];
  const commonNodes = [{ id: "a", label: "节点A" }, { id: "b", label: "节点B" }, { id: "c", label: "节点C" }];
  if (row.kind === "Quantity" && ["bar_chart", "line_chart"].includes(row.template)) {
    return { y_label: "指标", categories: ["Q1", "Q2", "Q3"], series: [{ name: "A", values: [30, 48, 62] }], highlight: "Q3" };
  }
  if (row.kind === "Quantity" && row.template === "proportion_chart") {
    return { segments: [{ label: "A", value: 60 }, { label: "B", value: 40 }], total_label: "100%" };
  }
  if (row.template === "heatmap" || row.template === "capability_matrix") {
    return { rows: ["能力", "风险"], columns: ["A", "B"], values: [[0.9, 0.6], [0.2, 0.5]], highlight: "A" };
  }
  if (row.template === "swimlane") {
    return { lanes: [{ id: "l1", label: "角色A", steps: [{ id: "a", label: "输入" }, { id: "b", label: "验证" }] }], highlight: "b" };
  }
  if (row.kind === "Sequence") return { steps: commonSteps, highlight: "b" };
  if (row.template === "dual_loop") {
    return {
      loops: [
        { id: "outer", label: "外环", steps: [{ id: "o1", label: "输入" }, { id: "o2", label: "验证" }] },
        { id: "inner", label: "内环", steps: [{ id: "i1", label: "生成" }, { id: "i2", label: "修正" }] },
      ],
      highlight: "inner",
      bridge_label: "反馈",
    };
  }
  if (row.kind === "Loop") return { center: "闭环", steps: commonSteps, highlight: "b" };
  if (row.template === "tree") {
    return { nodes: ["root", "a", "b"], edges: [["root", "a"], ["root", "b"]], labels: { root: "根", a: "能力A", b: "能力B" }, highlight: "a" };
  }
  if (row.template === "layered_architecture") {
    return {
      layers: [
        { label: "接入层", items: ["input"] },
        { label: "处理层", items: ["engine"] },
        { label: "验证层", items: ["review"] },
      ],
      side_label: "治理",
      side_modules: ["policy"],
      edges: [["input", "engine"], ["engine", "review"], ["policy", "engine"]],
    };
  }
  if (row.kind === "Hierarchy") {
    return { levels: [{ label: "基础", value: "输入" }, { label: "增强", value: "处理" }, { label: "输出", value: "验证" }], highlight: "增强" };
  }
  if (row.template === "quadrant_matrix") {
    return {
      x_axis: { left: "低", right: "高", label: "收益" },
      y_axis: { bottom: "低", top: "高", label: "风险" },
      items: [{ label: "A", x: 0.7, y: 0.3 }, { label: "B", x: 0.35, y: 0.65 }],
      highlight: "A",
    };
  }
  if (row.kind === "Matrix") {
    return { rows: [["维度", "判断"], ["A", "成立"], ["B", "待验证"]] };
  }
  if (row.template === "hub_spoke_network") {
    return {
      hub: { id: "hub", label: "中心" },
      nodes: [{ id: "a", label: "节点A" }, { id: "b", label: "节点B" }],
      edges: [["hub", "a"], ["hub", "b"]],
      highlight: "a",
    };
  }
  if (row.kind === "Network") {
    return { nodes: commonNodes, edges: [["a", "b"], ["b", "c"]], highlight: "b" };
  }
  return {};
}

function baseComponent(tag, role, options = {}) {
  const requiredDocs = {
    useWhen: options.useWhen || `Use ${tag} when the slide needs this ${role} component.`,
    avoidWhen: options.avoidWhen || `Avoid ${tag} when another registered component expresses the intent more directly.`,
    budgetHints: options.budgetHints || ["Keep the component within the body slot budget and reduce nearby prose if measurement feedback reports crowding."],
    alternatives: options.alternatives || [],
    repairHints: options.repairHints || ["Follow compile feedback and choose a smaller or more specific component when layout is crowded."],
  };
  return {
    tag,
    role,
    aiVisible: options.aiVisible ?? true,
    maturity: options.maturity || MATURITY.OFFICIAL,
    description: options.description || "",
    requiredProps: options.requiredProps || [],
    propEnums: options.propEnums || {},
    propLimits: options.propLimits || {},
    childTags: options.childTags || [],
    layoutIntent: options.layoutIntent || COMMON_LAYOUT_INTENT,
    visual: options.visual || null,
    measureSupport: options.visual?.measureSupport || options.measureSupport || MEASURE_SUPPORT.MEASURED,
    resizePolicy: options.visual?.resizePolicy || options.resizePolicy || RESIZE_POLICY.FLEXIBLE,
    docs: requiredDocs,
    examples: options.examples || [defaultExampleFor(tag, options)],
  };
}

function defaultExampleFor(tag, options = {}) {
  const props = {};
  for (const prop of options.requiredProps || []) {
    props[prop] = defaultPropValue(prop, tag);
  }
  if (options.visual?.kind === "Evidence") props.fit = "contain";
  return { tag, props };
}

function defaultPropValue(prop, tag) {
  const values = {
    id: `${tag.toLowerCase()}_1`,
    title: `${tag} 标题`,
    claim: `${tag} 支撑当前模块判断。`,
    source: { path: ".tmp/deck/source.png", caption: "Source evidence" },
    steps: [{ id: "a", label: "输入" }, { id: "b", label: "输出" }],
    nodes: [{ id: "a", label: "节点A" }, { id: "b", label: "节点B" }],
    edges: [["a", "b"]],
    cards: [{ label: "指标", value: "42%" }],
    rows: [["维度", "判断"], ["样例", "成立"]],
    levels: [{ label: "基础", value: "输入" }, { label: "增强", value: "输出" }],
    body: ["判断：填写该组件支撑的结论。"],
    draw: "Sequence/process",
    model: { steps: [{ id: "a", label: "输入" }, { id: "b", label: "输出" }] },
    type: "two_column",
  };
  return values[prop] ?? `${tag}_${prop}`;
}

function defaultVisualText(kind, template) {
  return {
    useWhen: `Use for ${kind}/${template} visual content.`,
    avoidWhen: "Avoid when the claim can be expressed as compact editable text.",
    repairHints: [`Provide model fields required by ${kind}/${template}; keep prose outside visual_spec.`],
  };
}

function normalizeDrawPart(part) {
  const value = String(part || "").trim();
  const kindAliases = {
    evidence: "Evidence",
    quantity: "Quantity",
    sequence: "Sequence",
    loop: "Loop",
    hierarchy: "Hierarchy",
    matrix: "Matrix",
    network: "Network",
  };
  return kindAliases[value.toLowerCase()] || value;
}

module.exports = {
  FAMILY,
  FORBIDDEN_PROPS,
  MATURITY,
  defaultVisualSpecFor,
  getComponentContract,
  listAiComponents,
  listComponentRegistry,
  officialDrawIds,
  officialDrawRows,
  parseDrawId,
  validateRegisteredProps,
  visualTemplateKey,
};
