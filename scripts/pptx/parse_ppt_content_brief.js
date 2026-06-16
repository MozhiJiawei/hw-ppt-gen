#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const REQUIRED_HEADINGS = [
  "# PPT Content Brief",
  "## Deck Metadata",
  "## Summary Page",
];

const METADATA_FIELDS = [
  "主题",
  "目标读者",
  "页数口径",
  "核心结论",
  "内容来源",
  "关联审计文件",
];

const SUMMARY_FIELDS = [
  "页码",
  "页面标题",
  "标题说明",
  "分析总结",
  "正文内容",
  "参考图片",
];

const CONTENT_PAGE_FIELDS = [
  "所属章节",
  "页面标题",
  "标题说明",
  "分析总结",
  "正文内容",
  "参考图片",
];

const BANNED_INTERNAL_TOKENS = [
  "Claim",
  "Evidence",
  "Implication",
  "Evidence Map",
  "Source Locator",
  "Source Usage Policy",
  "Approval Log",
  "needs_verification",
  "user_judgment",
  "supplemental research",
  "primary source",
  "inference",
  "页面角色",
  "支撑的章节论点",
  "Claim / Evidence / Implication",
  "边界提醒",
  "证据边界",
  "证据状态",
  "误读风险",
  "信息密度说明",
];

const BANNED_RENDERING_TOKENS = [
  "visual_anchor.kind",
  "visual_anchor_renderer",
  "renderer",
  "expected_renderer",
  "visual_strategy",
  "template:",
  "字号",
  "字体",
  "配色",
  "几栏",
  "两栏",
  "三栏",
  "四栏",
];

