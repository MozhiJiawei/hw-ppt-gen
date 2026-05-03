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
  const pptx = createHuaweiDeck({ title: "Huawei-style visual anchor sample" });
  const sections = ["生成工作流", "视觉锚点", "质量检查"];
  const source = "来源：Huawei PPTX Generator 示例";

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

  addVisualAnchorContentSlide(pptx, {
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
    },
    supportingCards: [
      { title: "执行约束", body: ["正文页必须有一个主视觉对象", "解释文字服务主视觉，不替代主视觉"] },
    ],
    source,
    page: "03",
  });

  addVisualAnchorContentSlide(pptx, {
    title: "数量锚点",
    titleNote: "关键指标由数据卡承载",
    sections,
    currentSection: "视觉锚点",
    summary: {
      body: [
        { label: "数字聚焦", text: "数据卡用于对比关键指标，突出当前页最重要的一个数值。" },
        { label: "红色克制", text: "红色只标注主要指标，其他数据保持灰阶呈现。" },
      ],
    },
    visual_anchor: {
      id: "sample_quantity_cards",
      title: "Quantity Cards",
      claim: "数据卡承载数量关系。",
      kind: "Quantity",
      template: "data_cards",
      visual_spec: {
        cards: [
          { id: "refs", label: "参考图", value: "10", unit: "张" },
          { id: "kinds", label: "锚点类别", value: "7", unit: "类" },
          { id: "qa", label: "QA 入口", value: "1", unit: "套" },
        ],
        highlight: "kinds",
      },
    },
    source,
    page: "04",
  });

  addVisualAnchorContentSlide(pptx, {
    title: "层级锚点",
    titleNote: "能力栈表达从页面骨架到主视觉的责任分层",
    sections,
    currentSection: "视觉锚点",
    summary: {
      body: [
        { label: "职责分离", text: "页面骨架只处理标题、总结和页脚，主视觉交给锚点渲染器。" },
        { label: "结构清晰", text: "能力栈帮助读者理解各层职责，不把文本卡堆成主内容。" },
      ],
    },
    visual_anchor: {
      id: "sample_capability_stack",
      title: "Capability Stack",
      claim: "页面能力以层级方式组合。",
      kind: "Hierarchy",
      template: "capability_stack",
      visual_spec: {
        levels: [
          { label: "页面骨架" },
          { label: "视觉锚点" },
          { label: "解释模块" },
        ],
        highlight: "视觉锚点",
      },
    },
    source,
    page: "05",
  });

  addVisualAnchorContentSlide(pptx, {
    title: "检查闭环",
    titleNote: "manifest 让 QA 能确认每页主视觉已渲染",
    sections,
    currentSection: "质量检查",
    summary: {
      body: [
        { label: "记录落地", text: "生成脚本为每个正文页记录锚点 id、类别、模板和渲染状态。" },
        { label: "检查闭环", text: "硬规则检查读取 manifest，缺失或未渲染都作为阻塞项。" },
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
    },
    source,
    page: "06",
  });

  writeVisualAnchorManifest(pptx, manifestPath);
  await pptx.writeFile({ fileName: output });
  await repairPptxForPowerPointCom(output);
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
