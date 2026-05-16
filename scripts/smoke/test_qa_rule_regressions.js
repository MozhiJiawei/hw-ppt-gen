const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const {
  addCoverSlide,
  createHuaweiDeck,
  repairPptxForPowerPointCom,
} = require("../pptx/hw_pptx_helpers");
const {
  addVisualAnchorContentSlide,
  writeVisualAnchorManifest,
} = require("../pptx/hw_visual_anchor_slide");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "qa_rule_regressions");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function baseProcessAnchor(id, layoutReference = "06 内容 偏分栏") {
  return {
    id,
    title: "规则复现",
    claim: "用于复现 QA 规则边界。",
    kind: "Sequence",
    template: "process",
    why_this_visual: "流程锚点能稳定触发布局与 QA 检查。",
    layout_reference: layoutReference,
    relationship_test: "步骤之间存在先后依赖，适合用流程关系呈现。",
    visual_spec: {
      steps: [
        { id: "input", label: "输入" },
        { id: "check", label: "检查" },
        { id: "result", label: "输出" },
      ],
      highlight: "check",
    },
    highlight_reason: "高亮检查环节，因为本页验证 QA 规则是否正确识别内容。",
  };
}

function tableAnchor(id, rows) {
  return {
    id,
    title: "四分栏表格",
    claim: "小模块内表格需要容量约束。",
    kind: "Matrix",
    template: "table",
    why_this_visual: "表格用于复现四分栏模块内的高度容量风险。",
    layout_reference: "08 内容 四分栏",
    relationship_test: "多行多列指标存在结构化比较关系，适合表格呈现。",
    visual_spec: { rows },
  };
}

function evidenceAnchor(id, imagePath) {
  return {
    id,
    title: "源图缩放",
    claim: "源图必须在视觉区域内保持可读尺寸。",
    kind: "Evidence",
    template: "source_figure",
    why_this_visual: "源图直接承载页面证据，缩放过小时会失去论证价值。",
    layout_reference: "05 内容 二分栏",
    relationship_test: "源图与结论存在直接证据关系，必须作为 Evidence 呈现。",
    source: {
      path: imagePath,
      caption: "极宽源图用于复现缩放过小的证据图问题。",
    },
  };
}

function compactTableAnchor(id, layoutReference = "07 内容 三分栏") {
  return {
    id,
    title: "对齐复现表",
    claim: "用于复现分栏内容上下边界不齐的问题。",
    kind: "Matrix",
    template: "table",
    why_this_visual: "表格锚点能稳定渲染并触发分栏模块几何记录。",
    layout_reference: layoutReference,
    relationship_test: "多项判断存在结构化比较关系，适合表格呈现。",
    visual_spec: {
      rows: [
        ["项", "判断"],
        ["A", "通过"],
        ["B", "观察"],
      ],
    },
  };
}

function planEntry(page, slideData) {
  const anchors = [];
  const collect = (module) => {
    if (!module) return;
    const direct = module.visual_anchor || module.visualAnchor;
    if (direct) anchors.push(direct);
    for (const block of module.blocks || module.children || []) {
      if (block.visual_anchor || block.visualAnchor) anchors.push(block.visual_anchor || block.visualAnchor);
    }
  };
  if (slideData.visual_anchor) anchors.push(slideData.visual_anchor);
  for (const module of slideData.contentLayout?.modules || []) collect(module);
  return { page, visual_anchors: anchors };
}

