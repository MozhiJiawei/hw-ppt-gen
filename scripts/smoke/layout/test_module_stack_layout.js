const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { layoutModuleStack } = require("../../pptx/layout/stack_layout");

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
    visual_anchor: {
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

const area = { x: 0.5, y: 1.0, w: 3.8, h: 4.1 };
const layout = layoutModuleStack(area, [evidenceBlock(), cardsBlock(), textBlock], "top_bottom", { layoutType: "three_column" });
assert.equal(layout.status, "ok");
assert.equal(layout.usedFallback, false);
assert.equal(layout.areas.length, 3);
assert(layout.areas[0].h >= layout.measures[0].minSize.h, "evidence should stay above readable floor");
assert(layout.areas[2].y > layout.areas[1].y, "blocks should be vertically ordered");

const tight = layoutModuleStack({ ...area, h: 1.2 }, [evidenceBlock(), cardsBlock(), textBlock], "top_bottom", { layoutType: "three_column" });
assert.equal(tight.status, "infeasible");
assert(tight.diagnostics.some((item) => item.code === "layout_stack_infeasible"));

const tooNarrow = layoutModuleStack({ ...area, w: 2.45 }, [cardsBlock()], "top_bottom", { layoutType: "three_column" });
assert.equal(tooNarrow.status, "infeasible");
assert(tooNarrow.diagnostics.some((item) => item.code === "layout_kpi_row_width_too_small"));

console.log("Module stack layout smoke passed.");