function normalizeNewlines(text) {
  return String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineNumberForOffset(text, offset) {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}

function extractHeadingSection(text, heading) {
  const pattern = new RegExp(`^${escapeRegExp(heading)}\\s*$`, "m");
  const match = pattern.exec(text);
  if (!match) return { body: "", startLine: 0, found: false };
  const rest = text.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  const end = next ? match.index + match[0].length + next.index : text.length;
  return {
    body: text.slice(match.index + match[0].length, end),
    startLine: lineNumberForOffset(text, match.index),
    found: true,
  };
}

function extractField(block, field) {
  const match = new RegExp(`^${escapeRegExp(field)}[：:]\\s*(.*?)\\s*$`, "m").exec(block);
  return match ? match[1].trim() : "";
}

function extractMultilineField(block, field, nextFields) {
  const startPattern = new RegExp(`^${escapeRegExp(field)}[：:]?\\s*(.*)$`, "m");
  const startMatch = startPattern.exec(block);
  if (!startMatch) return "";
  const inlineValue = startMatch[1] ? `${startMatch[1]}\n` : "";
  const start = startMatch.index + startMatch[0].length;
  let end = block.length;
  for (const nextField of nextFields) {
    const nextPattern = new RegExp(`^${escapeRegExp(nextField)}[：:]`, "m");
    const nextMatch = nextPattern.exec(block.slice(start));
    if (nextMatch) end = Math.min(end, start + nextMatch.index);
  }
  return `${inlineValue}${block.slice(start, end)}`.trim();
}

function parseBulletList(block) {
  return String(block || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-\s+\S/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim());
}

function parseAnalysisItems(block) {
  const raw = extractMultilineField(block, "分析总结", ["正文内容", "参考图片", "备注"]);
  return parseBulletList(raw).map((item) => {
    const match = /^([^：:\n]{2,12})[：:]\s*(\S[\s\S]*)$/.exec(item);
    return {
      label: match ? match[1].trim() : "",
      text: match ? match[2].trim() : item.trim(),
      raw: item.trim(),
    };
  });
}

function parseLooseBulletsOrText(block) {
  const bullets = parseBulletList(block);
  return bullets.length ? bullets : block.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function parseMetadata(block) {
  const fields = {};
  for (const field of METADATA_FIELDS) {
    fields[field] = extractField(block, field);
  }
  return fields;
}

function parsePageNumber(text) {
  const match = /(?:Page\s*)?(\d+)/i.exec(text || "");
  return match ? Number(match[1]) : null;
}

function parseSummaryPage(block) {
  const nextFields = ["正文内容", "参考图片", "备注"];
  return {
    pageNumber: parsePageNumber(extractField(block, "页码")),
    title: extractField(block, "页面标题"),
    titleNote: extractField(block, "标题说明"),
    summary: {
      body: parseAnalysisItems(block).map(({ label, text }) => ({ label, text })),
    },
    bodyContent: parseLooseBulletsOrText(extractMultilineField(block, "正文内容", nextFields)),
    referenceImages: parseLooseBulletsOrText(extractMultilineField(block, "参考图片", ["备注"])),
    notes: parseLooseBulletsOrText(extractMultilineField(block, "备注", [])),
  };
}

function recommendBodyLayoutForSummary(summary) {
  const count = Array.isArray(summary?.body) ? summary.body.length : 0;
  if (count <= 1) {
    return { type: "biased_column", reference: "06 内容 偏分栏", viewpointCount: Math.max(1, count) };
  }
  if (count === 2) {
    return { type: "two_column", reference: "05 内容 二分栏", viewpointCount: count };
  }
  return { type: "three_column", reference: "07 内容 三分栏", viewpointCount: Math.min(3, count) };
}

function buildPptContentBriefPlanContract(parsed) {
  const sections = parsed.sections || [];
  const slides = [];
  if (parsed.summaryPage) {
    const recommendation = parsed.summaryPage.bodyLayoutRecommendation || recommendBodyLayoutForSummary(parsed.summaryPage.summary);
    slides.push({
      page: parsed.summaryPage.pageNumber,
      role: "summary",
      title: parsed.summaryPage.title,
      titleNote: parsed.summaryPage.titleNote,
      summary: parsed.summaryPage.summary,
      sections,
      bodyLayout: { type: recommendation.type },
      viewpointCount: recommendation.viewpointCount,
    });
  }
  for (const page of parsed.contentPages || []) {
    const recommendation = page.bodyLayoutRecommendation || recommendBodyLayoutForSummary(page.summary);
    slides.push({
      page: page.pageNumber,
      role: "content",
      title: page.title,
      titleNote: page.titleNote,
      summary: page.summary,
      sections,
      currentSection: page.currentSection,
      bodyLayout: { type: recommendation.type },
      viewpointCount: recommendation.viewpointCount,
    });
  }
  return {
    source: "ppt_content_brief",
    expectedPages: parsed.expectedPages,
    sections,
    toc: (parsed.tocItems || []).map((item) => ({ title: item.title, description: item.description })),
    slides,
  };
}

function parseTocItems(block) {
  const lines = block.split("\n");
  const items = [];
  let current = null;
  for (const line of lines) {
    const titleMatch = /^(\d{2})\s+小标题[：:]\s*(\S.*?)\s*$/.exec(line.trim());
    if (titleMatch) {
      current = { index: titleMatch[1], title: titleMatch[2], description: "" };
      items.push(current);
      continue;
    }
    const descriptionMatch = /^说明[：:]\s*(\S.*?)\s*$/.exec(line.trim());
    if (descriptionMatch && current) current.description = descriptionMatch[1];
  }
  return items;
}

function extractContentPages(text) {
  const section = extractHeadingSection(text, "## Page Content");
  if (!section.found) return [];
  const matches = [...section.body.matchAll(/^###\s+Page\s+(\d+)\s*:\s*(.+?)\s*$/gm)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : section.body.length;
    const body = section.body.slice(start, end);
    const nextFields = ["参考图片", "备注"];
    return {
      pageNumber: Number(match[1]),
      headingTitle: match[2].trim(),
      startLine: section.startLine + lineNumberForOffset(section.body, match.index),
      currentSection: extractField(body, "所属章节"),
      title: extractField(body, "页面标题"),
      titleNote: extractField(body, "标题说明"),
      summary: {
        body: parseAnalysisItems(body).map(({ label, text }) => ({ label, text })),
      },
      bodyContent: parseLooseBulletsOrText(extractMultilineField(body, "正文内容", nextFields)),
      referenceImages: parseLooseBulletsOrText(extractMultilineField(body, "参考图片", ["备注"])),
      notes: parseLooseBulletsOrText(extractMultilineField(body, "备注", [])),
      rawBody: body,
    };
  });
}

function contentCharCount(text) {
  const cleaned = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/^[\-*\d.\s]+/, ""))
    .map((line) => line.replace(/^(页码|所属章节|页面标题|标题说明|分析总结|正文内容|参考图片|备注)[：:]\s*/, ""))
    .join("\n");
  return (cleaned.match(/[\w\u4e00-\u9fff]/gu) || []).length;
}

function hasField(block, field) {
  return new RegExp(`^${escapeRegExp(field)}[：:]`, "m").test(block);
}

function validateAnalysisItems(scope, items, errors) {
  if (items.length < 1 || items.length > 3 || items.some((item) => !item.label || !item.text)) {
    errors.push(`${scope} 分析总结 must contain 1-3 labeled bullets in 小标题：解释 form`);
  }
}

function validateBodySupportsSummary(scope, block, errors) {
  const labels = parseAnalysisItems(block).map((item) => item.label).filter(Boolean);
  const body = extractMultilineField(block, "正文内容", ["参考图片", "备注"]);
  for (const label of labels) {
    const supportPattern = new RegExp(`(^|\\n)\\s*(?:-\\s*)?${escapeRegExp(label)}[：:]`);
    if (!supportPattern.test(body)) {
      errors.push(`${scope} 正文内容 must explicitly support 分析总结 label '${label}'`);
    }
  }
}