async function generateDeck() {
  ensureDir(OUT_DIR);
  const tinyEvidencePath = path.join(OUT_DIR, "tiny_evidence.png");
  await sharp({
    create: {
      width: 1000,
      height: 80,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: Buffer.from(`<svg width="1000" height="80"><rect x="0" y="0" width="1000" height="80" fill="white"/><text x="500" y="48" font-size="38" text-anchor="middle" fill="#C00000">过宽证据图</text></svg>`), top: 0, left: 0 }])
    .png()
    .toFile(tinyEvidencePath);

  const pptx = createHuaweiDeck({ title: "QA Rule Regressions" });
  addCoverSlide(pptx, {
    title: "QA 规则回归复现",
    subtitle: "用于验证 #7 #8 #9 #10",
    source: "来源：规则回归测试",
  });

  const sections = ["规则复现", "对照章节"];
  const slides = [
    {
      page: "02",
      title: "英文术语不应导致分析总结缺失",
      sections,
      currentSection: "规则复现",
      summary: { body: [
        { label: "官方案例", text: "LangChain coding agent 保留英文产品名但仍有总结内容。" },
        { label: "推理任务", text: "RAG math reasoning 是必要技术术语。" },
      ] },
      visual_anchor: baseProcessAnchor("english_summary_terms", "05 内容 二分栏"),
    },
    {
      page: "03",
      title: "偏分栏短判断卡不应被当成空卡",
      sections,
      currentSection: "规则复现",
      summary: { body: [{ label: "判断卡", text: "右侧卡片短而明确，用于解释左侧主视觉。" }] },
      contentLayout: {
        type: "biased_column",
        reference: "06 内容 偏分栏",
        modules: [
          {
            role: "visual_anchor",
            title: "左侧主视觉",
            visual_anchor: baseProcessAnchor("biased_short_cards"),
          },
          { role: "text", title: "结论明确", body: "直接可用。证据对应左图。" },
          { role: "text", title: "边界清楚", body: "仅限本轮。后续继续观察。" },
          { role: "text", title: "行动简单", body: "先做验证。再扩展范围。" },
        ],
      },
    },
    {
      page: "04",
      title: "旧偏分栏 API 应写入统一布局语义",
      sections,
      currentSection: "规则复现",
      summary: { body: [{ label: "兼容路径", text: "supportingCards 生成偏分栏时也应留下可校验布局语义。" }] },
      layoutReference: "06 内容 偏分栏",
      visual_anchor: baseProcessAnchor("supporting_cards_resolved_layout"),
      supportingCards: [
        { title: "判断一", body: "左图说明输入路径。" },
        { title: "判断二", body: "右卡提供阅读结论。" },
      ],
    },
    {
      page: "05",
      title: "四分栏表格容量必须被 QA 拦截",
      sections,
      currentSection: "规则复现",
      summary: { body: [{ label: "容量风险", text: "小模块内多行表格容易压到后续模块。" }] },
      contentLayout: {
        type: "four_column",
        reference: "08 内容 四分栏",
        modules: [
          {
            role: "content_panel",
            title: "过高表格",
            blocks: [{
              type: "visual_anchor",
              visual_anchor: tableAnchor("four_column_tall_table", [
                ["任务", "指标", "解读"],
                ["A", "通过率", "较长描述"],
                ["B", "准确率", "较长描述"],
                ["C", "稳定性", "较长描述"],
                ["D", "成本", "较长描述"],
              ]),
            }],
          },
          { role: "content_panel", title: "模块二", blocks: [{ type: "text", body: "后续模块标题不能被表格压住。" }] },
          { role: "content_panel", title: "模块三", blocks: [{ type: "text", body: "底部模块保持清晰。" }] },
          { role: "content_panel", title: "模块四", blocks: [{ type: "text", body: "底部模块保持清晰。" }] },
        ],
      },
    },
    {
      page: "06",
      title: "证据图缩放过小必须被 QA 拦截",
      sections,
      currentSection: "规则复现",
      summary: { body: [{ label: "可读优先", text: "源图即使按比例放置，也不能小到失去证据作用。" }] },
      contentLayout: {
        type: "two_column",
        reference: "05 内容 二分栏",
        modules: [
          {
            role: "content_panel",
            title: "过宽源图",
            blocks: [{
              type: "visual_anchor",
              height: 3.7,
              visual_anchor: evidenceAnchor("tiny_evidence_source_figure", tinyEvidencePath),
              visualAnchorCaption: { text: "证据图缩放：极宽图在常规模块中会被压得过小", source: "来源：QA 规则回归测试" },
            }],
          },
          { role: "content_panel", title: "阅读风险", blocks: [{ type: "text", body: "如果 hard QA 不拦截，最终视觉审阅才会发现图像过小。" }] },
        ],
      },
    },
    {
      page: "07",
      title: "大卡内容稀疏必须被 QA 拦截",
      sections,
      currentSection: "规则复现",
      summary: { body: [{ label: "密度约束", text: "大面积内容卡不能只放短句，否则会形成明显空白。" }] },
      contentLayout: {
        type: "two_column",
        reference: "05 内容 二分栏",
        modules: [
          {
            role: "content_panel",
            title: "合规视觉",
            blocks: [{
              type: "visual_anchor",
              visual_anchor: baseProcessAnchor("sparse_card_control_visual", "05 内容 二分栏"),
            }],
          },
          { role: "content_panel", title: "稀疏大卡", blocks: [{ type: "text", body: "短句。" }] },
        ],
      },
    },
    {
      page: "08",
      title: "分栏内容上下边界必须对齐",
      sections,
      currentSection: "规则复现",
      summary: { body: [{ label: "对齐约束", text: "二分栏和三分栏的内容块不能在不同高度结束。" }] },
      contentLayout: {
        type: "three_column",
        reference: "07 内容 三分栏",
        modules: [
          {
            role: "content_panel",
            title: "短视觉",
            blocks: [{
              type: "visual_anchor",
              height: 1.0,
              visual_anchor: compactTableAnchor("misaligned_short_visual"),
            }],
          },
          {
            role: "content_panel",
            title: "长视觉",
            blocks: [{
              type: "visual_anchor",
              height: 2.0,
              visual_anchor: compactTableAnchor("misaligned_tall_visual"),
            }],
          },
          {
            role: "content_panel",
            title: "短文本",
            blocks: [{ type: "text", height: 1.1, body: "短内容导致底边提前结束。" }],
          },
        ],
      },
    },
  ];

  const planSlides = [];
  for (const slideData of slides) {
    addVisualAnchorContentSlide(pptx, { ...slideData, source: "来源：QA 规则回归测试" });
    planSlides.push(planEntry(slideData.page, slideData));
  }

  const pptxPath = path.join(OUT_DIR, "qa_rule_regressions.pptx");
  const planPath = path.join(OUT_DIR, "qa_rule_regressions_plan.json");
  const manifestPath = path.join(OUT_DIR, "qa_rule_regressions_visual_anchor_manifest.json");
  const qaPath = path.join(OUT_DIR, "qa_rule_regressions.qa.json");

  writeVisualAnchorManifest(pptx, manifestPath);
  fs.writeFileSync(planPath, JSON.stringify({ slides: planSlides }, null, 2), "utf8");
  await pptx.writeFile({ fileName: pptxPath });
  await repairPptxForPowerPointCom(pptxPath);

  try {
    execFileSync("node", [
      path.join(ROOT, "scripts", "qa", "check_huawei_pptx.js"),
      pptxPath,
      "--out",
      qaPath,
      "--require-plan",
      planPath,
      "--require-visual-anchor-manifest",
      manifestPath,
    ], { cwd: ROOT, stdio: "pipe" });
  } catch (error) {
    if (!fs.existsSync(qaPath)) throw error;
  }

  return {
    manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    qa: JSON.parse(fs.readFileSync(qaPath, "utf8")),
  };
}

