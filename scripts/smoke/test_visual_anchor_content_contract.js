const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

const expectedContentSlideExports = [
  "addVisualAnchorContentSlide",
  "premeasureVisualAnchorContentSlides",
  "writeVisualAnchorManifest",
].sort();

const imageVisualSpec = {
  id: "contract_image_visual",
  title: "Image Visual",
  claim: "正文页视觉锚点应生成可检查的图片证据。",
  kind: "Quantity",
  template: "line_chart",
  visual_spec: {
    y_label: "质量",
    categories: ["计划", "生成", "检查"],
    series: [
      { name: "质量", values: [1, 2, 3] },
    ],
    highlight: { category: "生成", series: "质量" },
  },
  highlight_reason: "高亮生成，因为它验证图片证据是否真正记录。",
};

function writeSourceSvg(relativePath, width, height, label = "source") {
  const filePath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" stroke="#C00000" stroke-width="8"/>
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="42" font-family="Microsoft YaHei">${label}</text>
</svg>`, "utf8");
  return filePath;
}

function evidenceSourceAnchor(id, sourcePath) {
  return {
    id,
    title: id,
    claim: "源图作为证据锚点进入内容布局。",
    kind: "Evidence",
    template: "source_figure",
    source: { path: sourcePath, caption: "Source figure for auto layout." },
  };
}

function biasedContentLayout(anchor, sideModules = [], options = {}) {
  return {
    type: "biased_column",
    reference: "06 内容 偏分栏",
    modules: [
      {
        role: "visual_anchor",
        title: options.visualTitle || anchor.title || "主视觉",
        visual_anchor: anchor,
        visual_anchor_caption: options.visual_anchor_caption,
      },
      ...sideModules,
    ],
  };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function collect(testName, fn, failures) {
  try {
    fn();
  } catch (error) {
    failures.push({ testName, error });
  }
}

function assertVisualAnchorSlideSurface() {
  const modulePath = path.join(ROOT, "scripts", "pptx", "hw_visual_anchor_slide.js");
  assert.equal(fs.existsSync(modulePath), true, "scripts/pptx/hw_visual_anchor_slide.js should define the content-slide entrypoint");
  const visualSlide = require("../pptx/hw_visual_anchor_slide");
  assert.deepStrictEqual(Object.keys(visualSlide).sort(), expectedContentSlideExports);
}

function assertContentSlideRecordsFixedOutputEvidence() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide, writeVisualAnchorManifest } = require("../pptx/hw_visual_anchor_slide");
  const pptx = createHuaweiDeck({ title: "visual output contract" });
  addVisualAnchorContentSlide(pptx, {
    title: "视觉锚点证据",
    sections: ["测试"],
    currentSection: "测试",
    summary: { body: [{ label: "证据留痕", text: "图片型视觉锚点应记录实际输出证据。" }] },
    contentLayout: biasedContentLayout(imageVisualSpec, [
      { role: "text", title: "证据说明", body: "图片型视觉锚点应记录实际输出证据。" },
    ]),
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_output_manifest.json"));
  assert.equal(manifest.slides[0].renderer, "rough_svg", "image-based content-slide output should be recorded in the manifest");
  assert.equal(manifest.slides[0].image_format, "svg", "image-based content-slide output should record its image format");
}

function assertContentSlideUsesProportionalImagePlacement() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide, writeVisualAnchorManifest } = require("../pptx/hw_visual_anchor_slide");
  const pptx = createHuaweiDeck({ title: "image placement contract" });
  addVisualAnchorContentSlide(pptx, {
    title: "图片等比缩放",
    sections: ["测试"],
    currentSection: "测试",
    summary: { body: [{ label: "等比", text: "SVG 图片只能 contain 等比放入区域，不能拉伸填满。" }] },
    contentLayout: biasedContentLayout({
      ...imageVisualSpec,
      id: "proportional_image",
      visual_spec: {
        y_label: "趋势",
        categories: ["较宽图", "保持比例", "留白允许"],
        series: [
          { name: "等比", values: [1, 2, 3] },
        ],
        highlight: { category: "保持比例", series: "等比" },
      },
    }, [
      { role: "text", title: "缩放原则", body: "图片只能 contain 等比放入正文布局给定的视觉区域。" },
    ]),
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_image_placement_manifest.json"));

  const slide = manifest.slides[0];
  assert(slide.image_area, "image-based manifest should record the actual image placement area");
  assert(slide.image_area.w <= slide.visual_slot.w && slide.image_area.h <= slide.visual_slot.h, "image placement should stay inside the visual slot");
  assert(
    Math.abs((slide.image_area.w / slide.image_area.h) - (slide.image_width / slide.image_height)) < 0.01,
    "image placement should preserve the image aspect ratio"
  );
}

function assertContentSlideRendersEditableCaptionOutsideVisualSpec() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide, writeVisualAnchorManifest } = require("../pptx/hw_visual_anchor_slide");
  const pptx = createHuaweiDeck({ title: "caption contract" });
  addVisualAnchorContentSlide(pptx, {
    title: "图注渲染",
    sections: ["测试"],
    currentSection: "测试",
    summary: { body: [{ label: "可编辑", text: "视觉锚点描述必须在 PPT 文本层。" }] },
    contentLayout: biasedContentLayout({
      ...imageVisualSpec,
      id: "caption_outside_visual_spec",
    }, [
      { role: "text", title: "解读", body: ["侧边模块用于形成图文并茂阅读路径。"] },
    ], {
      visual_anchor_caption: {
        text: "图 1：流程视觉锚点只保留步骤结构，图注为可编辑 PPT 文本。",
        source: "说明：图注不属于图形规格。",
      },
    }),
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_caption_manifest.json"));

  const slide = manifest.slides[0];
  assert(slide.visual_anchor_caption, "manifest should record PPT-layer visual anchor caption placement");
  assert.equal(slide.resolved_layout_type, "biased_column", "manifest should record the resolved content layout family");
  assert.equal(slide.content_layout_schema.reference, "06 内容 偏分栏", "manifest should record the derived reference template");
  assert.equal(slide.content_layout_schema.modules_count, 2, "manifest should record contentLayout side modules");
  assert.equal(slide.visual_anchor_caption.text, "图 1：流程视觉锚点只保留步骤结构，图注为可编辑 PPT 文本。");
  assert(!slide.visual_anchor.visual_spec.caption, "caption must stay outside visual_spec");
  assert(!slide.visual_anchor.visual_spec.figure_legend, "figure legend must stay outside visual_spec");
  assert(slide.visual_area.h < slide.visual_slot.h, "caption should reserve space below the visual anchor");
  assert(slide.visual_anchor_caption.area.y >= slide.image_area.y + slide.image_area.h - 0.01, "caption should sit below the rendered image area");
}

function assertContentLayoutAutoResolvesTallEvidenceSideText() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide, writeVisualAnchorManifest } = require("../pptx/hw_visual_anchor_slide");
  const sourcePath = writeSourceSvg(".tmp/visual_anchor_contract/tall_source.svg", 360, 1100, "tall");
  const pptx = createHuaweiDeck({ title: "auto flow contract" });
  addVisualAnchorContentSlide(pptx, {
    title: "瘦高证据自适应",
    sections: ["测试"],
    currentSection: "测试",
    summary: { body: [{ label: "自适应", text: "模型不给 flow，渲染器根据源图比例选择左右结构。" }] },
    contentLayout: {
      type: "two_column",
      reference: "05 内容 二分栏",
      modules: [
        {
          role: "content_panel",
          title: "瘦高图",
          blocks: [
            { type: "visual_anchor", visual_anchor: evidenceSourceAnchor("auto_tall_evidence", sourcePath) },
            { type: "text", body: ["瘦高源图不应强行上图下文。", "解释文字应自动放到图的右侧。"], fontSize: 10 },
          ],
        },
        {
          role: "content_panel",
          title: "说明",
          blocks: [{ type: "text", body: "另一个模块用于保持二分栏结构完整。" }],
        },
      ],
    },
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_auto_flow_manifest.json"));
  const moduleLayout = manifest.slides[0].content_layout_schema.module_layouts[0];
  assert.equal(moduleLayout.resolved_flow, "left_right", "tall source evidence plus text should auto-resolve to side-by-side layout");
  assert(moduleLayout.block_areas[0].area.x < moduleLayout.block_areas[1].area.x, "visual block should be placed to the left of its text block");
  assert(Math.abs(moduleLayout.block_areas[0].visible_area.y - moduleLayout.block_areas[0].area.y) < 0.001, "source evidence should be top-aligned inside its visual block");
  assert(moduleLayout.block_areas[0].measure?.min_size?.h > 0, "tall source evidence should be measured through the COM primitive path");
}

function assertSupportingDataCardsKeepReadableHeightWithEvidenceAndText() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide, writeVisualAnchorManifest } = require("../pptx/hw_visual_anchor_slide");
  const sourcePath = writeSourceSvg(".tmp/visual_anchor_contract/wide_source.svg", 670, 273, "wide evidence");
  const pptx = createHuaweiDeck({ title: "data card height contract" });
  addVisualAnchorContentSlide(pptx, {
    title: "证据图 + KPI + 正文",
    sections: ["测试"],
    currentSection: "测试",
    summary: { body: [{ label: "拥挤", text: "同一模块内有证据图、KPI 卡和正文时，KPI 卡不能被压成小框。" }] },
    contentLayout: {
      type: "two_column",
      reference: "05 内容 二分栏",
      modules: [
        {
          role: "content_panel",
          title: "算法：验证与预草稿重叠",
          blocks: [
            { type: "visual_anchor", visual_anchor: evidenceSourceAnchor("wide_evidence_with_cards", sourcePath) },
            {
              type: "supporting_component",
              component: {
                id: "readable_data_cards_with_evidence",
                title: "三段 token 读数",
                claim: "KPI 卡在证据图和正文之间仍应保持可读高度。",
                kind: "Quantity",
                template: "data_cards",
                visual_spec: {
                  cards: [
                    { id: "prefix", label: "prefix", value: "确认" },
                    { id: "prev", label: "draft", value: "验证" },
                    { id: "mask", label: "mask", value: "预草稿" },
                  ],
                  highlight: "mask",
                },
                highlight_reason: "高亮预草稿，因为它承载下一批 proposal 的准备。",
              },
            },
            {
              type: "text",
              body: [
                "TiDAR用三段token组织和混合attention mask，在单forward内并行完成验证与预草稿",
                "机制变化：本步接受多少 token，都有对应下一批 proposal。",
                "收益入口：one-step diffusion 把草稿计算压进当前 forward。",
              ],
              emphasis: ["单forward", "对应下一批", "当前 forward"],
              fontSize: 10,
            },
          ],
        },
        {
          role: "content_panel",
          title: "辅助模块",
          blocks: [{ type: "text", body: "保持二分栏结构完整。" }],
        },
      ],
    },
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_data_card_height_manifest.json"));
  const moduleLayout = manifest.slides[0].content_layout_schema.module_layouts[0];
  const cardBlock = moduleLayout.block_areas.find((block) => block.template === "data_cards");
  const evidenceBlock = moduleLayout.block_areas.find((block) => block.kind === "Evidence");
  const textBlock = moduleLayout.block_areas.find((block) => block.type === "text");
  assert(cardBlock, "supporting data_cards block should be recorded in layout metrics");
  assert(evidenceBlock, "evidence block should be recorded in layout metrics");
  assert(textBlock, "text block should be recorded in layout metrics");
  assert(cardBlock.area.h >= 0.78, "data_cards should keep a readable minimum height instead of shrinking into a tiny strip");
  assert(cardBlock.measure?.min_size?.h > 0, "data_cards layout height should be backed by COM primitive measurement");
  assert(cardBlock.area.h >= cardBlock.measure.min_size.h * 0.88, "data_cards layout height should track the measured text/card height");
  assert(evidenceBlock.area.h >= 1.45, "evidence should remain readable after preserving KPI card height");
}

function assertTwoAndThreeColumnLayoutsSuppressVisualCaptions() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide, writeVisualAnchorManifest } = require("../pptx/hw_visual_anchor_slide");
  const pptx = createHuaweiDeck({ title: "column caption contract" });
  addVisualAnchorContentSlide(pptx, {
    title: "二分栏图注规则",
    sections: ["测试"],
    currentSection: "测试",
    summary: { body: [{ label: "密度", text: "二分栏和三分栏把空间优先留给图本体。" }] },
    contentLayout: {
      type: "two_column",
      reference: "05 内容 二分栏",
      modules: [
        {
          role: "content_panel",
          title: "主证据",
          blocks: [{
            type: "visual_anchor",
            visual_anchor: { ...imageVisualSpec, id: "two_column_caption_suppressed" },
            visual_anchor_caption: {
              text: "这段图题在二分栏中不应渲染。",
              source: "这段来源在二分栏中不应渲染。",
            },
          }],
        },
        {
          role: "content_panel",
          title: "解读",
          blocks: [{ type: "text", body: "解释文字承接图中证据。" }],
        },
      ],
    },
    page: "01",
  });
  addVisualAnchorContentSlide(pptx, {
    title: "三分栏图注规则",
    sections: ["测试"],
    currentSection: "测试",
    summary: { body: [{ label: "密度", text: "三分栏同样不为图题和来源预留额外高度。" }] },
    contentLayout: {
      type: "three_column",
      reference: "07 内容 三分栏",
      modules: [
        {
          role: "content_panel",
          title: "证据一",
          blocks: [{
            type: "visual_anchor",
            visual_anchor: { ...imageVisualSpec, id: "three_column_caption_suppressed" },
            visual_anchor_caption: "这段图题在三分栏中不应渲染。",
          }],
        },
        {
          role: "content_panel",
          title: "证据二",
          blocks: [{
            type: "visual_anchor",
            visual_anchor: {
              id: "three_column_matrix_caption_suppressed",
              title: "Matrix Visual",
              claim: "非 Evidence 的视觉锚点也不应在三分栏渲染图注。",
              kind: "Matrix",
              template: "table",
              visual_spec: {
                rows: [
                  ["指标", "判断"],
                  ["密度", "优先给图"],
                  ["来源", "放入正文"],
                ],
              },
            },
            visual_anchor_caption: {
              text: "这段 Matrix 图题在三分栏中不应渲染。",
              source: "这段 Matrix 来源在三分栏中不应渲染。",
            },
          }],
        },
        { role: "content_panel", title: "证据三", blocks: [{ type: "text", body: "第三栏文字。" }] },
      ],
    },
    page: "02",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_column_caption_manifest.json"));

  for (const slide of manifest.slides) {
    assert(!slide.visual_anchor_caption, `${slide.resolved_layout_type} should not render module visual captions`);
    assert.equal(slide.visual_area.h, slide.visual_slot.h, `${slide.resolved_layout_type} should not reserve caption height`);
  }
}

function assertTableBlocksAreRejectedByBehavior() {
  const helpers = require("../pptx/hw_pptx_helpers");
  const { createHuaweiDeck } = helpers;
  const { addVisualAnchorContentSlide } = require("../pptx/hw_visual_anchor_slide");
  assert.equal(Object.prototype.hasOwnProperty.call(helpers, "addHuaweiTable"), false, "addHuaweiTable must not be exported as a page-level helper");
  assert.throws(() => addVisualAnchorContentSlide(createHuaweiDeck(), {
    title: "非法表格块",
    contentLayout: {
      type: "two_column",
      reference: "05 内容 二分栏",
      modules: [
        { role: "content_panel", title: "证据", blocks: [{ type: "visual_anchor", visual_anchor: imageVisualSpec }] },
        { role: "content_panel", title: "错误表格", blocks: [{ type: "table", body: [["A", "B"]] }] },
      ],
    },
  }), /table blocks were removed/, "contentLayout should reject direct table blocks");
}

function assertSupportingOnlyLayoutFails() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide } = require("../pptx/hw_visual_anchor_slide");
  assert.throws(() => addVisualAnchorContentSlide(createHuaweiDeck(), {
    title: "支撑组件不能当锚点",
    contentLayout: {
      type: "two_column",
      reference: "05 内容 二分栏",
      modules: [
        {
          role: "content_panel",
          title: "只有卡片",
          blocks: [{
            type: "supporting_component",
            component: {
              id: "supporting_only_cards",
              title: "只有数据卡",
              claim: "数据卡不能满足视觉锚点要求。",
              kind: "Quantity",
              template: "data_cards",
              visual_spec: { cards: [{ label: "A", value: "1" }] },
            },
          }],
        },
        { role: "content_panel", title: "说明", blocks: [{ type: "text", body: "没有真实视觉锚点。" }] },
      ],
    },
  }), /real visual_anchor block/, "supporting components must not satisfy the real visual-anchor requirement");
}

function assertContentLayoutDoesNotExposeManualBodyLayout() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide } = require("../pptx/hw_visual_anchor_slide");
  assert.throws(() => addVisualAnchorContentSlide(createHuaweiDeck(), {
    title: "缺少语义锚点",
    contentLayout: {
      type: "two_column",
      reference: "05 内容 二分栏",
      modules: [
        { role: "content_panel", title: "模块一", blocks: [{ type: "text", body: "正文模块必须提供真实视觉锚点。" }] },
        { role: "content_panel", title: "模块二", blocks: [{ type: "text", body: "固定版心由渲染器决定。" }] },
      ],
    },
  }), /real visual_anchor block/, "contentLayout should require semantic body modules instead of honoring page-region coordinates");
}

function assertPackageScriptsRunContractBeforeSmoke() {
  const pkg = JSON.parse(read("package.json"));
  const softwareReport = read("scripts/quality/software_test_report.js");
  assert.equal(pkg.scripts["test:visual-anchor-contract"], "node scripts/smoke/test_visual_anchor_content_contract.js");
  assert(pkg.scripts.smoke.includes("scripts/quality/software_test_report.js"), "npm run smoke should generate the software test report");
  assert(softwareReport.includes("scripts/smoke/test_visual_anchor_content_contract.js"), "software test report should include visual-anchor contract tests");
}

function main() {
  const failures = [];
  collect("visual-anchor content-slide surface exists", assertVisualAnchorSlideSurface, failures);
  collect("content-slide entrypoint records fixed output evidence", assertContentSlideRecordsFixedOutputEvidence, failures);
  collect("content-slide images preserve aspect ratio", assertContentSlideUsesProportionalImagePlacement, failures);
  collect("content layout auto-resolves tall evidence side text", assertContentLayoutAutoResolvesTallEvidenceSideText, failures);
  collect("supporting data cards keep readable height with evidence and text", assertSupportingDataCardsKeepReadableHeightWithEvidenceAndText, failures);
  collect("content-slide captions stay outside visual_spec", assertContentSlideRendersEditableCaptionOutsideVisualSpec, failures);
  collect("dense column layouts suppress visual captions", assertTwoAndThreeColumnLayoutsSuppressVisualCaptions, failures);
  collect("native table helper is not a public schema escape hatch", assertTableBlocksAreRejectedByBehavior, failures);
  collect("supporting-only layouts fail", assertSupportingOnlyLayoutFails, failures);
  collect("content layout does not expose manual body layout", assertContentLayoutDoesNotExposeManualBodyLayout, failures);
  collect("package scripts wire the contract into smoke", assertPackageScriptsRunContractBeforeSmoke, failures);

  if (failures.length) {
    console.error(`visual anchor content contract failed: ${failures.length} issue(s)`);
    failures.forEach((failure, idx) => {
      console.error(`\n${idx + 1}. ${failure.testName}`);
      console.error(failure.error.stack || failure.error.message || failure.error);
    });
    process.exit(1);
  }

  console.log("visual anchor content contract tests passed");
}

main();
