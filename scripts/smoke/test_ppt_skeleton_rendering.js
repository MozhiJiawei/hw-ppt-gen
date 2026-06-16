"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "ppt_skeleton_smoke");
const BRIEF_PLAN_OUT = path.join(OUT_DIR, "brief_skeleton_plan.json");
const BRIEF_PPTX_OUT = path.join(OUT_DIR, "brief_skeleton.pptx");
const PLAN_PPTX_OUT = path.join(OUT_DIR, "plan_skeleton.pptx");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

async function collect(testName, fn, failures) {
  try {
    await fn();
  } catch (error) {
    failures.push({ testName, error });
  }
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

async function extractPptxText(fileName) {
  const zip = await JSZip.loadAsync(fs.readFileSync(fileName));
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));

  const slides = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    const text = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXmlText(match[1]))
      .join("");
    slides.push(text);
  }
  return {
    slideCount: slideNames.length,
    allText: slides.join("\n"),
    slides,
  };
}

async function writeSkeletonDeck(plan, outFile) {
  const {
    renderHuaweiPptSkeleton,
  } = require("../pptx/hw_ppt_skeleton");
  const {
    repairPptxForPowerPointCom,
  } = require("../pptx/hw_pptx_helpers");

  const pptx = renderHuaweiPptSkeleton(plan);
  assert(!Array.isArray(pptx._hwBodyPipelinePages) || pptx._hwBodyPipelinePages.length === 0, "skeleton rendering must not create body pipeline records");
  await pptx.writeFile({ fileName: outFile });
  await repairPptxForPowerPointCom(outFile);
}

function assertDeckHelperCallsVisualAnchorEntrypoint() {
  const skeletonPath = require.resolve("../pptx/hw_ppt_skeleton");
  const visualPath = require.resolve("../pptx/hw_visual_anchor_slide");
  delete require.cache[skeletonPath];

  const visualSlide = require("../pptx/hw_visual_anchor_slide");
  const original = visualSlide.addVisualAnchorContentSlide;
  let callCount = 0;
  visualSlide.addVisualAnchorContentSlide = function patchedAddVisualAnchorContentSlide(...args) {
    callCount += 1;
    return original.apply(this, args);
  };

  try {
    const { renderHuaweiPptSkeleton } = require("../pptx/hw_ppt_skeleton");
    renderHuaweiPptSkeleton({
      cover: { title: "入口验证" },
      sections: ["章节"],
      slides: [
        {
          page: 2,
          title: "入口页一",
          currentSection: "章节",
          summary: { body: [{ label: "入口", text: "必须走统一正文页入口。" }] },
        },
        {
          page: 4,
          title: "入口页二",
          currentSection: "章节",
          summary: { body: [{ label: "入口", text: "第二页也走统一正文页入口。" }] },
        },
      ],
    }, { includeCover: false, includeToc: false });
  } finally {
    visualSlide.addVisualAnchorContentSlide = original;
    delete require.cache[skeletonPath];
  }

  assert.equal(callCount, 2, "skeleton deck helper must render every page through addVisualAnchorContentSlide");
}

async function assertBriefCanBecomeSkeletonDeck() {
  const {
    buildSkeletonPlanFromBriefText,
  } = require("../pptx/hw_ppt_skeleton");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const plan = buildSkeletonPlanFromBriefText(read("forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/input/ppt_content_brief.md"), {
    expectedPages: 7,
    date: "2026.05.30",
  });
  fs.writeFileSync(BRIEF_PLAN_OUT, JSON.stringify(plan, null, 2), "utf8");
  await writeSkeletonDeck(plan, BRIEF_PPTX_OUT);

  const text = await extractPptxText(BRIEF_PPTX_OUT);
  assert.equal(text.slideCount, 7, "brief-backed skeleton should include cover, toc, summary, and content pages");
  assert(text.allText.includes("Aegaeon 面向模型市场并发 LLM 服务的 GPU Pooling 价值评估"), "cover title should render from brief metadata");
  assert(text.allText.includes("目录 CONTENTS"), "TOC should render");
  assert(text.allText.includes("Aegaeon GPU Pooling"), "summary page title should render");
  assert(text.allText.includes("Token-Level 破局"), "content page title should render");
  assert(text.allText.includes("突破在 token 粒度"), "section tags should render");
  assert(text.allText.includes("分析总结"), "analysis summary band should render");
  assert(text.allText.includes("token 粒度抢占换模"), "analysis summary content should render");
  assert(!text.allText.includes("阅读顺序建议"), "body content below analysis summary must stay blank");
  assert(!text.allText.includes("Figure 5 展示系统路径"), "dynamic body evidence text must not render in the skeleton");
  assert(!text.allText.includes("source_images/figure01_workload.png"), "reference image paths must not render in the skeleton");
  assert(!text.allText.includes("Theorem 3.1"), "deep body content must not render in the skeleton");
}

async function assertPlanFixtureCanBecomeSkeletonDeck() {
  const {
    readSkeletonPlan,
  } = require("../pptx/hw_ppt_skeleton");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const plan = readSkeletonPlan(path.join(ROOT, "scripts", "smoke", "fixtures", "ppt_skeleton_plan.json"));
  await writeSkeletonDeck(plan, PLAN_PPTX_OUT);

  const text = await extractPptxText(PLAN_PPTX_OUT);
  assert.equal(text.slideCount, 4, "plan-backed skeleton should include cover, toc, summary, and content pages");
  assert(text.allText.includes("Aegaeon GPU Pooling"), "plan cover and summary title should render");
  assert(text.allText.includes("Token-level GPU Pooling 价值评估"), "cover subtitle should render");
  assert(text.allText.includes("浪费来自市场形态"), "section tags should render");
  assert(text.allText.includes("H20 需求从 1,192 降至 213"), "analysis summary result should render");
  assert(!text.allText.includes("DYNAMIC_BODY_SENTINEL_AEGAEON_SUMMARY"), "summary body content sentinel must not render");
  assert(!text.allText.includes("DYNAMIC_IMAGE_SENTINEL_AEGAEON_SUMMARY"), "summary image sentinel must not render");
  assert(!text.allText.includes("DYNAMIC_BODY_SENTINEL_MARKET_WASTE"), "content body sentinel must not render");
  assert(!text.allText.includes("DYNAMIC_IMAGE_SENTINEL_MARKET_WASTE"), "content image sentinel must not render");
}

async function main() {
  const failures = [];
  await collect("deck helper calls addVisualAnchorContentSlide for every skeleton page", assertDeckHelperCallsVisualAnchorEntrypoint, failures);
  await collect("brief can become a blank-body skeleton deck", assertBriefCanBecomeSkeletonDeck, failures);
  await collect("plan fixture can become a blank-body skeleton deck", assertPlanFixtureCanBecomeSkeletonDeck, failures);

  if (failures.length) {
    console.error(`ppt skeleton rendering tests failed: ${failures.length} issue(s)`);
    failures.forEach((failure, index) => {
      console.error(`\n${index + 1}. ${failure.testName}`);
      console.error(failure.error.stack || failure.error.message || failure.error);
    });
    process.exit(1);
  }
  console.log("ppt skeleton rendering tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