function issuesOf(result, type, slide) {
  return result.qa.issues.filter((item) => item.type === type && (slide === undefined || item.slide === slide));
}

async function main() {
  const result = await generateDeck();

  assert.equal(issuesOf(result, "analysis_summary_missing", 2).length, 0, "#9: English terms after semantic labels must not hide the analysis summary");
  assert.equal(issuesOf(result, "sparse_large_card", 3).length, 0, "#7: biased-column interpretation cards with short explicit judgments should not be sparse-card warnings");

  const supportingCardEntry = result.manifest.slides.find((entry) => entry.visual_anchor_id === "supporting_cards_resolved_layout");
  assert(supportingCardEntry, "#8 fixture should render the supportingCards visual anchor");
  assert.equal(supportingCardEntry.resolved_layout_type, "biased_column", "#8: supportingCards path should record the resolved biased-column layout");
  assert(supportingCardEntry.content_layout_schema, "#8: supportingCards path should expose unified content layout schema evidence");

  assert(issuesOf(result, "content_visual_anchor_table_overflow", 5).length >= 1, "#10: tall Matrix/table anchors in four-column modules should be blocking QA issues");
  assert(issuesOf(result, "content_visual_anchor_image_too_small", 6).length >= 1, "#11: evidence images that occupy too little visual area should be blocking QA issues");
  assert(issuesOf(result, "sparse_large_card").some((item) => item.severity === "error"), "#12: very sparse large cards should be blocking QA issues");
  assert(issuesOf(result, "content_layout_module_alignment", 8).length >= 1, "#13: misaligned column module content should be blocking QA issues");

  console.log("QA rule regression tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
