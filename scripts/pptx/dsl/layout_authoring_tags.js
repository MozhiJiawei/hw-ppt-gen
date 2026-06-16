"use strict";

const LAYOUT_AUTHORING_TAGS = Object.freeze([
  layoutTag("TwoColumn", "two_column", 2, "Two equal-width Huawei body modules."),
  layoutTag("BiasedColumn", "biased_column", 2, "Two Huawei body modules with a wider primary evidence side."),
  layoutTag("ThreeColumn", "three_column", 3, "Three compact Huawei body modules for summary or parallel comparisons."),
  layoutTag("FourColumn", "four_column", 4, "Four dense Huawei body modules for very compact scans."),
]);

const LAYOUT_AUTHORING_BY_TAG = Object.freeze(Object.fromEntries(
  LAYOUT_AUTHORING_TAGS.map((entry) => [entry.tag, entry])
));

function getLayoutAuthoringTag(tag) {
  return LAYOUT_AUTHORING_BY_TAG[String(tag || "").trim()] || null;
}

function listLayoutAuthoringTags() {
  return LAYOUT_AUTHORING_TAGS.map((entry) => ({ ...entry }));
}

function layoutTag(tag, type, moduleCount, description) {
  return Object.freeze({
    tag,
    type,
    role: "layout",
    maturity: "official",
    description,
    requiredProps: [],
    childTags: ["Module"],
    docs: {
      useWhen: `Use <${tag}> as the authored body root when the slide needs ${moduleCount} Module children.`,
      avoidWhen: "Do not use internal <Columns> in authored Body DSL.",
      budgetHints: [`Use exactly ${moduleCount} <Module> children.`],
      alternatives: ["TwoColumn", "BiasedColumn", "ThreeColumn", "FourColumn"].filter((item) => item !== tag),
      repairHints: [`Add ${moduleCount} <Module title="..."> children, then put evidence/supporting/text components inside each module.`],
    },
    examples: [{
      tag,
      props: {},
      children: Array.from({ length: moduleCount }, (_, index) => ({
        tag: "Module",
        props: { title: `模块${index + 1}` },
        children: [],
      })),
    }],
  });
}

module.exports = {
  getLayoutAuthoringTag,
  listLayoutAuthoringTags,
};
