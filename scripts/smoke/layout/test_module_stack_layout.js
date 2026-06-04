const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { layoutModuleStack } = require("../../pptx/layout/stack_layout");
const { allocateMeasuredWidths } = require("../../pptx/layout/body_layout_planner");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const TMP = path.join(ROOT, ".tmp", "layout_stack_smoke");
fs.mkdirSync(TMP, { recursive: true });
const sourceSvg = path.join(TMP, "source.svg");
fs.writeFileSync(sourceSvg, `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="540" viewBox="0 0 900 540"></svg>`, "utf8");

function evidenceBlock() {
  return {
    type: "visual_anchor",
    visual_anchor: {
      id: "evidence",
      title: "Evidence",
      claim: "Source figure",
      kind: "Evidence",
      template: "source_figure",
      source: { path: sourceSvg, caption: "source evidence" },
    },
  };
}

function cardsBlock() {
  return {
    type: "supporting_component",
    component: {
      id: "cards",
      title: "KPI",
      claim: "Measured readout",
      kind: "Quantity",
      template: "data_cards",
      visual_spec: {
        cards: [
          { label: "50B训练", value: "50B" },
          { label: "8B训练", value: "150B" },
          { label: "主测", value: "H100 b=1" },
        ],
      },
    },
  };
}

const textBlock = {
  type: "text",
  body: ["成本定性：TiDAR 不是 training-free 插件。", "决策路径：先复现 1.5B，再评估 8B 投入。"],
};

const area = { x: 0.5, y: 1.0, w: 3.8, h: 4.7 };
const layout = layoutModuleStack(area, [evidenceBlock(), cardsBlock(), textBlock], "top_bottom", { layoutType: "three_column" });
assert.equal(layout.status, "ok");
assert.equal(layout.usedFallback, false);
assert.equal(layout.areas.length, 3);
assert(layout.areas[0].h >= layout.measures[0].minSize.h, "evidence should stay above readable floor");
assert(layout.areas[0].h > layout.measures[0].preferredSize.h, "evidence should grow within its measurement envelope before internal gaps expand");
assert(layout.areas[2].y > layout.areas[1].y, "blocks should be vertically ordered");
assert(Math.abs((layout.areas[0].y) - area.y) < 0.01, "first block should align to module body top");
assert(Math.abs((layout.areas[2].y + layout.areas[2].h) - (area.y + area.h)) < 0.01, "last block should align to module body bottom");
assert(layout.block_gaps.every((gap) => gap >= 0.12), "vertical gaps should stay on the spacing scale after growable evidence uses its envelope");
assert(Math.max(...layout.block_gaps) < 0.5, "layout should not create large blank gaps while evidence still has safe growth capacity");

const tight = layoutModuleStack({ ...area, h: 1.2 }, [evidenceBlock(), cardsBlock(), textBlock], "top_bottom", { layoutType: "three_column" });
assert.equal(tight.status, "infeasible");
assert(tight.diagnostics.some((item) => item.code === "layout_stack_infeasible"));

const tooNarrow = layoutModuleStack({ ...area, w: 2.45 }, [cardsBlock()], "top_bottom", { layoutType: "three_column" });
assert.equal(tooNarrow.status, "infeasible");
assert(tooNarrow.diagnostics.some((item) => item.code === "layout_kpi_row_width_too_small"));

const dynamicWidths = allocateMeasuredWidths([
  { min: 2.2, preferred: 3.2, maxUseful: 3.5 },
  { min: 2.2, preferred: 3.2, maxUseful: 3.5 },
  { min: 2.2, preferred: 4.4, maxUseful: 5.0 },
], 11.0);
assert(dynamicWidths[2] > dynamicWidths[0] + 0.4, "wide evidence column should receive more width before falling back to QA");
assert(Math.abs(dynamicWidths.reduce((sum, width) => sum + width, 0) - 11.0) < 0.01, "column widths should preserve total body width");

const syntheticBlocks = [{ type: "text", body: ["A"] }, { type: "text", body: ["B"] }];
const syntheticMeasures = syntheticBlocks.map((_, index) => ({
  primitive: { measureSupport: "measured", taxonomy_key: `synthetic_text_${index}` },
  minSize: { w: 0.8, h: 0.3 },
  preferredSize: { w: 1.0, h: 0.3 },
  maxUsefulSize: { w: 4.0, h: 0.3 },
  resizePolicy: "shrink_text",
  resizeLimits: { preserveAspect: false, textScale: { min: 1, max: 1 } },
  priority: 10,
  measurementArea: { x: 0, y: 0, w: 1, h: 2 },
  measurement: { ok: true, text_bounds: { w: 1, h: 0.3 } },
}));
const requestedConstraints = [];
const reflow = layoutModuleStack({ x: 0, y: 0, w: 6, h: 1 }, syntheticBlocks, "left_right", {
  premeasuredMeasures: syntheticMeasures,
  measureOnDemand: (block, constraintBox, context) => {
    requestedConstraints.push({ block, constraintBox, context });
    return {
      ...context.currentMeasure,
      preferredSize: { ...context.currentMeasure.preferredSize, w: constraintBox.w },
      maxUsefulSize: { ...context.currentMeasure.maxUsefulSize, w: constraintBox.w },
      measurementArea: constraintBox,
      measurement: { ok: true, text_bounds: { w: constraintBox.w, h: 0.3 } },
    };
  },
});
assert.equal(reflow.status, "ok");
assert.equal(requestedConstraints.length, 2, "layout should request missing measurement facts for final constraint boxes");
assert(reflow.measurementRefresh?.count >= 2, "layout should report that it refreshed measurement facts");
assert(reflow.measures.every((measure, index) => Math.abs(measure.measurementArea.w - reflow.areas[index].w) < 0.01), "refreshed measures should match final constraint boxes");

console.log("Module stack layout smoke passed.");
