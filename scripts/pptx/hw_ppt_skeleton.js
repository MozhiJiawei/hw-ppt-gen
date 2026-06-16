"use strict";

const fs = require("fs");
const path = require("path");

const {
  addCoverSlide,
  addTocSlide,
  createHuaweiDeck,
  ensureTmpPath,
  repairPptxForPowerPointCom,
  safeText,
} = require("./hw_pptx_helpers");
const { addVisualAnchorContentSlide } = require("./hw_visual_anchor_slide");
const { parsePptContentBrief } = require("./parse_ppt_content_brief");

function buildSkeletonPlanFromBriefText(input, options = {}) {
  const parsed = parsePptContentBrief(input, options);
  return buildSkeletonPlanFromParsedBrief(parsed, options);
}

function buildSkeletonPlanFromParsedBrief(parsed, options = {}) {
  const source = safeText(options.source || parsed.metadata?.["内容来源"] || "");
  const sections = parsed.sections || [];
  const slides = [];

  if (parsed.summaryPage) {
    slides.push({
      page: parsed.summaryPage.pageNumber,
      role: "summary",
      title: parsed.summaryPage.title,
      titleNote: parsed.summaryPage.titleNote,
      summary: parsed.summaryPage.summary,
      sections,
      source,
    });
  }

  for (const page of parsed.contentPages || []) {
    slides.push({
      page: page.pageNumber,
      role: "content",
      title: page.title,
      titleNote: page.titleNote,
      summary: page.summary,
      sections,
      currentSection: page.currentSection,
      source,
    });
  }

  return normalizeSkeletonPlan({
    source: "ppt_content_brief",
    expectedPages: parsed.expectedPages,
    sections,
    cover: {
      title: parsed.slideContract?.cover?.title || parsed.metadata?.["主题"],
      subtitle: parsed.summaryPage?.titleNote || parsed.metadata?.["目标读者"],
      department: parsed.metadata?.["目标读者"],
      date: options.date || "",
    },
    toc: {
      title: "目录 CONTENTS",
      items: (parsed.tocItems || []).map((item) => ({
        title: item.title,
        note: item.description,
      })),
      source,
      page: 3,
    },
    slides,
  });
}

function normalizeSkeletonPlan(plan = {}) {
  const sections = normalizeSections(plan.sections || plan.toc?.items || plan.toc || []);
  const source = safeText(plan.sourceNote || plan.source || plan.toc?.source || "");
  const slides = normalizeSkeletonSlides(plan.slides || plan.pages || [], sections, source);
  return {
    source: safeText(plan.source || ""),
    expectedPages: plan.expectedPages,
    sections,
    cover: normalizeCover(plan.cover || {}, plan),
    toc: normalizeToc(plan.toc || {}, sections, source),
    slides,
  };
}

function normalizeCover(cover, plan) {
  return {
    title: safeText(cover.title || plan.title || "汇报标题"),
    subtitle: safeText(cover.subtitle || cover.titleNote || ""),
    department: safeText(cover.department || cover.audience || ""),
    date: safeText(cover.date || ""),
  };
}

function normalizeToc(toc, sections, source) {
  const rawItems = Array.isArray(toc) ? toc : (toc.items || sections);
  return {
    title: safeText(toc.title || "目录 CONTENTS"),
    items: rawItems.map((item) => {
      if (item && typeof item === "object") {
        return {
          title: safeText(item.title || item.name || item.label),
          note: safeText(item.note || item.description || item.subtitle || ""),
        };
      }
      return { title: safeText(item), note: "" };
    }).filter((item) => item.title),
    source: safeText(toc.source || source),
    page: toc.page || 3,
  };
}

function normalizeSections(input) {
  const list = Array.isArray(input) ? input : [];
  return list.map((item) => {
    if (item && typeof item === "object") return safeText(item.title || item.name || item.label);
    return safeText(item);
  }).filter(Boolean);
}

function normalizeSkeletonSlides(slides, sections, source) {
  return slides.map((slide, index) => ({
    page: slide.page || slide.pageNumber || index + 1,
    role: safeText(slide.role || "content"),
    title: safeText(slide.title || slide.pageTitle || "页面标题"),
    titleNote: safeText(slide.titleNote || slide.titleSubtitle || slide.subtitle || ""),
    summary: normalizeSummary(slide.summary || slide.analysisSummary || slide.analysis),
    sections: normalizeSections(slide.sections || sections),
    currentSection: safeText(slide.currentSection || slide.section || ""),
    source: safeText(slide.source || source),
  }));
}

function normalizeSummary(summary) {
  if (!summary) return { body: [] };
  if (Array.isArray(summary)) return { body: summary };
  if (typeof summary === "string") return { body: summary };
  return {
    label: summary.label,
    body: summary.body || summary.items || [],
  };
}

function renderHuaweiPptSkeleton(plan, options = {}) {
  const skeletonPlan = normalizeSkeletonPlan(plan);
  const pptx = options.pptx || createHuaweiDeck({ title: skeletonPlan.cover.title });

  if (options.includeCover !== false) {
    addCoverSlide(pptx, skeletonPlan.cover);
  }

  if (options.includeToc !== false && skeletonPlan.toc.items.length) {
    addTocSlide(pptx, skeletonPlan.toc);
  }

  for (const slide of skeletonPlan.slides) {
    addVisualAnchorContentSlide(pptx, {
      ...slide,
      skeletonOnly: true,
      page: formatPage(slide.page),
    });
  }

  return pptx;
}

function formatPage(page) {
  const numeric = Number(page);
  if (Number.isFinite(numeric) && numeric > 0) return String(numeric).padStart(2, "0");
  return safeText(page);
}

async function writeHuaweiPptSkeleton(plan, fileName, options = {}) {
  ensureTmpPath(fileName);
  const pptx = renderHuaweiPptSkeleton(plan, options);
  await pptx.writeFile({ fileName });
  if (options.repair !== false) {
    await repairPptxForPowerPointCom(fileName);
  }
  return fileName;
}

function readSkeletonPlan(fileName) {
  return normalizeSkeletonPlan(JSON.parse(fs.readFileSync(path.resolve(fileName), "utf8")));
}

module.exports = {
  buildSkeletonPlanFromBriefText,
  buildSkeletonPlanFromParsedBrief,
  normalizeSkeletonPlan,
  readSkeletonPlan,
  renderHuaweiPptSkeleton,
  writeHuaweiPptSkeleton,
};
