const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const {
  createHuaweiDeck,
  ensureTmpPath,
  repairPptxForPowerPointCom,
} = require("../pptx/hw_pptx_helpers");
const {
  addVisualAnchorContentSlide,
  writeVisualAnchorManifest,
} = require("../pptx/hw_visual_anchor_slide");

const OUTPUT_STEM = "content_layout_schema_smoke";
const OUT_DIR = ensureTmpPath(path.join(".tmp", OUTPUT_STEM));
const PPTX_PATH = path.join(OUT_DIR, `${OUTPUT_STEM}.pptx`);
const MANIFEST_PATH = path.join(OUT_DIR, `${OUTPUT_STEM}_visual_anchor_manifest.json`);
const PLAN_PATH = path.join(OUT_DIR, `${OUTPUT_STEM}_plan.json`);

function svgMarkup(label, accent = "C00000") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <rect x="0" y="0" width="800" height="450" fill="#F7F7F7"/>
    <rect x="70" y="70" width="170" height="260" fill="#${accent}"/>
    <rect x="315" y="135" width="170" height="195" fill="#D9D9D9"/>
    <rect x="560" y="35" width="170" height="295" fill="#BFBFBF"/>
    <line x1="55" y1="350" x2="745" y2="350" stroke="#8C8C8C" stroke-width="3"/>
    <text x="400" y="410" text-anchor="middle" font-size="32" font-family="Microsoft YaHei" fill="#333333">${label}</text>
  </svg>`;
  return svg;
}

async function writeDemoImage(fileName, label, accent) {
  const outPath = path.join(OUT_DIR, "images", fileName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svgMarkup(label, accent))).png().toFile(outPath);
  return { path: outPath, width: 800, height: 450 };
}

function planEntry(page, data) {
  const visualAnchors = collectVisualAnchors(data.contentLayout.modules);
  if (!visualAnchors.length && data.visual_anchor) visualAnchors.push(data.visual_anchor);
  const visualAnchor = visualAnchors[0] || {};
  return {
    page: Number(page),
    title: data.title,
    visual_anchor: {
      kind: visualAnchor.kind,
      template: visualAnchor.template,
    },
    visual_anchors: visualAnchors.map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      template: anchor.template,
      why_this_visual: `${anchor.title || anchor.id}用于验证内容布局模块中的视觉锚点渲染。`,
      layout_reference: data.layoutReference,
      relationship_test: `${anchor.kind}/${anchor.template}与该模块的信息关系一致。`,
    })),
    layout_reference: data.layoutReference,
    content_layout: {
      type: data.contentLayout.type,
      reference: data.contentLayout.reference,
      modules_count: data.contentLayout.modules.length,
    },
  };
}

function collectVisualAnchors(modules = []) {
  const anchors = [];
  for (const module of modules) {
    if (module.visual_anchor) anchors.push(module.visual_anchor);
    const blocks = module.blocks || module.children || [];
    for (const block of blocks) {
      if (block.visual_anchor) anchors.push(block.visual_anchor);
    }
  }
  return anchors;
}

function quantityAnchor(id, title) {
  return {
    id,
    title,
    claim: `${title}用数量关系承载页面主证据。`,
    kind: "Quantity",
    template: "bar_chart",
    visual_spec: {
      y_label: "完成度",
      categories: ["方案一", "方案二", "方案三", "方案四"],
      series: [
        { name: "指标", values: [20, 40, 60, 100] },
      ],
    },
  };
}

function processAnchor(id, title) {
  return {
    id,
    title,
    claim: `${title}用数据卡说明推进节奏。`,
    kind: "Quantity",
    template: "data_cards",
    visual_spec: {
      cards: [
        { id: "a", label: "输入", value: "1", unit: "步" },
        { id: "b", label: "处理", value: "2", unit: "步" },
        { id: "c", label: "输出", value: "3", unit: "步" },
      ],
    },
  };
}

function matrixAnchor(id, title, rows, columns, values = null) {
  return {
    id,
    title,
    claim: `${title}用矩阵关系承载分栏内的结构信息。`,
    kind: "Matrix",
    template: "capability_matrix",
    visual_spec: {
      rows: rows.map(() => ""),
      columns: columns.map(() => ""),
      values: values || rows.map((_, rowIdx) => columns.map((_, colIdx) => `${rowIdx + 1}-${colIdx + 1}`)),
    },
  };
}

function tableAnchor(id, title, rows) {
  return {
    id,
    title,
    claim: `${title}用表格承载明确判断。`,
    kind: "Matrix",
    template: "table",
    visual_spec: { rows },
  };
}

function metricStripAnchor(id, title, prefix = "内容文字") {
  return {
    id,
    title,
    claim: `${title}用数据卡表达横向 KPI 对比。`,
    kind: "Quantity",
    template: "data_cards",
    visual_spec: {
      cards: standardMetrics(prefix).map((metric, idx) => ({
        id: `m${idx + 1}`,
        label: metric.label,
        value: metric.value,
      })),
    },
  };
}

function standardMetrics(prefix = "指标") {
  return [
    { value: "0.00亿", label: `${prefix}一` },
    { value: "0.00亿", label: `${prefix}二` },
    { value: "0.00亿", label: `${prefix}三` },
    { value: "0.00亿", label: `${prefix}四` },
  ];
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const images = {
    left: await writeDemoImage("left_module.png", "左侧图文模块", "C00000"),
    evidence: await writeDemoImage("left_evidence.png", "左列证据", "C00000"),
    lower: await writeDemoImage("lower_panel.png", "下方面板", "C00000"),
  };
  const pptx = createHuaweiDeck({ title: "内容布局 Schema Smoke" });
  const sections = ["二分栏", "偏分栏", "三分栏", "四分栏"];
  const source = "来源：内容布局 Schema 冒烟测试";
  const planSlides = [];

  const slides = [
    {
      page: "01",
      title: "二分栏布局",
      titleNote: "两侧模块等宽承载图文信息",
      currentSection: "二分栏",
      layoutReference: "05 内容 二分栏",
      summary: { body: [
        { label: "左右均衡", text: "两列都带红色标题栏，左侧解释背景，右侧放置主数据关系。" },
        { label: "图文并置", text: "图片模块与视觉锚点并列，形成一页多个信息对象的阅读路径。" },
      ] },
      contentLayout: {
        type: "two_column",
        reference: "05 内容 二分栏",
        modules: [
          {
            role: "content_panel",
            title: "这里是标题区域 样式",
            blocks: [
              {
                type: "text",
                height: 0.7,
                fontSize: 10,
                body: [
                  "第一段解释文字放在上方白色内容框，形成参考图 05 的段落密度。",
                  "第二段补充判断依据，并引导读者进入下方小框阵列。",
                ],
              },
              {
                type: "visual_anchor",
                visual_anchor: matrixAnchor(
                  "layout_two_column_grid",
                  "二分栏左侧矩阵",
                  ["一", "二", "三"],
                  ["A", "B", "C"],
                  [
                    ["小标题", "标签", "10号字"],
                    ["内容区", "标签", "补充项"],
                    ["内容较多的标签", "小标题", "结论块"],
                  ],
                ),
              },
            ],
          },
          {
            role: "content_panel",
            title: "标题2",
            blocks: [
              { type: "visual_anchor", height: 1.05, visual_anchor: metricStripAnchor("layout_two_column_metrics", "二分栏 KPI", "内容文字") },
              {
                type: "visual_anchor",
                height: 0.72,
                visual_anchor: matrixAnchor(
                  "layout_two_column_support",
                  "二分栏支撑矩阵",
                  ["上", "下"],
                  ["左", "右"],
                  [["内容区域样式", "内容区域样式"], ["内容区域样式", "内容区域样式"]],
                ),
              },
              { type: "visual_anchor", weight: 1.1, visual_anchor: processAnchor("layout_two_column_quantity", "二分栏主图") },
              {
                type: "text",
                height: 0.62,
                fontSize: 10,
                body: ["右侧先呈现 KPI 数据卡，再接结构图和下方判断文字。", "原生图形分支保留红灰视觉层次。"],
              },
            ],
          },
        ],
      },
    },
    {
      page: "02",
      title: "偏分栏布局",
      titleNote: "左侧大视觉区加右侧解释栏",
      currentSection: "偏分栏",
      layoutReference: "06 内容 偏分栏",
      summary: { body: [
        { label: "主次分明", text: "左侧宽栏承载大图或结构关系，右侧窄栏放两段可读解释。" },
        { label: "靠近解读", text: "解释栏紧贴主视觉，避免图片和文字彼此脱节。" },
      ] },
      contentLayout: {
        type: "biased_column",
        reference: "06 内容 偏分栏",
        modules: [
          {
            role: "visual_anchor",
            visual_anchor: quantityAnchor("layout_biased_quantity", "偏分栏主图"),
            visualAnchorCaption: {
              text: "偏分栏主视觉：宽栏只承载图形证据",
            },
          },
          {
            role: "text",
            title: "主线承接",
            body: "资料片承接上一阶段后续，左侧主视觉承担关键证据，右侧文字只解释它如何进入当前判断：先明确关系，再说明影响对象，最后给出可以复述的结论。",
          },
          {
            role: "text",
            title: "传播抓手",
            body: "第二张卡片承接用户最容易复述的结论，形成清晰的回归理由和下一步行动入口；文字密度贴近参考页右栏，而不挤占左侧大图空间。",
          },
          {
            role: "text",
            title: "风险边界",
            body: "第三张卡片补充边界条件，避免把左侧图形误读为孤立故事，而是作为后续判断的证据；读者可以直接看到主视觉和解释卡之间的因果关系。",
          },
        ],
      },
    },
    {
      page: "03",
      title: "三分栏布局",
      titleNote: "三列并列形成解释、图形和结论",
      currentSection: "三分栏",
      layoutReference: "07 内容 三分栏",
      summary: { body: [
        { label: "三段递进", text: "左列铺垫，中列承载流程锚点，右列给出结论清单。" },
        { label: "密度一致", text: "每列使用相同红色标题栏和灰色内容区，保证横向扫描稳定。" },
      ] },
      contentLayout: {
        type: "three_column",
        reference: "07 内容 三分栏",
        flowArrows: { arrows: [0.36, 0.5, 0.64] },
        modules: [
          {
            role: "content_panel",
            title: "这里是标题区域 样式",
            blocks: [
              { type: "text", height: 0.7, fontSize: 10, body: ["左列以短说明开场，密度贴近参考图 07。", "下方三列小框承接细节。"] },
              {
                type: "visual_anchor",
                visual_anchor: matrixAnchor(
                  "layout_three_left_grid",
                  "三分栏左侧矩阵",
                  ["一", "二", "三", "四"],
                  ["A", "B", "C"],
                  [["小标题", "小标题", "小标题"], ["标签", "标签", "标签"], ["内容区", "内容区", "内容区"], ["结论", "结论", "结论"]],
                ),
              },
            ],
          },
          {
            role: "content_panel",
            title: "这里是标题区域 样式",
            blocks: [
              {
                type: "text",
                height: 0.5,
                fontSize: 10,
                body: "卡片内标题",
              },
              {
                type: "visual_anchor",
                height: 0.78,
                visual_anchor: matrixAnchor("layout_three_mid_top", "三分栏中列上矩阵", ["一", "二"], ["A", "B"], [["这里为内容区域", "内容区域"], ["这里为内容区", ""]]),
              },
              {
                type: "text",
                height: 0.5,
                fontSize: 10,
                body: "卡片内标题",
              },
              {
                type: "visual_anchor",
                height: 1.05,
                visual_anchor: matrixAnchor(
                  "layout_three_mid_grid",
                  "三分栏中列矩阵",
                  ["一", "二", "三"],
                  ["A", "B", "C"],
                  [["内容区域", "内容区域", "内容区域"], ["内容区域", "内容区域", "内容区域"], ["内容区域", "内容区域", "内容区域"]],
                ),
              },
              {
                type: "text",
                height: 0.5,
                fontSize: 10,
                body: "卡片内标题",
              },
              {
                type: "visual_anchor",
                visual_anchor: matrixAnchor(
                  "layout_three_mid_bottom",
                  "三分栏中列下矩阵",
                  ["一", "二"],
                  ["A", "B", "C"],
                  [["内容区域", "内容区域", "内容区域"], ["这里为内容区", "内容区域", ""]],
                ),
              },
            ],
          },
          {
            role: "content_panel",
            title: "这里是标题区域 样式",
            blocks: [
              {
                type: "text",
                weight: 1,
                fontSize: 12,
                body: ["右列放流程锚点并给出结论清单。", "处理环节负责收敛差异。", "输出结果进入质量检查。"],
              },
              { type: "visual_anchor", height: 2.8, visual_anchor: processAnchor("layout_three_process", "三分栏流程") },
            ],
          },
        ],
      },
    },
    {
      page: "04",
      title: "四分栏布局",
      titleNote: "四个面板以 2x2 组合承载多证据",
      currentSection: "四分栏",
      layoutReference: "08 内容 四分栏",
      summary: { body: [
        { label: "四块组合", text: "四分栏按 2x2 面板组织，不是简单四列拉伸。" },
        { label: "多锚点", text: "同页允许多个视觉锚点，硬 QA 只要求至少一个锚点落入 manifest。" },
      ] },
      contentLayout: {
        type: "four_column",
        reference: "08 内容 四分栏",
        modules: [
          {
            role: "content_panel",
            title: "这里是标题区域 样式",
            blocks: [
              { type: "visual_anchor", visual_anchor: processAnchor("layout_four_cards", "四分栏卡片") },
            ],
          },
          {
            role: "content_panel",
            title: "标题2",
            blocks: [
              { type: "visual_anchor", height: 1.0, visual_anchor: metricStripAnchor("layout_four_metrics", "四分栏 KPI", "线索") },
              { type: "text", fontSize: 10, body: ["这里为内容区域样式这里为内容区域样式，这里为内容区域样式。", "这里为内容区域样式这里为内容区域，这里为内容区域样式。"] },
            ],
          },
          {
            role: "content_panel",
            title: "这里是标题区域 样式",
            blocks: [
              {
                type: "visual_anchor",
                visual_anchor: matrixAnchor(
                  "layout_four_lower_grid",
                  "四分栏下方矩阵",
                  ["一", "二", "三", "四", "五"],
                  ["A", "B"],
                  [["小标题", "小标题"], ["内容较多的标签", "内容较多的标签"], ["10号字", "10号字"], ["内容区", "内容区"], ["标签", "内容较多的标签"]],
                ),
              },
            ],
          },
          {
            role: "content_panel",
            title: "标题2",
            blocks: [
              {
                type: "visual_anchor",
                visual_anchor: tableAnchor("layout_four_table", "四分栏表格", [
                  ["分支", "支持"],
                  ["表格", "是"],
                  ["SVG", "是"],
                  ["原生", "是"],
                ]),
              },
            ],
          },
        ],
      },
    },
  ];

  const limit = Number(process.env.HW_CONTENT_LAYOUT_SMOKE_LIMIT || slides.length);
  const start = Math.max(0, Number(process.env.HW_CONTENT_LAYOUT_SMOKE_START || 0));
  slides.slice(start, start + limit).forEach((data) => {
    const slideData = { ...data, sections, source };
    addVisualAnchorContentSlide(pptx, slideData);
    planSlides.push(planEntry(data.page, slideData));
  });

  writeVisualAnchorManifest(pptx, MANIFEST_PATH);
  fs.writeFileSync(PLAN_PATH, JSON.stringify({ slides: planSlides }, null, 2), "utf8");
  await pptx.writeFile({ fileName: PPTX_PATH });
  if (process.env.HW_SKIP_PPTX_REPAIR !== "1") await repairPptxForPowerPointCom(PPTX_PATH);
  console.log(`Wrote ${PPTX_PATH}`);
  console.log(`Wrote ${MANIFEST_PATH}`);
  console.log(`Wrote ${PLAN_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
