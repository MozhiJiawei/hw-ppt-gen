"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  createHuaweiDeck,
  repairPptxForPowerPointCom,
} = require("../../pptx/hw_pptx_helpers");
const {
  addVisualAnchorContentSlide,
  collectBodyPipelinePages,
} = require("../../pptx/hw_visual_anchor_slide");
const { compileSlideDsl } = require("../../pptx/dsl/compile_slide_dsl");
const { describeComponent } = require("../../pptx/dsl/describe_component");
const { listComponents } = require("../../pptx/dsl/list_components");
const { buildDslComponentMatrixFixtures } = require("./fixtures/dsl_component_matrix_fixtures");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "dsl_component_matrix");
const SOURCE_DIR = path.join(OUT_DIR, "sources");
const PPTX_OUT = path.join(OUT_DIR, "dsl_component_matrix.pptx");
const EXPOSURE_OUT = path.join(OUT_DIR, "dsl_component_agent_exposure.json");
const COMPILE_OUT = path.join(OUT_DIR, "dsl_component_compile_report.json");
const MEASURE_OUT = path.join(OUT_DIR, "dsl_component_measurement_report.json");

async function main() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  writeSources();

  const fixtures = buildDslComponentMatrixFixtures(ROOT);
  const aiComponents = listComponents();
  const fixtureTags = fixtures.map((fixture) => fixture.tag).sort();
  assert.deepStrictEqual(
    fixtureTags,
    aiComponents.map((component) => component.tag).sort(),
    "every AI-visible DSL component must have a component-matrix fixture"
  );

  const exposureRows = aiComponents.map((component) => {
    const detail = describeComponent(component.tag);
    assert(detail.description, `${component.tag} should explain itself to agents`);
    assert(detail.docs.useWhen, `${component.tag} should tell agents when to use it`);
    assert(detail.docs.avoidWhen, `${component.tag} should tell agents when not to use it`);
    assert(detail.docs.budgetHints.length, `${component.tag} should expose budget hints`);
    assert(detail.docs.repairHints.length, `${component.tag} should expose repair hints`);
    assert(detail.examples.length, `${component.tag} should expose examples`);
    return {
      tag: detail.tag,
      role: detail.role,
      maturity: detail.maturity,
      description: detail.description,
      requiredProps: detail.requiredProps,
      layoutIntent: detail.layoutIntent,
      visual: detail.visual,
      docs: detail.docs,
      authoringExample: detail.authoringExamples[0],
    };
  });
  fs.writeFileSync(EXPOSURE_OUT, JSON.stringify(exposureRows, null, 2), "utf8");

  const compileRows = [];
  for (const fixture of fixtures) {
    assert(fixture.markup && fixture.markup.includes("<"), `${fixture.tag} fixture should expose JSX-like authoring markup`);
    const result = compileSlideDsl(fixture.bodyDsl, { throwOnError: false });
    assert.equal(result.ok, true, `${fixture.tag} fixture should compile: ${result.feedbackIssues.map((issue) => issue.message).join("; ")}`);
    compileRows.push({
      tag: fixture.tag,
      kind: fixture.kind,
      markup: fixture.markup,
      renderModel: compactRenderModel(result.renderModel),
      feedbackIssues: result.feedbackIssues,
    });
  }
  fs.writeFileSync(COMPILE_OUT, JSON.stringify(compileRows, null, 2), "utf8");

  const pptx = createHuaweiDeck({ title: "DSL Component Matrix" });
  fixtures.filter((fixture) => fixture.kind === "renderable").forEach((fixture, idx) => {
    addVisualAnchorContentSlide(pptx, {
      page: String(idx + 1).padStart(2, "0"),
      title: `DSL 原子组件：${fixture.tag}`,
      sections: ["DSL"],
      currentSection: "DSL",
      summary: { body: [{ label: "组件", text: `${fixture.tag} fixture 编译、测量和渲染路径检查。` }] },
      bodyDsl: fixture.bodyDsl,
    });
  });
  const renderedLayoutPages = collectBodyPipelinePages(pptx);
  await pptx.writeFile({ fileName: PPTX_OUT });
  await repairPptxForPowerPointCom(PPTX_OUT);

  const measurementRows = fixtures
    .filter((fixture) => fixture.kind === "renderable")
    .map((fixture) => measurementRowForFixture(fixture, renderedLayoutPages));
  fs.writeFileSync(MEASURE_OUT, JSON.stringify(measurementRows, null, 2), "utf8");

  console.log(`DSL component matrix tests passed: ${PPTX_OUT}`);
}

