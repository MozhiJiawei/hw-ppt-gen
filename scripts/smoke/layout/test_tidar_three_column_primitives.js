const assert = require("assert");
const path = require("path");
const { createTidarPrimitiveFixture } = require("./fixtures/tidar_three_column_primitives");
const { layoutModuleStack } = require("../../pptx/layout/stack_layout");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const fixture = createTidarPrimitiveFixture(ROOT);
fixture.area.w = 3.95;

for (const [idx, module] of fixture.modules.entries()) {
  const result = layoutModuleStack(fixture.area, module.blocks, "top_bottom", { layoutType: "three_column" });
  assert.equal(result.status, "ok", `${module.title} should fit measured three-column stack`);
  assert.equal(result.usedFallback, false, `${module.title} should not need legacy fallback`);
  assert.equal(result.areas.length, 3, `${module.title} should allocate evidence, KPI, and bullets`);
  const evidence = result.measures[0];
  assert.equal(evidence.primitive.taxonomy_key, "Evidence.SourceFigure");
  assert(result.areas[0].h >= evidence.minSize.h, `${module.title} evidence should stay above floor`);
  assert(result.measures[1].primitive.taxonomy_key === "QuantitativeReadout.KpiCardRow");
  assert(result.measures[2].primitive.taxonomy_key === "StructuredText.RichBulletBlock");
  assert(result.areas[0].y < result.areas[1].y && result.areas[1].y < result.areas[2].y, `${module.title} blocks should preserve vertical order`);
  assert(result.diagnostics.every((item) => item.severity !== "error"), `${module.title} should not emit hard diagnostics`);
  assert(idx >= 0);
}

const overloaded = {
  ...fixture.modules[0],
  blocks: [
    ...fixture.modules[0].blocks,
    fixture.modules[0].blocks[1],
    { type: "text", body: ["额外长结论：这里模拟继续塞内容导致预算不可行。", "额外边界：排版器应该报告预算问题。"] },
  ],
};
const tight = layoutModuleStack({ ...fixture.area, h: 2.0 }, overloaded.blocks, "top_bottom", { layoutType: "three_column" });
assert.equal(tight.status, "infeasible");
assert(tight.diagnostics.some((item) => item.code === "layout_stack_infeasible"));

console.log("TiDAR three-column primitive layout smoke passed.");
