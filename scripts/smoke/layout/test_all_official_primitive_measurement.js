const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildTemplateCases } = require("../fixtures/visual_diagram_test_cases");
const { measurePrimitive } = require("../../pptx/layout/measure_primitives");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(ROOT, ".tmp", "layout_all_official_primitive_measurement.json");

const OFFICIAL = [
  "Evidence/source_figure",
  "Evidence/source_table",
  "Evidence/source_screenshot",
  "Evidence/source_chart",
  "Quantity/data_cards",
  "Quantity/bar_chart",
  "Quantity/line_chart",
  "Quantity/proportion_chart",
  "Quantity/heatmap",
  "Sequence/process",
  "Sequence/timeline",
  "Sequence/swimlane",
  "Loop/closed_loop",
  "Loop/dual_loop",
  "Loop/spiral_iteration_ladder",
  "Hierarchy/tree",
  "Hierarchy/layered_architecture",
  "Hierarchy/capability_stack",
  "Matrix/table",
  "Matrix/quadrant_matrix",
  "Matrix/capability_matrix",
  "Matrix/heatmap",
  "Network/hub_spoke_network",
  "Network/dependency_graph",
  "Network/module_interaction_map",
  "Network/causal_influence_graph",
];

const evidencePath = path.join(ROOT, ".tmp", "official_measurement_source.svg");
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
fs.writeFileSync(evidencePath, `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f7f7f7"/><text x="480" y="270" text-anchor="middle" font-size="48">Evidence</text></svg>`, "utf8");

const casesByKey = new Map();
for (const item of buildTemplateCases()) {
  const key = `${item.kind}/${item.template}`;
  if (!casesByKey.has(key)) casesByKey.set(key, item);
}

const rows = OFFICIAL.map((key) => {
  const [kind, template] = key.split("/");
  const fixture = key.startsWith("Evidence/")
    ? evidenceFixture(kind, template)
    : casesByKey.get(key) || manualFixture(kind, template);
  assert(fixture, `missing fixture for ${key}`);
  const block = {
    type: supportingKey(key) ? "supporting_component" : "visual_anchor",
    [supportingKey(key) ? "component" : "visual_anchor"]: {
      id: `measure_${key.replace(/[^\w]+/g, "_")}`,
      title: `${key} measurement`,
      claim: `${key} measurement fixture.`,
      kind,
      template,
      source: fixture.source,
      visual_spec: fixture.visual_spec,
    },
  };
  const measure = measurePrimitive(block, { x: 0, y: 0, w: 3.65, h: 3.6 }, { layoutType: "three_column" });
  const errors = (measure.diagnostics || []).filter((item) => item.severity === "error");
  assert.equal(measure.primitive.measureSupport, "measured", `${key} must be measured`);
  assert.deepStrictEqual(errors, [], `${key} measurement must not emit errors`);
  assert(Number(measure.minSize.w) > 0, `${key} min width must be positive`);
  assert(Number(measure.minSize.h) > 0, `${key} min height must be positive`);
  assert(Number(measure.preferredSize.w) >= Number(measure.minSize.w), `${key} preferred width must be >= min width`);
  assert(Number(measure.preferredSize.h) >= Number(measure.minSize.h), `${key} preferred height must be >= min height`);
  assert(Number(measure.maxUsefulSize.w) >= Number(measure.preferredSize.w), `${key} max width must be >= preferred width`);
  assert(Number(measure.maxUsefulSize.h) >= Number(measure.preferredSize.h), `${key} max height must be >= preferred height`);
  return {
    key,
    taxonomy_key: measure.primitive.taxonomy_key,
    min: roundSize(measure.minSize),
    preferred: roundSize(measure.preferredSize),
    max: roundSize(measure.maxUsefulSize),
    resizePolicy: measure.resizePolicy,
    measurement_kind: measure.measurement?.kind || null,
    diagnostics: (measure.diagnostics || []).map((item) => ({ code: item.code, severity: item.severity })),
  };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2), "utf8");
console.log(`All official primitive measurement smoke passed: ${OUT}`);

function evidenceFixture(kind, template) {
  return {
    kind,
    template,
    source: { path: evidencePath, caption: `${template} evidence fixture` },
  };
}

function manualFixture(kind, template) {
  if (template === "heatmap") {
    return {
      kind,
      template,
      visual_spec: {
        rows: ["训练", "推理", "部署"],
        columns: ["成本", "收益", "风险"],
        values: [[0.2, 0.7, 0.4], [0.5, 0.9, 0.3], [0.6, 0.8, 0.5]],
      },
    };
  }
  if (template === "data_cards") {
    return {
      kind,
      template,
      visual_spec: {
        cards: [
          { label: "A", value: "7.45" },
          { label: "B", value: "8.25" },
          { label: "C", value: "4.71x" },
        ],
      },
    };
  }
  return null;
}

function supportingKey(key) {
  return [
    "Quantity/data_cards",
    "Quantity/heatmap",
    "Matrix/table",
    "Matrix/capability_matrix",
    "Matrix/heatmap",
    "Hierarchy/capability_stack",
  ].includes(key);
}

function roundSize(size) {
  return {
    w: Number(Number(size.w || 0).toFixed(3)),
    h: Number(Number(size.h || 0).toFixed(3)),
  };
}
