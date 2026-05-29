const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { measurePrimitive } = require("../../pptx/layout/measure_primitives");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const TMP = path.join(ROOT, ".tmp", "layout_measurement_smoke");
fs.mkdirSync(TMP, { recursive: true });

const sourceSvg = path.join(TMP, "wide_source.svg");
fs.writeFileSync(sourceSvg, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">
  <rect width="1200" height="500" fill="#fff"/>
  <text x="600" y="250" text-anchor="middle" font-size="64">source</text>
</svg>`, "utf8");

const area = { x: 0, y: 0, w: 3.4, h: 4.4 };

const evidence = measurePrimitive({
  type: "visual_anchor",
  visual_anchor: {
    id: "evidence",
    title: "Evidence",
    claim: "Source evidence",
    kind: "Evidence",
    template: "source_figure",
    source: { path: sourceSvg, caption: "source evidence" },
  },
}, area, { layoutType: "three_column" });
assert.equal(evidence.primitive.taxonomy_key, "Evidence.SourceFigure");
assert.equal(evidence.resizePolicy, "preserve_aspect");
assert(evidence.minSize.h >= 0.72);
assert(evidence.preferredSize.h >= evidence.minSize.h);
assert(evidence.measurement?.ok, "Evidence measurement must come from PowerPoint COM");
assert(evidence.measurement?.shape_bounds?.w > 0, "Evidence COM measurement should report rendered bounds");

const cards = measurePrimitive({
  type: "supporting_component",
  visual_anchor: {
    id: "cards",
    kind: "Quantity",
    template: "data_cards",
    visual_spec: {
      cards: [
        { label: "1.5B接收", value: "7.45" },
        { label: "8B接收", value: "8.25" },
        { label: "真实吞吐", value: "4.71/5.91x" },
      ],
    },
  },
}, area);
assert.equal(cards.primitive.taxonomy_key, "QuantitativeReadout.KpiCardRow");
assert.equal(cards.cards.count, 3);
assert(cards.preferredSize.h >= 0.78);
assert(cards.minSize.w > 0, "KPI row should report a width floor, not only height");

const narrowCards = measurePrimitive({
  type: "supporting_component",
  visual_anchor: {
    id: "narrow_cards",
    kind: "Quantity",
    template: "data_cards",
    visual_spec: {
      cards: [
        { label: "1.5B接收", value: "7.45" },
        { label: "8B接收", value: "8.25" },
        { label: "真实吞吐", value: "4.71/5.91x" },
      ],
    },
  },
}, { x: 0, y: 0, w: 2.45, h: 1.0 });
assert(narrowCards.diagnostics.some((item) => item.code === "layout_kpi_row_width_too_small"), "KPI row must fail measurement when value text cannot fit the available width");

const text = measurePrimitive({
  type: "text",
  body: ["机制变化：当前输出和下一批草稿被压进同一次 forward。", "边界：不是外接小 drafter。"],
}, area);
assert.equal(text.primitive.taxonomy_key, "StructuredText.RichBulletBlock");
assert.equal(text.measurement.kind, "text");
assert(text.measurement.text_bounds.h > 0);
assert(text.preferredSize.h >= text.minSize.h);

console.log("Primitive measurement smoke passed.");
