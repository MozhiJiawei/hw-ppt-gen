"use strict";

const assert = require("assert");
const { runRenderExportChecks } = require("../../pptx/qa/render_export_checks");
const { validArtifacts } = require("./fixtures/artifact_fixtures");

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

assert.equal(issues(validArtifacts()).length, 0);
assert(has("render_evidence_missing", mutate((a) => { a.exportedPngs = null; })));
assert(has("render_evidence_incomplete", mutate((a) => { a.exportedPngs = ["slide_01.png"]; })));
assert(has("render_animation_forbidden", mutate((a) => { a.pptxXml[0].xml = "<p:timing><p:anim /></p:timing>"; })));
assert(has("render_transition_forbidden", mutate((a) => { a.pptxXml[0].xml = "<p:transition />"; })));
assert(has("render_text_style_invalid", mutate((a) => { a.pptxXml[0].xml = "<a:rPr sz=\"900\"><a:latin typeface=\"Arial\"/><a:srgbClr val=\"12345678\"/></a:rPr>"; })));
assert(has("render_shape_style_invalid", mutate((a) => { a.pptxXml[1].xml = "<p:spPr><a:solidFill><a:srgbClr val=\"00FF00\"/></a:solidFill><a:ln w=\"20000\"/></p:spPr>"; })));
assert(has("render_visual_manifest_invalid", mutate((a) => { a.renderManifest = { slides: [{ rendered: false }] }; })));
assert(has("render_visual_manifest_invalid", mutate((a) => { a.renderManifest = { slides: ["slide_01.png"] }; })));
assert(has("render_visual_manifest_invalid", mutate((a) => { delete a.renderManifest.slides[0].kind; })));
assert(has("render_visual_manifest_invalid", mutate((a) => { delete a.renderManifest.slides[0].visual_role; })));
assert(has("render_visual_manifest_invalid", mutate((a) => {
  a.renderManifest.slides[0] = { slide: 1, visual_component_id: "support_table", kind: "Matrix", template: "table", visual_role: "supporting_component", supporting_component: { id: "support_table" }, renderer: "ppt_native", rendered: true };
})));
assert(has("render_visual_manifest_invalid", mutate((a) => { delete a.renderManifest.slides[0].renderer; })));
assert(has("render_visual_manifest_mismatch", mutate((a) => { a.renderManifest.slides[0].template = "chart"; })));
assert(has("render_visual_manifest_mismatch", mutate((a) => { a.renderManifest.slides[0].renderer = "rough_svg"; })));
assert(has("render_visual_manifest_mismatch", mutate((a) => { a.planVisuals = [{ slide: 2, id: "main_evidence", kind: "Evidence", template: "source_figure" }]; })));
assert(has("render_placeholder_present", mutate((a) => { a.visibleTextBySlide[1] = "TODO 待补充"; })));
assert(has("render_brief_visible_text_mismatch", mutate((a) => { a.visibleTextBySlide[1] = "缺少主文"; })));
assert(issues(mutate((a) => { a.exportedPngs = null; })).every((issue) => issue.location_quality === "artifact_only"));

console.log("Runtime QA render/export checks passed.");
