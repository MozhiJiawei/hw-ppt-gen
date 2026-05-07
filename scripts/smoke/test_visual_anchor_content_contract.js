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
  "content_visual_anchor_highlight_unexplained",
  "content_visual_anchor_subjective_scores",
  "content_visual_anchor_relationship_unproven",
  "content_visual_anchor_plan_reason_missing",
  "content_visual_anchor_plan_mismatch",
  "content_visual_anchor_layout_unintegrated",
  "content_visual_anchor_layout_missing",
  "content_visual_anchor_layout_invalid",
  "content_visual_anchor_renderer_config_missing",
  "content_visual_anchor_renderer_scope_invalid",
  "content_visual_anchor_table_not_native",
  "content_layout_schema_invalid",
  "content_layout_schema_anchor_missing",
];

const roughSvgSpec = {
  id: "contract_default_renderer",
  title: "Default Renderer",
  claim: "默认正文页应使用 rough_svg 图片路径。",
  kind: "Sequence",
  template: "process",
  visual_spec: {
    steps: [
      { id: "plan", label: "计划" },
      { id: "render", label: "渲染" },
    ],
    highlight: "render",
  },
  highlight_reason: "高亮渲染，因为它验证默认路径是否真正生成 SVG。",
};

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

function assertContentSlideHonorsDefaultRenderer() {
  const { createHuaweiDeck } = require("../pptx/hw_pptx_helpers");
  const { addVisualAnchorContentSlide, writeVisualAnchorManifest } = require("../pptx/hw_visual_anchor_slide");
  const pptx = createHuaweiDeck({ title: "renderer contract" });
  addVisualAnchorContentSlide(pptx, {
    title: "默认渲染器",
    sections: ["测试"],
    currentSection: "测试",
    summary: { body: [{ label: "默认路径", text: "未设置环境变量时应走 SVG 图片路径。" }] },
    visual_anchor: roughSvgSpec,
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_renderer_manifest.json"));
  assert.equal(manifest.visual_anchor_renderer, "rough_svg", "manifest should record the deck-level renderer");
  assert.equal(manifest.slides[0].renderer, "rough_svg", "default content-slide renderer should be rough_svg");
  assert.equal(manifest.slides[0].image_format, "svg", "default content-slide renderer should embed SVG image output");
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
      ...roughSvgSpec,
      id: "proportional_image",
      visual_spec: {
        steps: [
          { id: "a", label: "较宽图" },
          { id: "b", label: "保持比例" },
          { id: "c", label: "留白允许" },
        ],
        highlight: "b",
      },
    },
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_image_placement_manifest.json"));

  const slide = manifest.slides[0];
  assert(slide.image_area, "rough_svg manifest should record the actual image placement area");
  assert(slide.image_area.w <= slide.anchor_area.w && slide.image_area.h <= slide.anchor_area.h, "image placement should stay inside the anchor area");
  assert(
    Math.abs((slide.image_area.w / slide.image_area.h) - (slide.image_width / slide.image_height)) < 0.01,
    "image placement should preserve the SVG image aspect ratio"
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
    layoutReference: "06 内容 偏分栏",
    visual_anchor: {
      ...roughSvgSpec,
      id: "caption_outside_visual_spec",
    },
    page: "01",
  });
  const manifest = writeVisualAnchorManifest(pptx, path.join(ROOT, ".tmp", "visual_anchor_contract_caption_manifest.json"));

  const slide = manifest.slides[0];
  assert(slide.visual_anchor_caption, "manifest should record PPT-layer visual anchor caption placement");
  assert.equal(slide.supporting_cards_count, 1, "manifest should record side interpretation cards for 图文并茂 layouts");
  assert.equal(slide.layout_reference, "06 内容 偏分栏", "manifest should record the intended content layout reference");
  assert.equal(slide.visual_anchor_caption.text, "图 1：流程视觉锚点只保留步骤结构，图注为可编辑 PPT 文本。");
  assert(!slide.visual_anchor.visual_spec.caption, "caption must stay outside visual_spec");
  assert(!slide.visual_anchor.visual_spec.figure_legend, "figure legend must stay outside visual_spec");
  assert(slide.visual_area.h < slide.anchor_area.h, "caption should reserve space below the visual anchor");
  assert(slide.visual_anchor_caption.area.y >= slide.visual_area.y + slide.visual_area.h - 0.01, "caption should sit below the rendered visual area");
}

function assertDiagramExportsStayAvailable() {
  const diagram = require("../pptx/hw_diagram_helpers");
  for (const name of requiredDiagramExports) {
    assert.equal(typeof diagram[name], "function", `expected visual-anchor renderer export: ${name}`);
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
  assert(skill.includes("addVisualAnchorContentSlide"), "SKILL should document the unified content-slide entrypoint");
  assert(skill.includes("--require-visual-anchor-manifest"), "SKILL should require manifest-backed visual-anchor QA");
  assert(skill.includes("--require-plan"), "SKILL should require plan-backed visual-anchor alignment QA");
  assert(skill.includes("05 内容 二分栏"), "SKILL should document the fixed content-layout references");
  assert(skill.includes("至少一个"), "SKILL should document that content pages may have one or more visual anchors");
  assert(skill.includes("visual_anchor_renderer"), "SKILL should document deck-level renderer configuration");
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
  collect("content-slide entrypoint honors default renderer", assertContentSlideHonorsDefaultRenderer, failures);
  collect("content-slide SVG images preserve aspect ratio", assertContentSlideUsesProportionalImagePlacement, failures);
  collect("content-slide captions stay outside visual_spec", assertContentSlideRendersEditableCaptionOutsideVisualSpec, failures);
  collect("diagram renderer exports remain available", assertDiagramExportsStayAvailable, failures);
  collect("sample deck uses the visual-anchor path", assertSampleDeckUsesVisualAnchorContentSlides, failures);
  collect("hard QA validates rendered visual anchors", assertHardQaKnowsVisualAnchorContract, failures);
  collect("native table helper is not a public schema escape hatch", assertTableHelperIsNotPublicSchemaEscapeHatch, failures);
  collect("SKILL documents the current path", assertSkillDocumentsCurrentPath, failures);
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
