const path = require("path");
const {
  addBarChartSlide,
  addColumnsSlide,
  addContentCardsSlide,
  addCoverSlide,
  addDataCardsSlide,
  addFlowSlide,
  addTableSlide,
  addTocSlide,
  createHuaweiDeck,
  ensureTmpPath,
} = require("./hw_pptx_helpers");

async function main() {
  const output = ensureTmpPath(process.argv[2] || path.join(".tmp", "sample_huawei_deck.pptx"));
  const pptx = createHuaweiDeck({ title: "Huawei-style PPTX generator sample" });

  addCoverSlide(pptx, {
    title: "华为风格 PPTX 生成能力样例",
    subtitle: "基于 pptxgenjs 的组件化生成与合规检查",
    department: "Agent Skills / PPT 能力建设",
    date: "2026.04",
  });

  addTocSlide(pptx, {
    title: "目录 CONTENTS",
    items: [
      { title: "生成工作流", note: "从任意输入材料到 slide-by-slide 规划" },
      { title: "华为版式组件", note: "红色标题卡、灰色内容卡、分栏、数据卡与表格" },
      { title: "质量检查闭环", note: "内容 QA、视觉 QA、硬规则检查" },
    ],
    page: "02",
  });

  addContentCardsSlide(pptx, {
    title: "生成前先规划页面",
    titleNote: "将内容结构和视觉落版分开处理",
    summary: {
      body: [
        { label: "规划先行", text: "先完成页面级观点规划，再进入生成脚本，能显著减少返工。" },
        { label: "信息收束", text: "每页只保留三条以内核心信息，详细证据放在下方内容区。" },
      ],
    },
    columns: 3,
    cards: [
      { title: "输入分析", subtitle: "识别材料类型", body: ["网页、论文解析、代码库分析、Markdown 或用户 prompt", "提取目标受众、汇报目的和关键证据"] },
      { title: "页面规划", subtitle: "先写 slide plan", body: ["标题表达观点", "每页核心观点三点以内", "按内容关系选择分栏、表格、流程或数据页"] },
      { title: "生成与修正", subtitle: "第一版默认检查", body: ["所有产物写入 .tmp", "运行硬规则检查", "结合参考图做视觉 QA 后再修正"] },
    ],
    page: "03",
  });

  addColumnsSlide(pptx, {
    title: "组件库固化视觉语言",
    titleNote: "避免每次从提示词重造样式",
    summary: {
      body: [
        { label: "组件固化", text: "视觉约束应沉淀到 helper 组件，减少单页手写样式漂移。" },
        { label: "关系驱动", text: "内容关系决定布局形态，分栏只服务于比较、并列和主次关系。" },
      ],
    },
    weights: [1, 1.45],
    columns: [
      { title: "风格约束", subtitle: "可机械判断的规则进入代码", body: ["16:9 宽屏", "微软雅黑 / Arial / Impact", "华为红 C00000", "线框 0.5pt", "字号不低于 6pt"] },
      { title: "布局组件", subtitle: "按内容数量选择页面形态", body: ["红色标题卡 + 灰色内容卡承载分析页", "二分栏、偏分栏、三分栏、四分栏承载并列关系", "表格、柱状图、流程图承载数据和机制"] },
    ],
    page: "04",
  });

  addDataCardsSlide(pptx, {
    title: "数据卡呈现关键指标",
    titleNote: "用克制红色标注重点",
    columns: 4,
    cards: [
      { value: "10", label: "参考图数量", note: "用于生成前视觉定向", highlight: true },
      { value: "0.5pt", label: "标准线框", note: "卡片、表格、箭头统一约束" },
      { value: "3", label: "单页核心观点", note: "标题和正文保持一致" },
      { value: ".tmp", label: "生成产物目录", note: "PPTX、报告、截图均写入此目录", highlight: true },
    ],
    summary: { body: { label: "质量来源", text: "生成质量来自页面规划、组件固化和 QA 闭环，而不是单纯依赖自然语言提示。" } },
    page: "05",
  });

  addTableSlide(pptx, {
    title: "硬规则检查覆盖稳定约束",
    titleNote: "字体、字号、颜色、动画和线框均可机械验证",
    summary: {
      body: [
        { label: "规则入脚本", text: "可机械判断的风格规则必须进入检查脚本，避免只靠人工目测。" },
        { label: "错误即阻塞", text: "错误作为阻塞项处理，警告需要修复或在 QA 记录中说明接受理由。" },
      ],
    },
    rows: [
      ["检查项", "规则", "级别", "处理方式"],
      ["字体", "微软雅黑 / Arial / Impact", "Warning", "修正生成脚本中的 fontFace"],
      ["字号", "最小 6pt，页面字号种类受控", "Error/Warning", "压缩内容或调整布局"],
      ["颜色", "红黑白灰为主，不使用 8 位 hex", "Error/Warning", "替换为内置色板"],
      ["动画", "禁止动画与复杂切换", "Error", "删除动画相关 XML 或重新生成"],
      ["线框", "普通边框和箭头使用 0.5pt", "Warning", "统一 helper 组件参数"],
    ],
    page: "06",
  });

  addBarChartSlide(pptx, {
    title: "柱状图保持克制表达",
    titleNote: "灰色主体承载趋势，红色只标注重点",
    summary: {
      body: [
        { label: "先判后证", text: "图表页先给出判断，再用下方图形说明差异和趋势。" },
        { label: "红色克制", text: "红色只标注重点类别，避免把整页变成装饰性强调。" },
      ],
    },
    series: [
      { label: "规划", value: 42 },
      { label: "组件", value: 68, highlight: true },
      { label: "检查", value: 55 },
      { label: "修正", value: 61 },
      { label: "交付", value: 73, highlight: true },
    ],
    insightTitle: "关键进展",
    insights: ["组件化减少重复样式实现", "硬规则检查降低字体、颜色和字号漂移", "视觉 QA 仍需结合参考图判断密度和对齐"],
    page: "07",
  });

  addFlowSlide(pptx, {
    title: "端到端流程先定视觉",
    titleNote: "看参考图、写脚本、验证后再修正",
    steps: [
      { title: "看材料", body: ["提炼受众、目的、证据"] },
      { title: "看参考图", body: ["确定密度、红灰比例和组件形态"] },
      { title: "做规划", body: ["slide-by-slide 写标题、布局、内容"] },
      { title: "生成", body: ["用 pptxgenjs helper 生成 .tmp PPTX"] },
      { title: "检查", body: ["内容 QA、视觉 QA、硬规则 QA"] },
    ],
    summary: { body: { label: "交付底线", text: "若不能渲染为图片，不得声称完成渲染级视觉 QA，需说明残余风险。" } },
    page: "08",
  });

  await pptx.writeFile({ fileName: output });
  console.log(`Wrote ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
