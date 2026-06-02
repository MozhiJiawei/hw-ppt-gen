"use strict";

function validArtifacts() {
  return {
    slideCount: 2,
    exportedPngs: ["slide_01.png", "slide_02.png"],
    pptxXml: [
      { slide: 1, xml: "<p:sld><a:r><a:rPr sz=\"1400\"><a:latin typeface=\"Microsoft YaHei\"/><a:solidFill><a:srgbClr val=\"333333\"/></a:solidFill></a:rPr><a:t>标题</a:t></a:r></p:sld>" },
      { slide: 2, xml: "<p:sld><p:sp><p:spPr><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:ln w=\"6350\"><a:solidFill><a:srgbClr val=\"C00000\"/></a:solidFill></a:ln></p:spPr></p:sp></p:sld>" },
    ],
    renderManifest: {
      slides: [
        { slide: 1, visual_component_id: "main_evidence", kind: "Evidence", template: "source_figure", visual_role: "visual_anchor", visual_anchor: { id: "main_evidence" }, renderer: "evidence", rendered: true },
      ],
    },
    planVisuals: [
      { slide: 1, id: "main_evidence", kind: "Evidence", template: "source_figure", renderer: "evidence" },
    ],
    contentSlides: [1],
    visibleTextBySlide: {
      1: "标题 来源图",
      2: "结论",
    },
    brief: {
      requiredVisibleText: [
        { slide: 1, text: "标题" },
      ],
    },
  };
}

module.exports = {
  validArtifacts,
};
