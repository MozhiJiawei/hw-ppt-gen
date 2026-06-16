"use strict";

const {
  HW_STYLE,
  addAnalysisSummary,
  addFooter,
  addPageTitle,
} = require("../hw_pptx_helpers");

function addHuaweiPptPageSkeleton(pptx, data = {}, options = {}) {
  const slide = pptx.addSlide();
  const titleLayout = addPageTitle(slide, data.title || "页面标题", {
    kicker: data.kicker || "",
    subtitle: data.titleNote || data.titleSubtitle || "",
    sections: data.sections || [],
    currentSection: data.currentSection || data.section,
    fixedChrome: true,
  });

  const summaryY = HW_STYLE.summary.y;
  const contentTop = HW_STYLE.summary.contentTop;
  addAnalysisSummary(slide, data.summary, { y: summaryY });

  const bodyResult = typeof options.renderBody === "function"
    ? options.renderBody({ slide, titleLayout, summaryY, contentTop })
    : null;

  addFooter(slide, { source: data.source, page: data.page });
  return {
    slide,
    titleLayout,
    summaryY,
    contentTop,
    bodyResult,
  };
}

module.exports = {
  addHuaweiPptPageSkeleton,
};
