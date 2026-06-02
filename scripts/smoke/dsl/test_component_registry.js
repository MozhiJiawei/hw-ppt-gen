"use strict";

const assert = require("assert");
const {
  ANCHOR_ELIGIBILITY,
} = require("../../pptx/contracts/visual_templates");
const {
  getComponentContract,
  listAiComponents,
  listComponentRegistry,
  validateRegisteredProps,
} = require("../../pptx/dsl/component_registry");

function main() {
  const evidence = getComponentContract("EvidenceFigure");
  assert(evidence, "EvidenceFigure should be registered");
  assert.equal(evidence.aiVisible, true);
  assert.equal(evidence.visual.kind, "Evidence");
  assert.equal(evidence.visual.template, "source_figure");
  assert.equal(evidence.visual.anchorEligibility, ANCHOR_ELIGIBILITY.REAL_ANCHOR);
  assert.equal(evidence.measureSupport, "measured");
  assert.equal(evidence.resizePolicy, "preserve_aspect");
  assert.deepStrictEqual(validateRegisteredProps("EvidenceFigure", {
    id: "e1",
    title: "证据",
    claim: "证据支撑判断。",
    source: { path: ".tmp/source.png" },
    fit: "contain",
  }), []);
  assert(validateRegisteredProps("EvidenceFigure", {
    id: "e1",
    title: "证据",
    claim: "证据支撑判断。",
    source: { path: ".tmp/source.png" },
    fit: "stretch",
  }).some((message) => message.includes("fit=stretch")), "stretch must be rejected for evidence");
  assert(validateRegisteredProps("EvidenceFigure", {
    id: "e1",
    title: "证据",
    claim: "证据支撑判断。",
    source: { path: ".tmp/source.png" },
    style: { width: "50%" },
  }).some((message) => message.includes("style")), "arbitrary style must be rejected");

  const cards = getComponentContract("KpiCards");
  assert.equal(cards.visual.anchorEligibility, ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT, "KPI cards are supporting components");
  const table = getComponentContract("Table");
  assert.equal(table.visual.anchorEligibility, ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT, "Table is a supporting component");
  const stack = getComponentContract("CapabilityStack");
  assert.equal(stack.visual.anchorEligibility, ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT, "Capability stack is a supporting component");

  const internal = getComponentContract("RawVisualSpec");
  assert(internal && internal.aiVisible === false, "internal entries should be registry-valid but AI-hidden");
  assert(!listAiComponents().some((entry) => entry.tag === "RawVisualSpec"), "internal entries must be absent from AI-visible list");
  assert(listComponentRegistry({ includeInternal: true }).some((entry) => entry.tag === "RawVisualSpec"), "internal entries should be discoverable for maintainers");

  for (const entry of listAiComponents()) {
    assert(entry.description, `${entry.tag} must include description`);
    assert(entry.docs.useWhen, `${entry.tag} must include use guidance`);
    assert(entry.docs.avoidWhen, `${entry.tag} must include avoid guidance`);
    assert(entry.docs.budgetHints.length, `${entry.tag} must include budget hints`);
    assert(entry.docs.repairHints.length, `${entry.tag} must include repair hints`);
    assert(entry.examples.length, `${entry.tag} must include an example`);
  }

  console.log("component registry tests passed");
}

main();