function detectExpectedPages(metadata) {
  const text = metadata["页数口径"] || "";
  const match = /(\d+)\s*(?:total\s*)?PPT\s*pages/i.exec(text) || /(\d+)\s*页/.exec(text);
  return match ? Number(match[1]) : null;
}

function validatePptContentBrief(input, options = {}) {
  const text = normalizeNewlines(input);
  const errors = [];
  const expectedPages = options.expectedPages ?? null;

  for (const heading of REQUIRED_HEADINGS) {
    if (!new RegExp(`^${escapeRegExp(heading)}\\s*$`, "m").test(text)) {
      errors.push(`Missing required heading: ${heading}`);
    }
  }

  const metadataSection = extractHeadingSection(text, "## Deck Metadata");
  const metadata = parseMetadata(metadataSection.body);
  for (const field of METADATA_FIELDS) {
    if (!metadata[field]) errors.push(`Deck Metadata field is missing or empty: ${field}`);
  }

  const derivedExpectedPages = expectedPages || detectExpectedPages(metadata);
  const summaryOnly = derivedExpectedPages === 1;
  const hasToc = /^## Table of Contents\s*$/m.test(text);
  const hasPageContent = /^## Page Content\s*$/m.test(text);
  const requiresContentPages = derivedExpectedPages == null ? hasPageContent : derivedExpectedPages >= 4;

  if (summaryOnly && (hasToc || hasPageContent)) {
    errors.push("For a 1-page PPT Content Brief, omit Table of Contents and Page Content");
  }
  if (requiresContentPages && (!hasToc || !hasPageContent)) {
    errors.push("Multi-page PPT Content Brief must include Table of Contents and Page Content");
  }

  const summaryIndex = text.indexOf("## Summary Page");
  const tocIndex = text.indexOf("## Table of Contents");
  const pageIndex = text.indexOf("## Page Content");
  if (requiresContentPages && !(summaryIndex !== -1 && tocIndex !== -1 && pageIndex !== -1 && summaryIndex < tocIndex && tocIndex < pageIndex)) {
    errors.push("PPT Content Brief must be ordered as Summary Page, Table of Contents, then Page Content");
  }

  const summarySection = extractHeadingSection(text, "## Summary Page");
  for (const field of SUMMARY_FIELDS) {
    if (!hasField(summarySection.body, field)) errors.push(`Summary Page missing field: ${field}`);
  }
  const summaryNumber = parsePageNumber(extractField(summarySection.body, "页码"));
  const expectedSummaryPage = summaryOnly ? 1 : 2;
  if (summaryNumber !== expectedSummaryPage) {
    errors.push(`Summary Page 页码 must be Page ${expectedSummaryPage}`);
  }
  validateAnalysisItems("Summary Page", parseAnalysisItems(summarySection.body), errors);
  validateBodySupportsSummary("Summary Page", summarySection.body, errors);

  const tocItems = hasToc ? parseTocItems(extractHeadingSection(text, "## Table of Contents").body) : [];
  if (hasToc) {
    if (!tocItems.length) errors.push("Table of Contents must contain items like: 01 小标题：...");
    if (tocItems.some((item) => !item.description)) errors.push("Every Table of Contents item must include a 说明 line");
  }

  const pages = extractContentPages(text);
  if (requiresContentPages && !pages.length) {
    errors.push("No Page Content blocks found. Expected headings like: ### Page 4: 页面标题");
  }
  if (derivedExpectedPages && derivedExpectedPages >= 4 && pages.length !== derivedExpectedPages - 3) {
    errors.push(`Expected ${derivedExpectedPages - 3} Page Content block(s), found ${pages.length}`);
  }

  const allowedChapters = tocItems.map((item) => item.title);
  let previousChapterIndex = -1;
  let previousPageNumber = null;
  for (const page of pages) {
    for (const field of CONTENT_PAGE_FIELDS) {
      if (!hasField(page.rawBody, field)) {
        errors.push(`Page ${page.pageNumber} missing field: ${field}`);
      }
    }
    if (previousPageNumber != null && page.pageNumber !== previousPageNumber + 1) {
      errors.push(`Page Content page numbers must be continuous: expected Page ${previousPageNumber + 1}, found Page ${page.pageNumber}`);
    }
    previousPageNumber = page.pageNumber;

    const chapterIndex = allowedChapters.indexOf(page.currentSection);
    if (allowedChapters.length && chapterIndex === -1) {
      errors.push(`Page ${page.pageNumber} 所属章节 must match a Table of Contents 小标题: ${page.currentSection}`);
    }
    if (chapterIndex !== -1 && chapterIndex < previousChapterIndex) {
      errors.push(`Page ${page.pageNumber} moves backward in Table of Contents order: ${page.currentSection}`);
    }
    previousChapterIndex = Math.max(previousChapterIndex, chapterIndex);

    validateAnalysisItems(`Page ${page.pageNumber}`, parseAnalysisItems(page.rawBody), errors);
    validateBodySupportsSummary(`Page ${page.pageNumber}`, page.rawBody, errors);
    if (contentCharCount(page.rawBody) < (options.minPageContentChars || 0)) {
      errors.push(`Page ${page.pageNumber} content density too low`);
    }
  }

  if (contentCharCount(summarySection.body) < (options.minSummaryContentChars || 0)) {
    errors.push("Summary Page content density too low");
  }

  const lower = text.toLowerCase();
  for (const token of BANNED_INTERNAL_TOKENS.concat(BANNED_RENDERING_TOKENS)) {
    if (lower.includes(token.toLowerCase())) {
      errors.push(`Banned internal/layout token found in PPT Content Brief: ${token}`);
    }
  }

  return errors;
}

