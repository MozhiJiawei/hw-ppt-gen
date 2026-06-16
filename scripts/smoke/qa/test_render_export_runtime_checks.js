"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { runRenderExportChecks } = require("../../pptx/qa/render_export_checks");
const { validArtifacts } = require("./fixtures/artifact_fixtures");
const { assertIssueCliFeedback } = require("./assert_cli_feedback");

function mutate(mutator) {
  const artifacts = validArtifacts();
  mutator(artifacts);
  return artifacts;
}

function issues(artifacts) {
  return runRenderExportChecks(artifacts).issues;
}

function has(code, artifacts) {
  return issues(artifacts).some((issue) => issue.code === code);
}

function issueFor(code, artifacts) {
  const issue = issues(artifacts).find((item) => item.code === code);
  assertIssueCliFeedback(issue);
  return issue;
}

assert.equal(issues(validArtifacts()).length, 0);
issueFor("render_evidence_missing", mutate((a) => { a.exportedPngs = null; }));
issueFor("render_evidence_incomplete", mutate((a) => { a.exportedPngs = ["slide_01.png"]; }));
issueFor("render_animation_forbidden", mutate((a) => { a.pptxXml[0].xml = "<p:timing><p:anim /></p:timing>"; }));
issueFor("render_transition_forbidden", mutate((a) => { a.pptxXml[0].xml = "<p:transition />"; }));
issueFor("render_text_style_invalid", mutate((a) => { a.pptxXml[0].xml = "<a:rPr sz=\"900\"><a:latin typeface=\"Arial\"/><a:srgbClr val=\"12345678\"/></a:rPr>"; }));
issueFor("render_shape_style_invalid", mutate((a) => { a.pptxXml[1].xml = "<p:spPr><a:solidFill><a:srgbClr val=\"00FF00\"/></a:solidFill><a:ln w=\"20000\"/></p:spPr>"; }));
issueFor("render_visual_evidence_invalid", mutate((a) => { a.renderEvidence = { slides: [{ rendered: false }] }; }));
issueFor("render_visual_evidence_invalid", mutate((a) => { a.renderEvidence = { slides: ["slide_01.png"] }; }));
issueFor("render_visual_evidence_invalid", mutate((a) => { delete a.renderEvidence.slides[0].kind; }));
issueFor("render_visual_evidence_invalid", mutate((a) => { delete a.renderEvidence.slides[0].visual_role; }));
issueFor("render_visual_evidence_invalid", mutate((a) => {
  a.renderEvidence.slides[0] = { slide: 1, visual_component_id: "support_table", kind: "Matrix", template: "table", visual_role: "supporting_component", supporting_component: { id: "support_table" }, renderer: "ppt_native", rendered: true };
}));
issueFor("render_visual_evidence_invalid", mutate((a) => { delete a.renderEvidence.slides[0].renderer; }));
issueFor("render_visual_evidence_mismatch", mutate((a) => { a.renderEvidence.slides[0].template = "chart"; }));
issueFor("render_visual_evidence_mismatch", mutate((a) => { a.renderEvidence.slides[0].renderer = "rough_svg"; }));
issueFor("render_visual_evidence_mismatch", mutate((a) => { a.planVisuals = [{ slide: 2, id: "main_evidence", kind: "Evidence", template: "source_figure" }]; }));
issueFor("render_placeholder_present", mutate((a) => { a.visibleTextBySlide[1] = "TODO 待补充"; }));
issueFor("render_brief_visible_text_mismatch", mutate((a) => { a.visibleTextBySlide[1] = "缺少主文"; }));
assert(issues(mutate((a) => { a.exportedPngs = null; })).every((issue) => issue.location_quality === "artifact_only"));

{
  const root = path.resolve(__dirname, "..", "..", "..");
  const outDir = path.join(root, ".tmp", "render_export_runtime_checks");
  fs.mkdirSync(outDir, { recursive: true });
  const qaPath = path.join(outDir, "bad_render_qa.json");
  fs.writeFileSync(qaPath, JSON.stringify(mutate((a) => {
    a.exportedPngs = ["slide_01.png"];
    a.contentSlides = [1];
    a.renderEvidence = null;
  }), null, 2), "utf8");
  const cli = spawnSync(process.execPath, [
    "scripts/pptx/export_pptx_images.js",
    ".tmp/render_export_runtime_checks/fake.pptx",
    "--out",
    ".tmp/render_export_runtime_checks/slides",
    "--qa-artifacts",
    qaPath,
    "--qa-only",
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const output = `${cli.stdout || ""}${cli.stderr || ""}`;
  assert.notEqual(cli.status, 0, "export CLI should fail when render/export QA has error-level issues");
  assert(output.includes("Runtime render/export QA failed"), output);
  assert(output.includes("render_export:render_evidence_missing"), output);
  assert(output.includes("Artifact: render_evidence"), output);
  assert(!/^\s+at\s+\S+/m.test(output), output);
}

console.log("Runtime QA render/export checks passed.");
