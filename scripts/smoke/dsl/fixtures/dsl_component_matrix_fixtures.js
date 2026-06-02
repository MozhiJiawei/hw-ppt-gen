"use strict";

const path = require("path");
const { parseSlideBodyDsl } = require("../../../pptx/dsl/jsx_dsl");
const { getComponentContract, listAiComponents } = require("../../../pptx/dsl/component_registry");

function buildDslComponentMatrixFixtures(root) {
  const source = (name) => path.join(root, ".tmp", "dsl_component_matrix", "sources", `${name}.svg`);
  const fixtures = [
    fixture("Columns", "layout", twoColumnMarkup(`
      <Module title="布局模块一">
        <EvidenceFigure id="columns_anchor" title="来源图" claim="来源图支撑当前组件测试。" source={figureSource} fit="contain" />
      </Module>
      <Module title="布局模块二">
        <InsightText body={layoutText} emphasis={emphasis} maxLines={3} />
      </Module>
    `), { figureSource: evidenceSource(source("figure"), "来源图 fixture"), layoutText: ["布局：容器定义页面正文结构。"], emphasis: ["组件", "测量"] }),
    fixture("Module", "layout", twoColumnMarkup(`
      <Module title="模块组件">
        <EvidenceFigure id="module_anchor" title="来源图" claim="来源图支撑当前组件测试。" source={figureSource} fit="contain" />
      </Module>
      <Module title="说明模块">
        <InsightText body={moduleText} emphasis={emphasis} maxLines={3} />
      </Module>
    `), { figureSource: evidenceSource(source("figure"), "来源图 fixture"), moduleText: ["模块：承载标题、证据和结论。"], emphasis: ["组件", "测量"] }),
    renderable("EvidenceFigure", "matrix_evidence_figure", { visualRole: "visual_anchor", kind: "Evidence", template: "source_figure" }, `<EvidenceFigure id="matrix_evidence_figure" title="来源图" claim="来源图支撑当前组件测试。" source={figureSource} fit="contain" />`, { figureSource: evidenceSource(source("figure"), "来源图 fixture") }),
    renderable("EvidenceChart", "matrix_evidence_chart", { visualRole: "visual_anchor", kind: "Evidence", template: "source_chart" }, `<EvidenceChart id="matrix_evidence_chart" title="来源图表" claim="来源图表支撑当前组件测试。" source={chartSource} fit="contain" />`, { chartSource: evidenceSource(source("chart"), "来源图表 fixture") }),
    renderable("KpiCards", "matrix_kpi_cards", { visualRole: "supporting_component", kind: "Quantity", template: "data_cards" }, `<KpiCards id="matrix_kpi_cards" title="KPI 组件" claim="KPI 组件压缩关键读数。" cards={cards} maxCards={3} />`, { cards: [{ label: "发现", value: "auto" }, { label: "测量", value: "COM" }, { label: "反馈", value: "DOM" }] }, { includeCompanionEvidence: true, source: source("figure") }),
    renderable("Table", "matrix_table", { visualRole: "supporting_component", kind: "Matrix", template: "table" }, `<Table id="matrix_table" title="表格组件" claim="表格组件表达二维关系。" rows={rows} />`, { rows: [["对象", "能力", "结果"], ["DSL", "发现", "可用"], ["组件", "测量", "可见"]] }, { includeCompanionEvidence: true, source: source("figure") }),
    renderable("CapabilityStack", "matrix_capability_stack", { visualRole: "supporting_component", kind: "Hierarchy", template: "capability_stack" }, `<CapabilityStack id="matrix_capability_stack" title="能力栈组件" claim="能力栈组件表达层级能力。" levels={levels} highlight="测量" />`, { levels: [{ label: "生成", value: "DSL" }, { label: "测量", value: "COM" }, { label: "验证", value: "QA" }] }, { includeCompanionEvidence: true, source: source("figure") }),
    renderable("InsightText", "matrix_insight_text", { visualRole: "text" }, `<InsightText id="matrix_insight_text" body={body} emphasis={emphasis} maxLines={3} />`, { body: ["判断：文本组件必须保留 editable PPT 文本。"], emphasis: ["组件", "测量"] }, { includeCompanionEvidence: true, source: source("figure") }),
    renderable("Visual", "matrix_visual_escape", { visualRole: "visual_anchor", kind: "Sequence", template: "process" }, `<Visual id="matrix_visual_escape" title="官方 Visual" claim="Visual 组件调用官方 Sequence/process。" draw="Sequence/process" model={processModel} />`, { processModel: { steps: [{ id: "a", label: "选择" }, { id: "b", label: "生成" }, { id: "c", label: "检查" }], highlight: "b" } }),
  ];
  const existing = new Set(fixtures.map((fixture) => fixture.tag));
  for (const component of listAiComponents()) {
    if (existing.has(component.tag)) continue;
    fixtures.push(genericVisualFixture(component.tag, source("figure")));
  }
  return fixtures;
}

function fixture(tag, kind, markup, scope = {}, extra = {}) {
  return {
    tag,
    kind,
    markup,
    ...extra,
    bodyDsl: parseSlideBodyDsl(markup, scope).bodyDsl,
  };
}

function renderable(tag, componentId, expected, componentMarkup, scope = {}, options = {}) {
  const companion = options.includeCompanionEvidence
    ? `<EvidenceFigure id="${componentId}_evidence" title="伴随证据" claim="伴随证据让 supporting component 所在页面满足真实锚点规则。" source={companionSource} fit="contain" />`
    : "";
  const firstModuleChildren = options.includeCompanionEvidence
    ? `${companion}\n        ${componentMarkup}`
    : options.componentOnly
      ? componentMarkup
      : `${componentMarkup}\n        <InsightText body={fixtureText} emphasis={emphasis} maxLines={3} />`;
  return fixture(tag, "renderable", twoColumnMarkup(`
      <Module title="${tag} fixture">
        ${firstModuleChildren}
      </Module>
      <Module title="结论">
        <InsightText body={fixtureText} emphasis={emphasis} maxLines={3} />
      </Module>
    `), {
      ...scope,
      companionSource: options.source ? evidenceSource(options.source, "伴随证据 fixture") : undefined,
      fixtureText: [`${tag} 组件应通过 JSX-like DSL 编译、渲染、测量。`],
      emphasis: ["组件", "测量"],
    }, {
      expected: { componentId, ...expected },
    });
}

function genericVisualFixture(tag, evidencePath) {
  const contract = getComponentContract(tag);
  const componentId = `matrix_${tag.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()}`;
  const expected = {
    visualRole: contract.role,
    kind: contract.visual.kind,
    template: contract.visual.template,
  };
  const componentMarkup = `<${tag} id="${componentId}" title="${tag} 组件" claim="${tag} 组件调用官方 ${contract.visual.kind}/${contract.visual.template}。" visual_spec={visualSpec} />`;
  return renderable(tag, componentId, expected, componentMarkup, {
    visualSpec: contract.examples[0]?.props?.visual_spec || {},
  }, {
    componentOnly: true,
    includeCompanionEvidence: contract.role === "supporting_component",
    source: evidencePath,
  });
}

function twoColumnMarkup(children) {
  return `<Slide title="DSL 组件矩阵">
  <TwoColumn>
${children}
  </TwoColumn>
</Slide>`;
}

function evidenceSource(sourcePath, caption) {
  return { path: sourcePath, caption };
}

module.exports = {
  buildDslComponentMatrixFixtures,
};