function parsePptContentBrief(input, options = {}) {
  const text = normalizeNewlines(input);
  const errors = validatePptContentBrief(text, options);
  if (errors.length && options.throwOnError !== false) {
    const error = new Error(`Invalid PPT Content Brief:\n- ${errors.join("\n- ")}`);
    error.validationErrors = errors;
    throw error;
  }
  const metadata = parseMetadata(extractHeadingSection(text, "## Deck Metadata").body);
  const tocItems = parseTocItems(extractHeadingSection(text, "## Table of Contents").body);
  const contentPages = extractContentPages(text).map((page) => {
    const recommendation = recommendBodyLayoutForSummary(page.summary);
    return {
      pageNumber: page.pageNumber,
      title: page.title,
      titleNote: page.titleNote,
      currentSection: page.currentSection,
      summary: page.summary,
      bodyLayoutRecommendation: recommendation,
      bodyContent: page.bodyContent,
      referenceImages: page.referenceImages,
      notes: page.notes,
    };
  });
  const sections = tocItems.map((item) => item.title);
  const summaryPage = parseSummaryPage(extractHeadingSection(text, "## Summary Page").body);
  const parsed = {
    metadata,
    expectedPages: options.expectedPages || detectExpectedPages(metadata),
    sections,
    summaryPage: {
      ...summaryPage,
      bodyLayoutRecommendation: recommendBodyLayoutForSummary(summaryPage.summary),
    },
    tocItems,
    contentPages,
    slideContract: {
      cover: {
        title: metadata["主题"],
        subtitle: summaryPage.titleNote || metadata["目标读者"],
        coreConclusion: metadata["核心结论"],
        audience: metadata["目标读者"],
        source: metadata["内容来源"],
      },
      summary: {
        ...summaryPage,
        bodyLayoutRecommendation: recommendBodyLayoutForSummary(summaryPage.summary),
      },
      toc: tocItems.map((item) => ({ title: item.title, description: item.description })),
      contentSlides: contentPages.map((page) => ({
        title: page.title,
        titleNote: page.titleNote,
        summary: page.summary,
        bodyLayoutRecommendation: page.bodyLayoutRecommendation,
        sections,
        currentSection: page.currentSection,
        bodyContent: page.bodyContent,
        referenceImages: page.referenceImages,
        notes: page.notes,
      })),
    },
  };
  parsed.planContract = buildPptContentBriefPlanContract(parsed);
  return parsed;
}

function main(argv) {
  const args = argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) {
    console.error("Usage: node scripts/pptx/parse_ppt_content_brief.js <ppt_content_brief.md> [--expected-pages N] [--json]");
    return 2;
  }
  const expectedIndex = args.indexOf("--expected-pages");
  const expectedPages = expectedIndex !== -1 ? Number(args[expectedIndex + 1]) : undefined;
  const json = args.includes("--json");
  const text = fs.readFileSync(file, "utf8");
  const parsed = parsePptContentBrief(text, { expectedPages });
  if (json) {
    process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
  } else {
    console.log("[OK] PPT Content Brief parsed.");
    console.log(`[OK] Topic: ${parsed.metadata["主题"] || "(none)"}`);
    console.log(`[OK] Summary page: Page ${parsed.summaryPage.pageNumber}`);
    console.log(`[OK] TOC sections: ${parsed.sections.length}`);
    console.log(`[OK] Content pages: ${parsed.contentPages.length}`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildPptContentBriefPlanContract,
  parsePptContentBrief,
  recommendBodyLayoutForSummary,
  validatePptContentBrief,
};
