const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

const expectedPagePrimitiveExports = [
  "HW_STYLE",
  "addAnalysisSummary",
  "addCoverSlide",
  "addFooter",
  "addPageTitle",
  "addSectionTabs",
  "addTocSlide",
  "cloneOptions",
  "createHuaweiDeck",
  "ensureTmpPath",
  "estimateTextBoxHeight",
  "estimateTextUnits",
  "estimateTextWidth",
  "estimateWrappedLines",
  "grayCard",
  "redTitleCard",
  "repairPptxForPowerPointCom",
  "safeText",
  "stripHash",
  "textBox",
].sort();

const expectedContentSlideExports = [
  "addEvidenceModule",
  "addSupportingCards",
  "addVisualAnchorContentSlide",
  "writeVisualAnchorManifest",
].sort();

const requiredDiagramExports = [
  "validateVisualAnchorSpec",
  "resolveVisualAnchorRenderPath",
  "renderVisualAnchorPptNative",
  "renderVisualAnchorRoughSvg",
  "createVisualAnchorSvg",
  "writeVisualAnchorSvg",
];

const expectedVisualAnchorQaRules = [
  "content_visual_anchor_manifest_missing",
  "content_visual_anchor_manifest_invalid",
  "content_visual_anchor_missing",
  "content_visual_anchor_unrendered",
  "content_visual_anchor_template_invalid",
  "content_visual_anchor_image_missing",
  "content_visual_anchor_image_invalid",
  "content_visual_anchor_image_too_small",
  "content_visual_anchor_highlight_unexplained",
  "content_visual_anchor_subjective_scores",
  "content_visual_anchor_plan_mismatch",
  "content_visual_anchor_layout_unintegrated",
  "content_visual_anchor_manifest_mismatch",
  "content_visual_anchor_table_contract_mismatch",
  "content_visual_anchor_table_overflow",
  "content_layout_schema_invalid",
  "content_layout_schema_anchor_missing",
  "content_layout_module_alignment",
  "content_layout_module_inner_alignment",
  "content_layout_block_gap",
  "content_layout_text_frame_mismatch",
  "content_layout_visual_frame_gap",
];

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

