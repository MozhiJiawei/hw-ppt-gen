const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { classifyBlock } = require("../../pptx/layout/classify_blocks");
const { measurePrimitive } = require("../../pptx/layout/measure_primitives");
const {
  OFFICIAL_TEMPLATES_BY_KIND,
  SUPPORTING_COMPONENT_KEYS,
} = require("../../pptx/contracts/visual_templates");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(ROOT, ".tmp", "layout_taxonomy_coverage_report.json");

const MEASURED_WHITELIST = new Set(
  Object.entries(OFFICIAL_TEMPLATES_BY_KIND)
    .flatMap(([kind, templates]) => templates.map((template) => `${kind}/${template}`))
);

const taxonomyRows = [];
for (const [kind, templates] of Object.entries(OFFICIAL_TEMPLATES_BY_KIND)) {
  for (const template of templates) {
    const key = `${kind}/${template}`;
    const row = classifyBlock({
      type: SUPPORTING_COMPONENT_KEYS.has(key) ? "supporting_component" : "visual_anchor",
      visual_anchor: { id: key.replace(/[^\w]+/g, "_"), kind, template },
    });
    taxonomyRows.push({ key, ...row });
  }
}

const unsupported = taxonomyRows.filter((row) => row.measureSupport === "unsupported");
assert.deepStrictEqual(unsupported.map((row) => row.key), [], "every official kind/template must have taxonomy coverage");

const missingMeasured = [...MEASURED_WHITELIST].filter((key) => {
  const row = taxonomyRows.find((item) => item.key === key);
  return !row || row.measureSupport !== "measured";
});
assert.deepStrictEqual(missingMeasured, [], "every official body primitive must claim measured support");

const wrongEligibility = taxonomyRows.filter((row) => {
  const expected = SUPPORTING_COMPONENT_KEYS.has(row.key) ? "supporting_component" : "real_anchor";
  return row.anchorEligibility !== expected;
});
assert.deepStrictEqual(wrongEligibility.map((row) => `${row.key}:${row.anchorEligibility}`), [], "anchor eligibility must match architecture boundary");

const measuredFixtureRows = buildMeasuredFixtureRows().filter((row) => row.final_support === "measured");
for (const row of measuredFixtureRows) {
  assert(row.min_h > 0, `${row.key} min height must be positive`);
  assert(row.preferred_h >= row.min_h, `${row.key} preferred height must be >= min height`);
  assert(row.max_h >= row.preferred_h, `${row.key} max useful height must be >= preferred height`);
  assert(row.final_support === "measured", `${row.key} fixture must measure through measured path`);
}
const estimatedFixtureRows = buildMeasuredFixtureRows().filter((row) => row.final_support === "estimated");

const report = {
  generated_at: new Date().toISOString(),
  official_template_count: taxonomyRows.length,
  unsupported_count: unsupported.length,
  measured_whitelist: [...MEASURED_WHITELIST].sort(),
  taxonomy_rows: taxonomyRows.map((row) => ({
    key: row.key,
    family: row.family,
    type: row.type,
    anchorEligibility: row.anchorEligibility,
    measureSupport: row.measureSupport,
    resizePolicy: row.resizePolicy,
    taxonomy_key: row.taxonomy_key,
  })),
  measured_fixture_rows: measuredFixtureRows,
  estimated_fixture_rows: estimatedFixtureRows,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");

console.log(`Taxonomy coverage contract passed: ${OUT}`);

function buildMeasuredFixtureRows() {
  const evidencePath = path.join(ROOT, ".tmp", "taxonomy_coverage_source.svg");
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"></svg>`, "utf8");
  const area = { x: 0, y: 0, w: 3.6, h: 4.0 };
  const fixtures = [
    {
      key: "Evidence/source_figure",
      block: { type: "visual_anchor", visual_anchor: { kind: "Evidence", template: "source_figure", source: { path: evidencePath } } },
    },
    {
      key: "Quantity/data_cards",
      block: {
        type: "supporting_component",
        visual_anchor: {
          kind: "Quantity",
          template: "data_cards",
          visual_spec: { cards: [{ label: "A", value: "7.45" }, { label: "B", value: "8.25" }, { label: "C", value: "4.71x" }] },
        },
      },
    },
    {
      key: "Matrix/table",
      block: {
        type: "supporting_component",
        visual_anchor: {
          kind: "Matrix",
          template: "table",
          visual_spec: { rows: [["项", "判断"], ["收益", "可复现"], ["边界", "需评估"]] },
        },
      },
    },
    {
      key: "StructuredText/RichBulletBlock",
      block: { type: "text", body: ["收益：平均推进长度提升。", "边界：先复现再投入。"] },
    },
  ];
  return fixtures.map(({ key, block }) => {
    const measure = measurePrimitive(block, area, { layoutType: "three_column" });
    return {
      key,
      taxonomy_key: measure.primitive.taxonomy_key,
      final_support: measure.primitive.measureSupport,
      min_h: round(measure.minSize.h),
      preferred_h: round(measure.preferredSize.h),
      max_h: round(measure.maxUsefulSize.h),
      resizePolicy: measure.resizePolicy,
      diagnostics: measure.diagnostics.map((item) => ({ code: item.code, severity: item.severity })),
    };
  });
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}
