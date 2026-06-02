"use strict";

const assert = require("assert");
const { listComponents } = require("../../pptx/dsl/list_components");
const { describeComponent } = require("../../pptx/dsl/describe_component");

function main() {
  const index = listComponents();
  assert(index.some((entry) => entry.tag === "EvidenceFigure"), "AI index should list EvidenceFigure");
  assert(index.some((entry) => entry.tag === "Visual"), "AI index should list the Visual escape hatch");
  assert(!index.some((entry) => entry.tag === "RawVisualSpec"), "AI index must hide internal components");

  const evidence = describeComponent("EvidenceFigure");
  assert.equal(evidence.visual.kind, "Evidence");
  assert.equal(evidence.visual.template, "source_figure");
  assert(evidence.docs.useWhen);
  assert(evidence.docs.avoidWhen);
  assert(evidence.docs.budgetHints.length);
  assert(evidence.docs.repairHints.length);
  assert(evidence.examples.length);
  assert(evidence.authoringExamples.some((item) => item.includes("<EvidenceFigure")), "detail should teach JSX-like component syntax");

  const visual = describeComponent("Visual");
  assert(visual.officialDrawIds.includes("Sequence/process"), "Visual detail should expose official draw ids");
  assert(visual.authoringExamples.some((item) => item.includes("<Visual")), "Visual detail should show JSX-like authoring syntax");
  assert.throws(() => describeComponent("RawVisualSpec"), /Unknown AI-visible/, "internal detail should not be AI-visible");

  console.log("component discovery catalog tests passed");
}

main();