function assertPagePrimitiveSurface() {
  const helpers = require("../pptx/hw_pptx_helpers");
  assert.deepStrictEqual(Object.keys(helpers).sort(), expectedPagePrimitiveExports);
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
    visual_anchor: imageVisualSpec,
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
    anchorArea: { x: 1.0, y: 1.65, w: 10.0, h: 2.1 },
    visual_anchor: {
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
    },
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_image_placement_manifest.json"));

  const slide = manifest.slides[0];
  assert(slide.image_area, "image-based manifest should record the actual image placement area");
  assert(slide.image_area.w <= slide.anchor_area.w && slide.image_area.h <= slide.anchor_area.h, "image placement should stay inside the anchor area");
  assert(
    Math.abs((slide.image_area.w / slide.image_area.h) - (slide.image_width / slide.image_height)) < 0.01,
    "image placement should preserve the image aspect ratio"
  );
  assert(
    Math.abs((slide.image_area.w / slide.image_area.h) - (slide.anchor_area.w / slide.anchor_area.h)) > 0.1,
    "test fixture should prove image placement is not stretched to the anchor area aspect ratio"
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
    anchorArea: { x: 1.0, y: 1.65, w: 10.0, h: 2.6 },
    visualAnchorCaption: {
      text: "图 1：流程视觉锚点只保留步骤结构，图注为可编辑 PPT 文本。",
      source: "说明：图注不属于图形规格。",
    },
    supportingCards: [
      { title: "解读", body: ["侧边卡用于形成图文并茂阅读路径。"] },
    ],
    visual_anchor: {
      ...imageVisualSpec,
      id: "caption_outside_visual_spec",
    },
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_caption_manifest.json"));

  const slide = manifest.slides[0];
  assert(slide.visual_anchor_caption, "manifest should record PPT-layer visual anchor caption placement");
  assert.equal(slide.supporting_cards_count, 1, "manifest should record side interpretation cards for 图文并茂 layouts");
  assert.equal(slide.resolved_layout_type, "biased_column", "manifest should record the resolved content layout family");
  assert.equal(slide.content_layout_schema.reference, "06 内容 偏分栏", "manifest should record the derived reference template");
  assert.equal(slide.visual_anchor_caption.text, "图 1：流程视觉锚点只保留步骤结构，图注为可编辑 PPT 文本。");
  assert(!slide.visual_anchor.visual_spec.caption, "caption must stay outside visual_spec");
  assert(!slide.visual_anchor.visual_spec.figure_legend, "figure legend must stay outside visual_spec");
  assert(slide.visual_area.h < slide.anchor_area.h, "caption should reserve space below the visual anchor");
  assert(slide.visual_anchor_caption.area.y >= slide.visual_area.y + slide.visual_area.h - 0.01, "caption should sit below the rendered visual area");
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
  assert(moduleLayout.block_areas[0].visible_area.x > moduleLayout.block_areas[0].area.x, "tall source evidence should be horizontally centered inside its visual block");
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
            visualAnchorCaption: {
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
            visualAnchorCaption: "这段图题在三分栏中不应渲染。",
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
            visualAnchorCaption: {
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
    assert.equal(slide.visual_area.h, slide.anchor_area.h, `${slide.resolved_layout_type} should not reserve caption height`);
  }
}

function assertDiagramExportsStayAvailable() {
  const diagram = require("../pptx/hw_diagram_helpers");
  for (const name of requiredDiagramExports) {
    assert.equal(typeof diagram[name], "function", `expected visual-anchor helper export: ${name}`);
  }
}

function assertSampleDeckUsesVisualAnchorContentSlides() {
  const sample = read("scripts/smoke/generate_sample_deck.js");
  assert(sample.includes("addVisualAnchorContentSlide"), "sample deck should exercise the visual-anchor content-page entrypoint");
  assert(sample.includes("writeVisualAnchorManifest"), "sample deck should write visual-anchor manifest evidence");
}

function assertHardQaKnowsVisualAnchorContract() {
  const qa = read("scripts/qa/check_huawei_pptx.js");
  for (const rule of expectedVisualAnchorQaRules) {
    assert(qa.includes(rule), `hard QA should emit ${rule}`);
  }
  assert(qa.includes("at least one manifest-backed visual anchor"), "hard QA should allow one or more anchors per content slide");
}

function assertTableHelperIsNotPublicSchemaEscapeHatch() {
  const helpers = require("../pptx/hw_pptx_helpers");
  const contentSlide = read("scripts/pptx/hw_visual_anchor_slide.js");
  assert.equal(Object.prototype.hasOwnProperty.call(helpers, "addHuaweiTable"), false, "addHuaweiTable must not be exported as a page-level helper");
  assert(!contentSlide.includes("role === \"table\""), "contentLayout must not accept role=table as a direct native table path");
  assert(contentSlide.includes("contentLayout table blocks were removed"), "contentLayout table blocks should fail instead of drawing a native table directly");
  assert(contentSlide.includes("kind=Matrix/template=table"), "table block rejection should direct callers to Matrix/table visual anchors");
}

function assertSkillDocumentsCurrentPath() {
  const skill = read("SKILL.md");
  const layoutStandards = read("references/layout_standards.md");
  assert(skill.includes("addVisualAnchorContentSlide"), "SKILL should document the unified content-slide entrypoint");
  assert(skill.includes("--require-visual-anchor-manifest"), "SKILL should require manifest-backed visual-anchor QA");
  assert(skill.includes("--require-plan"), "SKILL should require plan-backed visual-anchor alignment QA");
  assert(layoutStandards.includes("05 内容 二分栏"), "layout standards should document the fixed content-layout references");
  assert(skill.includes("one primary evidence object"), "SKILL should document the primary evidence standard");
  assert(skill.includes("Evidence"), "SKILL should document source-evidence visual anchors");
}

function assertContentLayoutReferenceDocumentsDenseCaptionSuppression() {
  const schema = read("references/content_layout_schema.md");
  assert(schema.includes("two_column"), "content layout reference should document two_column");
  assert(schema.includes("three_column"), "content layout reference should document three_column");
  assert(schema.includes("renderer suppresses module visual captions"), "content layout reference should document dense-column caption suppression");
  assert(schema.includes("Do not provide a `flow` field"), "content layout reference should make module flow renderer-owned");
}

function assertContentLayoutDoesNotExposePageRegionOverride() {
  const contentSlide = read("scripts/pptx/hw_visual_anchor_slide.js");
  const schema = read("references/content_layout_schema.md");
  const skill = read("SKILL.md");
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide } = require("../pptx/hw_visual_anchor_slide");
  assert(!contentSlide.includes("data.contentArea || data.content_area"), "contentLayout must not let deck scripts override the fixed page region");
  assert(contentSlide.includes("rejectContentLayoutPageRegionOverrides"), "contentLayout should fail fast when deck scripts pass page-region coordinates");
  assert(schema.includes("`contentLayout.type` is authoritative"), "content layout reference should describe the positive minimal schema");
  assert(!skill.includes("contentArea"), "SKILL should avoid documenting removed content-layout page-region fields");
  assert.throws(() => addVisualAnchorContentSlide(createHuaweiDeck(), {
    title: "非法版心",
    contentArea: { x: 0, y: 0, w: 1, h: 1 },
    contentLayout: {
      type: "two_column",
      reference: "05 内容 二分栏",
      modules: [
        { role: "content_panel", title: "模块一", blocks: [{ type: "text", body: "旧版心字段应在 schema 解析前失败。" }] },
        { role: "content_panel", title: "模块二", blocks: [{ type: "text", body: "固定版心由渲染器决定。" }] },
      ],
    },
  }), /renderer-owned/, "contentLayout should reject page-region coordinates instead of silently ignoring them");
}

function assertPackageScriptsRunContractBeforeSmoke() {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["test:visual-anchor-contract"], "node scripts/smoke/test_visual_anchor_content_contract.js");
  assert(pkg.scripts.smoke.includes("test:visual-anchor-contract"), "npm run smoke should include visual-anchor contract tests");
  assert(pkg.scripts.smoke.includes("content-layout-smoke"), "npm run smoke should include content layout schema smoke tests");
  assert(pkg.scripts["check-sample"].includes("--require-visual-anchor-manifest"), "sample QA should require visual-anchor manifest evidence");
}

