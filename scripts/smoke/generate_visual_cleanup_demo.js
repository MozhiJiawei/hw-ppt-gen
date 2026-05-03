const path = require("path");
const {
  addCoverSlide,
  addTocSlide,
  createHuaweiDeck,
  ensureTmpPath,
} = require("../pptx/hw_pptx_helpers");
const {
  addVisualAnchorContentSlide,
  writeVisualAnchorManifest,
} = require("../pptx/hw_visual_anchor_slide");

async function main() {
  const output = ensureTmpPath(process.argv[2] || path.join(".tmp", "visual_spec_cleanup_demo.pptx"));
  const manifestPath = ensureTmpPath(output.replace(/\.pptx$/i, "_visual_anchor_manifest.json"));
  const pptx = createHuaweiDeck({ title: "Visual spec cleanup demo" });
  const sections = ["问题复盘", "修复效果", "验证闭环"];
  const source = "来源：本次图形规格清理与渲染回归测试";

  addCoverSlide(pptx, {
    title: "视觉锚点清理效果验证",
    subtitle: "说明文字回到 PPT 文本层，图片只保留关系与数据",
    department: "视觉锚点生成能力 / 清理验证",
    date: "2026.05",
  });

  addTocSlide(pptx, {
    title: "目录 CONTENTS",
    items: [
      { title: "问题复盘", note: "说明字段和空说明框从图片层移除" },
      { title: "修复效果", note: "数量、比例、流程、网络图分别验证" },
      { title: "验证闭环", note: "规格校验拒绝说明字段，冒烟测试复查生成物" },
    ],
    source,
    page: "02",
  });

  addVisualAnchorContentSlide(pptx, {
    title: "数量对比",
    titleNote: "柱状图不再保留右侧空说明气泡",
    sections,
    currentSection: "修复效果",
    summary: {
      body: [
        { label: "图内只画数据", text: "柱、坐标、数值和图例保留在视觉锚点内。" },
        { label: "解释移出图片", text: "业务判断放在右侧 PPT 文本卡，可编辑且不污染图片。" },
      ],
    },
    visual_anchor: {
      id: "cleanup_bar_chart",
      title: "Bar Chart Clean",
      claim: "柱状图只表达数量对比。",
      kind: "Quantity",
      template: "bar_chart",
      visual_spec: {
        y_label: "得分",
        categories: ["Q1职责清晰", "Q2统一调度", "Q3生成导出", "Q4规则检查"],
        series: [
          { name: "系列1统一调度", values: [10, 13, 16, 19] },
          { name: "系列2生成导出", values: [14, 18, 22, 26] },
          { name: "系列3规则检查", values: [18, 20, 22, 24] },
        ],
        highlight: { category: "Q4规则检查", series: "系列3规则检查" },
      },
    },
    visualAnchorCaption: "图 1：柱状图只保留坐标、数值、图例和高亮，解释说明作为 PPT 文本单独编辑。",
    supportingCards: [
      { title: "移除项", body: ["删除右侧空气泡", "删除图内解释口号", "不留无内容容器"] },
      { title: "保留项", body: ["保留坐标轴和柱值", "保留图例和高亮", "解释在右侧卡片编辑"] },
    ],
    source,
    page: "03",
  });

  addVisualAnchorContentSlide(pptx, {
    title: "比例关系",
    titleNote: "甜甜圈图不再附带空白说明容器",
    sections,
    currentSection: "修复效果",
    summary: {
      body: [
        { label: "比例即主体", text: "图片层只呈现分段、数值、总标签和高亮。" },
        { label: "阅读说明外置", text: "份额含义、业务解读写在 PPT 卡片中。" },
      ],
    },
    visual_anchor: {
      id: "cleanup_proportion_chart",
      title: "Proportion Clean",
      claim: "比例图只表达份额结构。",
      kind: "Quantity",
      template: "proportion_chart",
      visual_spec: {
        total_label: "锚点占比",
        segments: [
          { label: "数量", value: 32 },
          { label: "流程", value: 28 },
          { label: "层级", value: 22 },
          { label: "网络", value: 18 },
        ],
        highlight: "流程",
      },
    },
    visualAnchorCaption: "图 2：比例图仅呈现份额结构和直接标签，不再附带空白说明容器。",
    supportingCards: [
      { title: "图片层", body: ["只呈现分段面积", "只保留直接标签", "不再画黄色说明气泡"] },
      { title: "PPT 层", body: ["业务解释写在卡片里", "强调原因可编辑", "图片复用不带场景文案"] },
    ],
    source,
    page: "04",
  });

  addVisualAnchorContentSlide(pptx, {
    title: "流程路径",
    titleNote: "流程节点不再接受备注类说明字段",
    sections,
    currentSection: "验证闭环",
    summary: {
      body: [
        { label: "规格关闭", text: "图形规格里的步骤备注会被校验器直接拒绝。" },
        { label: "节点纯净", text: "流程图只保留阶段标签、编号、箭头和高亮。" },
      ],
    },
    visual_anchor: {
      id: "cleanup_process",
      title: "Process Clean",
      claim: "流程图只表达步骤关系。",
      kind: "Sequence",
      template: "process",
      visual_spec: {
        steps: [
          { id: "schema", label: "关闭规格" },
          { id: "render", label: "移除渲染" },
          { id: "smoke", label: "批量复查" },
          { id: "deck", label: "生成样张" },
        ],
        highlight: "smoke",
      },
    },
    visualAnchorCaption: "图 3：流程图只表达阶段顺序，备注类说明由页面摘要和右侧卡片承载。",
    supportingCards: [
      { title: "禁止字段", body: ["说明、备注、摘要类字段禁入", "解释写进图形规格会被拒绝", "图形规格只描述结构"] },
      { title: "回归检查", body: ["单测覆盖嵌套说明字段", "冒烟测试扫描旧文案", "同时扫描空说明容器"] },
    ],
    source,
    page: "05",
  });

  addVisualAnchorContentSlide(pptx, {
    title: "网络关系",
    titleNote: "节点说明和默认中心字样不再由渲染器发明",
    sections,
    currentSection: "验证闭环",
    summary: {
      body: [
        { label: "输入即输出", text: "网络节点只显示传入的标识和标签，不读取备注说明。" },
        { label: "无隐藏兜底", text: "中心辐射网络不再默认补充“中心”等硬编码文字。" },
      ],
    },
    visual_anchor: {
      id: "cleanup_network",
      title: "Network Clean",
      claim: "网络图只表达实体连接。",
      kind: "Network",
      template: "hub_spoke_network",
      visual_spec: {
        hub: { id: "entry", label: "渲染入口" },
        nodes: [
          { id: "schema", label: "规格校验" },
          { id: "svg", label: "手绘图" },
          { id: "native", label: "原生图" },
          { id: "qa", label: "质量检查" },
        ],
        edges: [["entry", "schema"], ["entry", "svg"], ["entry", "native"], ["schema", "qa"], ["svg", "qa"], ["native", "qa"]],
        highlight: "qa",
      },
    },
    visualAnchorCaption: "图 4：网络图只表达实体连接，节点说明和业务解释保留在 PPT 文本层。",
    supportingCards: [
      { title: "同类清理", body: ["删除默认中文兜底", "渲染器不发明节点文字", "输入是什么就展示什么"] },
      { title: "生成物扫描", body: ["没有旧说明文字", "没有旧空框路径", "没有虚线说明路径"] },
    ],
    source,
    page: "06",
  });

  writeVisualAnchorManifest(pptx, manifestPath);
  await pptx.writeFile({ fileName: output });
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