function measurementRowForFixture(fixture, renderedLayoutPages) {
  const blocks = renderedLayoutPages
    .flatMap((entry) => entry.layoutInfo?.module_layouts || [])
    .flatMap((moduleLayout) => moduleLayout.block_areas || [])
    .filter((block) => block.source_component?.tag === fixture.tag);
  const compileNodes = renderedLayoutPages
    .flatMap((entry) => entry.compileIr?.visiblePrimitives || [])
    .filter((node) => node.sourceComponent?.tag === fixture.tag);
  assert(compileNodes.length > 0, `${fixture.tag} should have a source-mapped primitive in production CompileIR`);
  assert(blocks.length > 0, `${fixture.tag} should have a source-mapped block in layout measurement data`);
  const block = blocks[0];
  const measure = block.measure;
  assert(measure, `${fixture.tag} should record COM-backed measure data`);
  assertPositiveSize(measure.min_size, `${fixture.tag} min_size`);
  assertPositiveSize(measure.preferred_size, `${fixture.tag} preferred_size`);
  assertPositiveSize(measure.max_useful_size, `${fixture.tag} max_useful_size`);
  assertPositiveSize(block.final_size, `${fixture.tag} final_size`);
  assert(measure.preferred_size.w >= measure.min_size.w - 0.001, `${fixture.tag} preferred width should be >= min width`);
  assert(measure.preferred_size.h >= measure.min_size.h - 0.001, `${fixture.tag} preferred height should be >= min height`);
  assert(measure.max_useful_size.w >= measure.preferred_size.w - 0.001, `${fixture.tag} max width should be >= preferred width`);
  assert(measure.max_useful_size.h >= measure.preferred_size.h - 0.001, `${fixture.tag} max height should be >= preferred height`);

  const expected = fixture.expected || {};
  if (expected.visualRole !== "text") {
    const entry = renderedLayoutPages
      .flatMap((page) => page.renderedVisuals || [])
      .find((item) => item.visual_component_id === expected.componentId);
    assert(entry, `${fixture.tag} should render visual evidence for ${expected.componentId}`);
    assert.equal(entry.visual_role, expected.visualRole, `${fixture.tag} visual role should match registry expectation`);
    assert.equal(entry.kind, expected.kind, `${fixture.tag} visual kind should match`);
    assert.equal(entry.template, expected.template, `${fixture.tag} visual template should match`);
    assert.equal(entry.rendered, true, `${fixture.tag} visual evidence should be rendered`);
  }

  return {
    tag: fixture.tag,
    expected,
    sourceComponent: block.source_component,
    taxonomy: block.taxonomy,
    measure,
    finalSize: block.final_size,
    area: block.area,
    visibleArea: block.visible_area,
  };
}

function writeSources() {
  writeSvg("figure", "DSL Figure", 960, 540);
  writeSvg("chart", "DSL Chart", 960, 540);
  writeSvg("table", "DSL Table", 960, 540);
  writeSvg("screenshot", "DSL Screenshot", 960, 540);
}

function writeSvg(name, label, width, height) {
  const fileName = path.join(SOURCE_DIR, `${name}.svg`);
  fs.writeFileSync(fileName, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <rect x="40" y="60" width="${width - 80}" height="${height - 150}" fill="#f7f7f7" stroke="#c00000" stroke-width="8"/>
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="42" font-family="Microsoft YaHei">${label}</text>
</svg>`, "utf8");
}

function assertPositiveSize(size, label) {
  assert(size, `${label} should exist`);
  assert(Number(size.w) > 0, `${label}.w should be positive`);
  assert(Number(size.h) > 0, `${label}.h should be positive`);
}

function compactRenderModel(model) {
  return {
    type: model.type,
    reference: model.reference,
    source: model.source,
    modules: model.modules.map((module) => ({
      role: module.role,
      title: module.title,
      componentPrimitives: module.componentPrimitives.map((primitive) => ({
        type: primitive.type,
        kind: primitive.visual_anchor?.kind || primitive.component?.kind,
        template: primitive.visual_anchor?.template || primitive.component?.template,
        sourceComponent: primitive.sourceComponent,
      })),
    })),
  };
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
