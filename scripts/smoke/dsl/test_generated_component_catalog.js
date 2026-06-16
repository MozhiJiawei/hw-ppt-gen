"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_DETAIL_DIR,
  DEFAULT_OUT,
  generateComponentCatalog,
  writeComponentCatalog,
} = require("../../pptx/dsl/generate_component_catalog");

function main() {
  const markdown = generateComponentCatalog();
  assert(markdown.includes("<EvidenceFigure>"), "catalog should document EvidenceFigure");
  assert(markdown.includes("<Visual draw=\"Kind/template\" model={...} source={source}"), "catalog should teach draw as the generated drawing entry");
  assert(markdown.includes("source_evidence > generated_drawing > supporting_readout > text"), "catalog should expose proof hierarchy");
  assert(markdown.includes("keep that same source evidence through QA repair"), "catalog should preserve authored source evidence through repair");
  assert(markdown.includes("Quantity/bar_chart"), "catalog should index generated chart draw capabilities");
  assert(markdown.includes("Loop/closed_loop"), "catalog should index official loop draw capabilities");
  assert(markdown.includes("Network/hub_spoke_network"), "catalog should index official network draw capabilities");
  assert(markdown.includes("generated_dsl_component_details/quantity_bar_chart.md"), "catalog should link draw detail files");
  assert(!markdown.includes("RawVisualSpec"), "catalog should hide internal components");
  assert(!markdown.includes("### BarChart"), "draw capabilities should not become top-level JSX tags");

  writeComponentCatalog(DEFAULT_OUT);
  const fileText = fs.readFileSync(DEFAULT_OUT, "utf8");
  assert.equal(fileText, markdown, "generated catalog file should match registry output");
  assert.equal(path.basename(DEFAULT_OUT), "generated_dsl_component_catalog.md");
  const detail = fs.readFileSync(path.join(DEFAULT_DETAIL_DIR, "quantity_bar_chart.md"), "utf8");
  assert(detail.includes('<Visual id="bar_chart_1"'), "draw detail should show Visual DSL");
  assert(detail.includes("source={source}"), "draw detail should keep Visual source traceability visible");
  assert(detail.includes("generated drawing, not source evidence"), "draw detail should distinguish hand-drawn Visual from source evidence");
  assert(detail.includes("should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>`"), "draw detail should preserve source evidence identity");
  assert(detail.includes('draw="Quantity/bar_chart"'), "draw detail should pin the native draw id");
  assert(detail.includes('"y_label"'), "draw detail should include model fields");

  console.log(`generated component catalog tests passed: ${DEFAULT_OUT}`);
}

main();
