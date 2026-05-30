"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const {
  parsePptContentBrief,
  recommendContentLayoutForSummary,
  validatePptContentBrief,
} = require("../pptx/parse_ppt_content_brief");

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

function assertValidBriefMapsHardConstraints() {
  const brief = read("scripts/smoke/fixtures/ppt_content_brief_valid.md");
  const parsed = parsePptContentBrief(brief, { expectedPages: 5 });

  assert.equal(parsed.metadata["主题"], "Stochastic KV Routing 价值评估");
  assert.deepStrictEqual(parsed.sections, ["瓶颈来自 KV cache", "弹性来自随机路由"]);

  assert.equal(parsed.summaryPage.pageNumber, 2);
  assert.equal(parsed.summaryPage.title, "Stochastic KV Routing");
  assert.equal(parsed.summaryPage.titleNote, "用随机跨层注意力训练，换取部署期可选的 KV cache 深度共享。");
  assert.deepStrictEqual(parsed.summaryPage.summary.body, [
    { label: "问题", text: "KV cache 随层数和上下文线性扩张，推高推理显存成本。" },
    { label: "机制", text: "R-CLA 训练时随机选择历史层 KV，部署时固定共享策略。" },
    { label: "判断", text: "适合先在长上下文、显存受限场景做受控评估。" },
  ]);

  assert.equal(parsed.slideContract.toc.length, 2);
  assert.equal(parsed.slideContract.contentSlides.length, 2);
  assert.equal(parsed.slideContract.contentSlides[0].title, "KV Cache 瓶颈");
  assert.equal(parsed.slideContract.contentSlides[0].titleNote, "每层 KV state 放大长上下文显存占用，压缩 batch 和 context 空间。");
  assert.deepStrictEqual(parsed.slideContract.contentSlides[0].summary.body, [
    { label: "显存压力", text: "KV cache 随层数、序列长度和 batch 线性扩张。" },
    { label: "成本边界", text: "缓存 footprint 会限制并发容量和长上下文服务。" },
  ]);
  assert.deepStrictEqual(parsed.slideContract.contentSlides[0].contentLayoutRecommendation, {
    type: "two_column",
    reference: "05 内容 二分栏",
    viewpointCount: 2,
  });
  assert.deepStrictEqual(parsed.slideContract.contentSlides[0].sections, parsed.sections);
  assert.equal(parsed.slideContract.contentSlides[0].currentSection, "瓶颈来自 KV cache");
  assert.deepStrictEqual(parsed.planContract.slides.map((slide) => ({
    page: slide.page,
    role: slide.role,
    title: slide.title,
    titleNote: slide.titleNote,
    currentSection: slide.currentSection || "",
    contentLayoutType: slide.contentLayout.type,
  })), [
    {
      page: 2,
      role: "summary",
      title: "Stochastic KV Routing",
      titleNote: "用随机跨层注意力训练，换取部署期可选的 KV cache 深度共享。",
      currentSection: "",
      contentLayoutType: "three_column",
    },
    {
      page: 4,
      role: "content",
      title: "KV Cache 瓶颈",
      titleNote: "每层 KV state 放大长上下文显存占用，压缩 batch 和 context 空间。",
      currentSection: "瓶颈来自 KV cache",
      contentLayoutType: "two_column",
    },
    {
      page: 5,
      role: "content",
      title: "R-CLA 机制",
      titleNote: "训练期随机跨层注意力，让部署期固定 cache sharing 不再脆弱。",
      currentSection: "弹性来自随机路由",
      contentLayoutType: "two_column",
    },
  ]);
}

function assertSummaryOnlyBriefDoesNotRequireToc() {
  const brief = `# PPT Content Brief

## Deck Metadata
主题：一页总结
目标读者：技术负责人
页数口径：1 total PPT pages
核心结论：只生成一页总结。
内容来源：测试材料
关联审计文件：research_audit.md

## Summary Page
页码：Page 1
页面标题：一页总结
标题说明：只保留总结页时不需要目录和正文内容页。
分析总结：
- 判断：一页模式只消费 Summary Page。
正文内容：
- 判断：一页模式只消费 Summary Page，并用正文补足页面材料。
参考图片：
- 可重绘为简洁流程图。
`;
  const errors = validatePptContentBrief(brief, { expectedPages: 1 });
  assert.deepStrictEqual(errors, []);
  const parsed = parsePptContentBrief(brief, { expectedPages: 1 });
  assert.equal(parsed.sections.length, 0);
  assert.equal(parsed.contentPages.length, 0);
  assert.equal(parsed.summaryPage.pageNumber, 1);
  assert.deepStrictEqual(parsed.summaryPage.contentLayoutRecommendation, {
    type: "biased_column",
    reference: "06 内容 偏分栏",
    viewpointCount: 1,
  });
}

