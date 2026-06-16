"use strict";

const assert = require("assert");
const {
  ANCHOR_ELIGIBILITY,
} = require("../../pptx/contracts/visual_templates");
const {
  getComponentContract,
  listAiComponents,
  listComponentRegistry,
  PROOF_CLASS,
  validateRegisteredProps,
} = require("../../pptx/dsl/component_registry");

function main() {
  const evidence = getComponentContract("EvidenceFigure");
  assert(evidence, "EvidenceFigure should be registered");
  assert.equal(evidence.aiVisible, true);
  assert.equal(evidence.visual.kind, "Evidence");
  assert.equal(evidence.visual.template, "source_figure");
  assert.equal(evidence.visual.anchorEligibility, ANCHOR_ELIGIBILITY.REAL_ANCHOR);
  assert.equal(evidence.visual.proofClass, PROOF_CLASS.SOURCE_EVIDENCE);
  assert.equal(evidence.visual.proofPriority, 100);
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

  const evidenceChart = getComponentContract("EvidenceChart");
  assert.equal(evidenceChart.visual.proofClass, PROOF_CLASS.SOURCE_EVIDENCE);
  assert.equal(evidenceChart.visual.proofPriority, 100);
  assert(evidence.docs.repairHints.join(" ").includes("same source evidence identity"), "Evidence repair guidance should preserve source identity");

  const visual = getComponentContract("Visual");
  assert.equal(visual.visual.proofClass, PROOF_CLASS.GENERATED_DRAWING, "Visual should be explicit generated drawing");
  assert(visual.visual.proofPriority < evidence.visual.proofPriority, "generated drawing must rank below source evidence");
  assert(visual.docs.avoidWhen.includes("EvidenceFigure"), "Visual guidance should not replace source evidence");
  assert(visual.examples[0].props.source, "Visual example should keep source traceability visible");

  const cards = getComponentContract("KpiCards");
  assert.equal(cards.visual.anchorEligibility, ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT, "KPI cards are supporting components");
  assert.equal(cards.visual.proofClass, PROOF_CLASS.SUPPORTING_READOUT, "KPI cards are supporting readouts");
  const table = getComponentContract("Table");
  assert.equal(table.visual.anchorEligibility, ANCHOR_ELIGIBILITY.SUPPORTING_COMPONENT, "Table is a supporting component");
  assert.equal(table.visual.proofClass, PROOF_CLASS.SUPPORTING_READOUT, "Table is a supporting readout");
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