function main() {
  const failures = [];
  collect("page helpers expose the primitive surface", assertPagePrimitiveSurface, failures);
  collect("visual-anchor content-slide surface exists", assertVisualAnchorSlideSurface, failures);
  collect("content-slide entrypoint records fixed output evidence", assertContentSlideRecordsFixedOutputEvidence, failures);
  collect("content-slide images preserve aspect ratio", assertContentSlideUsesProportionalImagePlacement, failures);
  collect("content layout auto-resolves tall evidence side text", assertContentLayoutAutoResolvesTallEvidenceSideText, failures);
  collect("content-slide captions stay outside visual_spec", assertContentSlideRendersEditableCaptionOutsideVisualSpec, failures);
  collect("dense column layouts suppress visual captions", assertTwoAndThreeColumnLayoutsSuppressVisualCaptions, failures);
  collect("diagram helper exports remain available", assertDiagramExportsStayAvailable, failures);
  collect("sample deck uses the visual-anchor path", assertSampleDeckUsesVisualAnchorContentSlides, failures);
  collect("hard QA validates rendered visual anchors", assertHardQaKnowsVisualAnchorContract, failures);
  collect("native table helper is not a public schema escape hatch", assertTableHelperIsNotPublicSchemaEscapeHatch, failures);
  collect("SKILL documents the current path", assertSkillDocumentsCurrentPath, failures);
  collect("content layout reference documents dense caption suppression", assertContentLayoutReferenceDocumentsDenseCaptionSuppression, failures);
  collect("content layout does not expose page-region override", assertContentLayoutDoesNotExposePageRegionOverride, failures);
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
