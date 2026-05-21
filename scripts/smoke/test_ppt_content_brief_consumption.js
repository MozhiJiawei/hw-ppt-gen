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

  assert.equal(parsed.metadata["主题"], "GPU Pooling 价值评估");
  assert.deepStrictEqual(parsed.sections, ["浪费来自市场形态", "突破在 token 粒度"]);

  assert.equal(parsed.summaryPage.pageNumber, 2);
  assert.equal(parsed.summaryPage.title, "GPU Pooling");
  assert.equal(parsed.summaryPage.titleNote, "面向模型市场长尾与突发并发，用 token 级共享降低保守预留。");
  assert.deepStrictEqual(parsed.summaryPage.summary.body, [
    { label: "场景", text: "长尾模型低频调用会放大固定 GPU 占用。" },
    { label: "机制", text: "token 间隙抢占换模比 request 结束后释放更细。" },
    { label: "判断", text: "适合多模型市场先做受控评估，而不是替代所有服务。" },
  ]);

  assert.equal(parsed.slideContract.toc.length, 2);
  assert.equal(parsed.slideContract.contentSlides.length, 2);
  assert.equal(parsed.slideContract.contentSlides[0].title, "市场型浪费");
  assert.equal(parsed.slideContract.contentSlides[0].titleNote, "长尾模型低频请求与热门模型 burst 共同推高 GPU 冗余预留。");
  assert.deepStrictEqual(parsed.slideContract.contentSlides[0].summary.body, [
    { label: "长尾错配", text: "低频模型需要保留服务能力，闲置成本被系统性放大。" },
    { label: "突发冗余", text: "热门模型峰值超过保守容量时，平台必须维持安全垫。" },
  ]);
  assert.deepStrictEqual(parsed.slideContract.contentSlides[0].contentLayoutRecommendation, {
    type: "two_column",
    reference: "05 内容 二分栏",
    viewpointCount: 2,
  });
  assert.deepStrictEqual(parsed.slideContract.contentSlides[0].sections, parsed.sections);
  assert.equal(parsed.slideContract.contentSlides[0].currentSection, "浪费来自市场形态");
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
      title: "GPU Pooling",
      titleNote: "面向模型市场长尾与突发并发，用 token 级共享降低保守预留。",
      currentSection: "",
      contentLayoutType: "three_column",
    },
    {
      page: 4,
      role: "content",
      title: "市场型浪费",
      titleNote: "长尾模型低频请求与热门模型 burst 共同推高 GPU 冗余预留。",
      currentSection: "浪费来自市场形态",
      contentLayoutType: "two_column",
    },
    {
      page: 5,
      role: "content",
      title: "Token-Level 破局",
      titleNote: "Aegaeon 在 token 间隙抢占换模，降低 request-level 等待带来的 SLO 风险。",
      currentSection: "突破在 token 粒度",
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

  assert(skill.includes("ppt_content_brief.md"), "SKILL should document the optional ppt_content_brief input branch");
  assert(skill.includes("parse_ppt_content_brief.js"), "SKILL should require the parser before generation");
  assert(reference.includes("Hard Fields"), "reference should separate hard constraints from reference-only fields");
  assert(skill.includes("Source evidence is TOP1"), "SKILL should state the evidence-first principle");
  assert(reference.includes("`参考图片`: source evidence"), "reference should state the evidence-first principle");
  assert(reference.includes("Layout Family"), "reference should document summary-count-driven content layout");
  assert(reference.includes("source locators"), "reference should document absolute paths as source locators");
  assert(reference.includes("research_audit.md"), "reference should document audit file as verification-only");
  assert(pkg.scripts.smoke.includes("test:ppt-content-brief"), "npm run smoke should cover content brief parsing");
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
