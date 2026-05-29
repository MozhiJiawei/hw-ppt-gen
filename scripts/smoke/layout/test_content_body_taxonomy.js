const assert = require("assert");
const { classifyBlock } = require("../../pptx/layout/classify_blocks");

function visual(kind, template) {
  return { type: "visual_anchor", visual_anchor: { id: `${kind}_${template}`, kind, template } };
}

function assertClassification(block, expected) {
  const actual = classifyBlock(block);
  Object.entries(expected).forEach(([key, value]) => {
    assert.equal(actual[key], value, `${key} should be ${value}; got ${actual[key]}`);
  });
}

assertClassification(visual("Evidence", "source_figure"), {
  family: "Evidence",
  type: "SourceFigure",
  anchorEligibility: "real_anchor",
  measureSupport: "measured",
});

assertClassification(visual("Quantity", "data_cards"), {
  family: "QuantitativeReadout",
  type: "KpiCardRow",
  anchorEligibility: "supporting_component",
  measureSupport: "measured",
});

assertClassification(visual("Matrix", "table"), {
  family: "MatrixTable",
  type: "NativeTable",
  anchorEligibility: "supporting_component",
  measureSupport: "measured",
});

assertClassification(visual("Matrix", "heatmap"), {
  family: "MatrixTable",
  type: "HeatmapMatrix",
  anchorEligibility: "supporting_component",
  measureSupport: "measured",
});

assertClassification(visual("Sequence", "process"), {
  family: "RelationshipDiagram",
  type: "ProcessFlow",
  anchorEligibility: "real_anchor",
  measureSupport: "measured",
});

assertClassification({ type: "text", body: ["机制变化：同一次 forward。", "边界：不是外接小 drafter。"] }, {
  family: "StructuredText",
  type: "RichBulletBlock",
  anchorEligibility: "not_anchor",
  measureSupport: "measured",
});

const unsupported = classifyBlock(visual("Mystery", "unknown"));
assert.equal(unsupported.measureSupport, "unsupported");
assert(unsupported.diagnostics.some((item) => item.code === "layout_taxonomy_unsupported"));

const knownKindUnknownTemplate = classifyBlock(visual("Sequence", "unknown_template"));
assert.equal(knownKindUnknownTemplate.measureSupport, "unsupported", "known kinds must not fall back to a measured default template");
assert.equal(knownKindUnknownTemplate.anchorEligibility, "not_anchor", "unknown templates must not count as real anchors");

console.log("Content body taxonomy smoke passed.");
