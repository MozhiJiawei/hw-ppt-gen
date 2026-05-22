const fs = require("fs");
const path = require("path");
const {
  addCoverSlide,
  addTocSlide,
  createHuaweiDeck,
  ensureTmpPath,
  repairPptxForPowerPointCom,
} = require("../pptx/hw_pptx_helpers");
const {
  addVisualAnchorContentSlide,
  writeVisualAnchorManifest,
} = require("../pptx/hw_visual_anchor_slide");

async function main() {
  const output = ensureTmpPath(process.argv[2] || path.join(".tmp", "sample_huawei_deck.pptx"));
  const manifestPath = ensureTmpPath(output.replace(/\.pptx$/i, "_visual_anchor_manifest.json"));
  const planPath = ensureTmpPath(output.replace(/\.pptx$/i, "_plan.json"));
  const pptx = createHuaweiDeck({ title: "Huawei-style visual anchor sample" });
  const sections = ["生成工作流", "视觉锚点", "质量检查"];
  const source = "来源：Huawei PPTX Generator 示例";
  const planSlides = [];

  function addPlannedVisualAnchorContentSlide(data) {
    planSlides.push({
      page: Number(data.page),
      title: data.title,
      visual_anchor: {
        id: data.visual_anchor.id,
        kind: data.visual_anchor.kind,
        template: data.visual_anchor.template,
      },
      content_layout: data.contentLayout ? {
        type: data.contentLayout.type,
        reference: data.contentLayout.reference,
      } : undefined,
    });
    addVisualAnchorContentSlide(pptx, data);
  }

  addCoverSlide(pptx, {
    title: "华为风格视觉锚点生成样例",
    subtitle: "以 Evidence 与六类关系图作为正文页主路径",
    department: "Agent Skills / PPT 能力建设",
    date: "2026.05",
  });

  addTocSlide(pptx, {
    title: "目录 CONTENTS",
    items: [
      { title: "生成工作流", note: "从页面计划到统一正文页入口" },
      { title: "视觉锚点", note: "数量、序列、层级、矩阵等关系图" },
      { title: "质量检查", note: "manifest、渲染证据和硬规则检查" },
    ],
    source,
    page: "02",
  });

  addPlannedVisualAnchorContentSlide({
    title: "生成路径",
    titleNote: "正文页从计划进入视觉锚点渲染",
    sections,
    currentSection: "生成工作流",
    summary: {
      body: [
        { label: "规划先行", text: "每个正文页先定义一个视觉锚点，再安排解释卡和证据说明。" },
        { label: "入口统一", text: "页面骨架、分析总结、主视觉和页脚由同一个正文页入口组合。" },
      ],
    },
    visual_anchor: {
      id: "sample_generation_flow",
      title: "Generation Flow",
      claim: "正文页生成必须经过视觉锚点。",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          { id: "source", label: "读取材料" },
          { id: "plan", label: "页面计划" },
          { id: "render", label: "渲染锚点" },
          { id: "qa", label: "质量检查" },
        ],
        highlight: "render",
      },
      highlight_reason: "高亮渲染锚点，因为它是从计划到可见页面的关键转换点。",
    },
    supportingCards: [
      { title: "执行约束", body: ["正文页必须有一个主视觉对象", "解释文字服务主视觉，不替代主视觉", "高亮渲染锚点，因为它是从计划到可见页面的关键转换点"] },
    ],
    source,
    page: "03",
  });

  addPlannedVisualAnchorContentSlide({
    title: "数量锚点",
    titleNote: "关键指标先形成趋势图，数据卡只做读数支撑",
    sections,
    currentSection: "视觉锚点",
    summary: {
      body: [
        { label: "数字聚焦", text: "柱状图承载数量对比，数据卡只作为支撑读数。" },
        { label: "红色克制", text: "红色只标注主要指标，其他数据保持灰阶呈现。" },
      ],
    },
    visual_anchor: {
      id: "sample_quantity_cards",
      title: "Quantity Bar Chart",
      claim: "柱状图承载数量关系。",
      kind: "Quantity",
      template: "bar_chart",
      visual_spec: {
        y_label: "数量",
        categories: ["参考图", "锚点类别", "QA 入口"],
        series: [
          { name: "对象数", values: [10, 7, 1] },
        ],
        highlight: { category: "锚点类别", series: "对象数" },
      },
      highlight_reason: "高亮锚点类别，因为它说明生成器可选择的关系范围。",
    },
    supportingCards: [
      { title: "支撑读数", body: ["参考图：10 张用于校准版式", "锚点类别：7 类用于覆盖证据/图解", "QA 入口：1 套负责计划和 manifest 对齐"] },
      { title: "语义边界", body: ["柱状图是本页真实视觉锚点", "数据卡只承担读数压缩，不替代锚点"] },
    ],
    source,
    page: "04",
  });

  addPlannedVisualAnchorContentSlide({
    title: "层级锚点",
    titleNote: "层级架构表达从页面骨架到主视觉的责任分层",
    sections,
    currentSection: "视觉锚点",
    summary: {
      body: [
        { label: "职责分离", text: "页面骨架只处理标题、总结和页脚，主视觉交给视觉锚点。" },
        { label: "结构清晰", text: "层级架构帮助读者理解各层职责，视觉锚点承接骨架并支撑解释模块。" },
      ],
    },
    visual_anchor: {
      id: "sample_layered_architecture",
      title: "Layered Architecture",
      claim: "页面能力以层级方式组合。",
      kind: "Hierarchy",
      template: "layered_architecture",
      visual_spec: {
        layers: [
          { label: "页面层", items: ["页面骨架"] },
          { label: "证据层", items: ["视觉锚点"] },
          { label: "解释层", items: ["支撑组件"] },
        ],
        side_label: "QA",
        side_modules: ["manifest"],
        edges: [
          ["页面骨架", "视觉锚点"],
          ["视觉锚点", "支撑组件"],
          ["视觉锚点", "manifest"],
        ],
      },
      highlight_reason: "高亮视觉锚点，因为它承接页面骨架并支撑解释模块。",
    },
    visualAnchorCaption: {
      text: "能力栈：页面骨架、视觉锚点和解释模块形成自下而上的支撑关系",
      source: "示例说明：视觉锚点不是装饰，而是正文页信息组织的主对象",
    },
    source,
    page: "05",
  });

  addPlannedVisualAnchorContentSlide({
    title: "检查闭环",
    titleNote: "manifest 让 QA 能确认每页主视觉已渲染",
    sections,
    currentSection: "质量检查",
    summary: {
      body: [
        { label: "记录落地", text: "生成脚本为每个正文页记录锚点 id、类别、模板和渲染状态。" },
        { label: "检查闭环", text: "硬规则检查读取 manifest，检查步骤是关键，因为缺失或未渲染都作为阻塞项。" },
      ],
    },
    visual_anchor: {
      id: "sample_qa_loop",
      title: "QA Loop",
      claim: "生成和检查形成闭环。",
      kind: "Loop",
      template: "closed_loop",
      visual_spec: {
        center: "视觉锚点 QA",
        steps: [
          { id: "render", label: "渲染" },
          { id: "manifest", label: "记录" },
          { id: "check", label: "检查" },
          { id: "fix", label: "修正" },
        ],
        highlight: "check",
      },
      highlight_reason: "高亮检查步骤，因为它把 manifest 记录转化为阻塞式质量门禁。",
    },
    source,
    page: "06",
  });

  writeVisualAnchorManifest(pptx, manifestPath);
  fs.writeFileSync(planPath, JSON.stringify({ slides: planSlides }, null, 2), "utf8");
  await pptx.writeFile({ fileName: output });
  await repairPptxForPowerPointCom(output);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`Wrote ${planPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