function assertAbsolutePathsAreAcceptedAsBriefSourceLocators() {
  const brief = `# PPT Content Brief

## Deck Metadata
主题：一页总结
目标读者：技术负责人
页数口径：1 total PPT pages
核心结论：用源图支撑一页总结。
内容来源：测试材料
关联审计文件：research_audit.md

## Summary Page
页码：Page 1
页面标题：一页总结
标题说明：参考图片可以用 Markdown 图片链接绑定源图文件。
分析总结：
- 判断：正文依赖源图说明。
正文内容：
- 判断：Figure 1 说明了关键趋势，源图位于 D:\\Agent Repo\\paper pack\\final\\images\\picture_001.png，因此下游应优先把这张源图作为论文插图使用。
参考图片：
- ![Figure 1: 关键趋势](<D:\\Agent Repo\\paper pack\\final\\images\\picture_001.png>)
- Figure 1 说明了关键趋势。
`;
  assert.deepStrictEqual(validatePptContentBrief(brief, { expectedPages: 1 }), []);
  const parsed = parsePptContentBrief(brief, { expectedPages: 1 });
  assert(parsed.summaryPage.bodyContent[0].includes("D:\\Agent Repo\\paper pack\\final\\images\\picture_001.png"));
  assert(parsed.summaryPage.referenceImages[0].includes("D:\\Agent Repo\\paper pack\\final\\images\\picture_001.png"));

  const plainReferencePathBrief = brief.replace(
    "- ![Figure 1: 关键趋势](<D:\\Agent Repo\\paper pack\\final\\images\\picture_001.png>)",
    "- Figure 1: D:\\Agent Repo\\paper pack\\final\\images\\picture_001.png"
  );
  assert.deepStrictEqual(validatePptContentBrief(plainReferencePathBrief, { expectedPages: 1 }), []);
}

function assertInvalidBriefFailsContract() {
  const brief = read("scripts/smoke/fixtures/ppt_content_brief_invalid.md");
  const errors = validatePptContentBrief(brief, { expectedPages: 4 });

  assert(errors.some((error) => error.includes("正文内容 must explicitly support 分析总结 label '结论'")), "should require body support for every analysis label");
  assert(errors.some((error) => error.includes("所属章节 must match")), "should reject chapter names outside the TOC");
  assert(errors.some((error) => error.includes("Banned internal/layout token found")), "should reject audit/layout tokens");
  assert(!errors.some((error) => error.includes("Absolute local paths")), "should not reject local absolute paths");
}

function assertIssueContractIsDocumentedInSkillAndReferences() {
  const skill = read("SKILL.md");
  const reference = read("references/brief_contract.md");
  const pkg = JSON.parse(read("package.json"));
  const softwareReport = read("scripts/quality/software_test_report.js");

  assert(skill.includes("ppt_content_brief.md"), "SKILL should document the optional ppt_content_brief input branch");
  assert(skill.includes("parse_ppt_content_brief.js"), "SKILL should require the parser before generation");
  assert(reference.includes("Hard Fields"), "reference should separate hard constraints from reference-only fields");
  assert(skill.includes("Source evidence is TOP1"), "SKILL should state the evidence-first principle");
  assert(reference.includes("`参考图片`: source evidence"), "reference should state the evidence-first principle");
  assert(reference.includes("Layout Family"), "reference should document summary-count-driven content layout");
  assert(reference.includes("source locators"), "reference should document absolute paths as source locators");
  assert(reference.includes("research_audit.md"), "reference should document audit file as verification-only");
  assert(pkg.scripts.smoke.includes("scripts/quality/software_test_report.js"), "npm run smoke should generate the software test report");
  assert(softwareReport.includes("scripts/smoke/test_ppt_content_brief_consumption.js"), "software test report should cover content brief parsing");
}

function assertSummaryCountRecommendsContentLayout() {
  assert.deepStrictEqual(recommendContentLayoutForSummary({ body: [{ label: "一", text: "一个观点" }] }), {
    type: "biased_column",
    reference: "06 内容 偏分栏",
    viewpointCount: 1,
  });
  assert.deepStrictEqual(recommendContentLayoutForSummary({ body: [{ label: "一", text: "一个观点" }, { label: "二", text: "两个观点" }] }), {
    type: "two_column",
    reference: "05 内容 二分栏",
    viewpointCount: 2,
  });
  assert.deepStrictEqual(recommendContentLayoutForSummary({ body: [{ label: "一", text: "一个观点" }, { label: "二", text: "两个观点" }, { label: "三", text: "三个观点" }] }), {
    type: "three_column",
    reference: "07 内容 三分栏",
    viewpointCount: 3,
  });
}

function main() {
  const failures = [];
  collect("valid brief maps hard constraints into slide contract", assertValidBriefMapsHardConstraints, failures);
  collect("summary-only brief does not require TOC or Page Content", assertSummaryOnlyBriefDoesNotRequireToc, failures);
  collect("absolute paths are accepted as brief source locators", assertAbsolutePathsAreAcceptedAsBriefSourceLocators, failures);
  collect("invalid brief fails field, chapter, path, and banned-token checks", assertInvalidBriefFailsContract, failures);
  collect("runtime docs and smoke wiring mention the content brief contract", assertIssueContractIsDocumentedInSkillAndReferences, failures);
  collect("analysis summary count recommends matching content layout", assertSummaryCountRecommendsContentLayout, failures);

  if (failures.length) {
    console.error(`ppt content brief consumption tests failed: ${failures.length} issue(s)`);
    failures.forEach((failure, index) => {
      console.error(`\n${index + 1}. ${failure.testName}`);
      console.error(failure.error.stack || failure.error.message || failure.error);
    });
    process.exit(1);
  }
  console.log("ppt content brief consumption tests passed");
}

main();
