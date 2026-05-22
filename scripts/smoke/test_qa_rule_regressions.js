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

function baseProcessAnchor(id) {
  return {
    id,
    title: "规则复现",
    claim: "用于复现 QA 规则边界。",
    kind: "Quantity",
    template: "bar_chart",
    visual_spec: {
      y_label: "值",
      categories: ["A", "B", "C"],
      series: [
        { name: "指标", values: [1, 2, 3] },
      ],
      highlight: { category: "B", series: "指标" },
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
    source: {
      path: imagePath,
      caption: "极宽源图用于复现缩放过小的证据图问题。",
    },
  };
}

function compactTableAnchor(id) {
  return {
    id,
    title: "对齐复现表",
    claim: "用于复现分栏内容上下边界不齐的问题。",
    kind: "Matrix",
    template: "table",
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
  return { page, visual_anchors: anchors, contentLayout: slideData.contentLayout };
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
    subtitle: "这是一段故意写得很长的封面副标题，用来模拟模型把完整核心结论塞进红色封面横幅，导致副标题多行换行并破坏华为封面版式。",
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
            blocks: [
              {
                type: "supporting_component",
                visual_anchor: tableAnchor("four_column_tall_table", [
                  ["任务", "指标", "解读"],
                  ["A", "通过率", "较长描述"],
                  ["B", "准确率", "较长描述"],
                  ["C", "稳定性", "较长描述"],
                  ["D", "成本", "较长描述"],
                ]),
              },
              {
                type: "visual_anchor",
                height: 1.2,
                visual_anchor: baseProcessAnchor("four_column_table_real_anchor", "08 内容 四分栏"),
              },
            ],
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
            blocks: [
              { type: "visual_anchor", height: 1.2, visual_anchor: baseProcessAnchor("misaligned_real_anchor", "07 内容 三分栏") },
              { type: "text", height: 1.1, body: "短内容导致底边提前结束。" },
            ],
          },
        ],
      },
    },
    {
      page: "09",
      title: "证据与模块结论不匹配必须被 QA 拦截",
      sections,
      currentSection: "规则复现",
      summary: { body: [{ label: "绑定关系", text: "模块里的图片必须证明标题和文字，不允许借无关图凑视觉锚点。" }] },
      contentLayout: {
        type: "two_column",
        reference: "05 内容 二分栏",
        modules: [
          {
            role: "content_panel",
            title: "保真证据：低 retention 仍保持质量",
            blocks: [
              {
                type: "visual_anchor",
                visual_anchor: {
                  ...baseProcessAnchor("claim_mismatch_anchor"),
                  title: "训练路由机制",
                  claim: "训练期随机跨层注意力让模型适应多种 KV 来源。",
                },
              },
              {
                type: "text",
                body: [
                  "质量保持：R-CLA 在低 cache retention 下缓解退化。",
                  "评估口径：F1 曲线证明保真收益。",
                ],
              },
            ],
          },
          {
            role: "content_panel",
            title: "匹配对照：随机路由训练机制",
            blocks: [
              {
                type: "visual_anchor",
                visual_anchor: {
                  ...baseProcessAnchor("claim_match_anchor"),
                  title: "随机路由对照",
                  claim: "训练期随机跨层注意力释放固定 cache sharing 的脆弱性。",
                },
              },
              {
                type: "text",
                body: [
                  "训练扰动：层可使用自身或先前层 KV states。",
                  "机制判断：随机路由提升部署弹性。",
                ],
              },
            ],
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
    pptxPath,
  };
}

function issuesOf(result, type, slide) {
  return result.qa.issues.filter((item) => item.type === type && (slide === undefined || item.slide === slide));
}

function runBriefContractQaFixture(pptxPath) {
  const briefPath = path.join(ROOT, "scripts", "smoke", "fixtures", "ppt_content_brief_valid.md");
  const planPath = path.join(OUT_DIR, "ppt_content_brief_bad_plan.json");
  const qaPath = path.join(OUT_DIR, "ppt_content_brief_bad_plan.qa.json");
  const badPlan = {
    slides: [
      {
        page: 2,
        title: "Stochastic KV Routing",
        titleNote: "被模型改写的标题说明",
        currentSection: "瓶颈来自 KV cache",
        summary: {
          body: [
            { label: "问题", text: "KV cache 随层数和上下文线性扩张，推高推理显存成本。" },
            { label: "机制", text: "R-CLA 训练时随机选择历史层 KV，部署时固定共享策略。" },
            { label: "判断", text: "适合先在长上下文、显存受限场景做受控评估。" },
          ],
        },
      },
      {
        page: 4,
        title: "KV Cache 瓶颈",
        titleNote: "每层 KV state 放大长上下文显存占用，压缩 batch 和 context 空间。",
        currentSection: "瓶颈来自 KV cache",
        summary: {
          body: [
            { label: "显存压力", text: "KV cache 随层数、序列长度和 batch 线性扩张。" },
            { label: "成本边界", text: "缓存 footprint 会限制并发容量和长上下文服务。" },
          ],
        },
      },
      {
        page: 5,
        title: "R-CLA 机制",
        titleNote: "训练期随机跨层注意力，让部署期固定 cache sharing 不再脆弱。",
        currentSection: "弹性来自随机路由",
        summary: {
          body: [
            { label: "训练扰动", text: "每层随机使用自身或先前层 KV states。" },
            { label: "部署弹性", text: "测试时可固定每 2 层或 4 层共享一份 KV cache。" },
          ],
        },
      },
    ],
  };
  fs.writeFileSync(planPath, JSON.stringify(badPlan, null, 2), "utf8");
  try {
    execFileSync("node", [
      path.join(ROOT, "scripts", "qa", "check_huawei_pptx.js"),
      pptxPath,
      "--out",
      qaPath,
      "--require-plan",
      planPath,
      "--require-ppt-content-brief",
      briefPath,
    ], { cwd: ROOT, stdio: "pipe" });
  } catch (error) {
    if (!fs.existsSync(qaPath)) throw error;
  }
  return JSON.parse(fs.readFileSync(qaPath, "utf8"));
}

async function main() {
  const result = await generateDeck();

  assert(issuesOf(result, "cover_subtitle_too_long", 1).length >= 1, "#21: cover subtitles should stay one-line positioning phrases, not full core conclusions");
  assert.equal(issuesOf(result, "analysis_summary_missing", 2).length, 0, "#9: English terms after semantic labels must not hide the analysis summary");
  assert.equal(issuesOf(result, "sparse_large_card", 3).length, 0, "#7: biased-column interpretation cards with short explicit judgments should not be sparse-card warnings");

  const supportingCardEntry = result.manifest.slides.find((entry) => entry.visual_anchor_id === "supporting_cards_resolved_layout");
  assert(supportingCardEntry, "#8 fixture should render the supportingCards visual anchor");
  assert.equal(supportingCardEntry.resolved_layout_type, "biased_column", "#8: supportingCards path should record the resolved biased-column layout");
  assert(supportingCardEntry.content_layout_schema, "#8: supportingCards path should expose unified content layout schema evidence");

  assert(issuesOf(result, "content_visual_anchor_table_overflow", 5).length >= 1, "#10: tall Matrix/table supporting components in four-column modules should be blocking QA issues");
  assert(issuesOf(result, "content_visual_anchor_image_too_small", 6).length >= 1, "#11: evidence images that occupy too little visual area should be blocking QA issues");
  assert(issuesOf(result, "sparse_large_card").some((item) => item.severity === "error"), "#12: very sparse large cards should be blocking QA issues");
  assert(issuesOf(result, "content_layout_module_alignment", 8).length >= 1, "#13: misaligned column module content should be blocking QA issues");
  assert(issuesOf(result, "content_layout_module_anchor_missing", 7).length >= 1, "#19: text-only two/three/four-column modules should be blocking QA issues");
  assert(issuesOf(result, "content_layout_evidence_claim_mismatch", 9).length >= 1, "#20: unrelated visual anchors should fail evidence-to-claim binding QA");

  const briefQa = runBriefContractQaFixture(result.pptxPath);
  assert(briefQa.issues.some((item) => item.type === "ppt_content_brief_title_note_mismatch"), "#18: brief-backed titleNote rewrites should fail QA");
  assert(briefQa.issues.some((item) => item.type === "ppt_content_brief_layout_mismatch"), "#18: brief-backed summary-count layout mismatches should fail QA");
  assert(briefQa.issues.some((item) => item.type === "ppt_content_brief_visible_title_mismatch"), "#18: visible PPT title drift from brief should fail QA");
  assert(briefQa.issues.some((item) => item.type === "ppt_content_brief_visible_summary_mismatch"), "#18: visible PPT summary drift from brief should fail QA");

  console.log("QA rule regression tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
