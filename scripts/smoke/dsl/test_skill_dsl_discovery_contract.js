"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { listComponents } = require("../../pptx/dsl/list_components");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SKILL = path.join(ROOT, "SKILL.md");

function main() {
  const skill = fs.readFileSync(SKILL, "utf8");

  assert(skill.includes("references/slide_dsl_authoring_schema.md"), "SKILL should point agents at the stable Body DSL authoring schema");
  assert(skill.includes("references/generated_dsl_component_catalog.md"), "SKILL should point agents at the generated component catalog");
  assert(skill.includes("JSX-like markup"), "SKILL should frame DSL syntax like web/JSX authoring");
  assert(skill.includes("scripts/pptx/dsl/jsx_dsl.js"), "SKILL should point agents at the JSX-like parser");
  assert(skill.includes("node scripts/pptx/dsl/list_components.js"), "SKILL should expose the component index discovery command");
  assert(skill.includes("node scripts/pptx/dsl/describe_component.js <ComponentTag>"), "SKILL should expose per-component discovery");
  assert(skill.includes("bodyDsl"), "SKILL should instruct agents to author bodyDsl");
  assert(!skill.includes("_plan.json"), "SKILL must not teach agents to write old plan artifacts for body authoring");
  assert(!skill.includes("--require-plan"), "SKILL QA command must not require old plan artifacts");
  assert(!skill.includes("visual-anchor `claim`"), "SKILL must not teach visual_anchor authoring vocabulary");
  assert(!skill.includes("Use `Evidence` anchors"), "SKILL must not teach old Evidence anchor authoring");

  const aiVisibleTags = listComponents().map((entry) => entry.tag);
  const leakedTags = aiVisibleTags.filter((tag) => {
    if (tag === "Visual") return false;
    return skill.includes(`\`${tag}\``)
      || skill.includes(`"${tag}"`)
      || skill.includes(`<${tag}`);
  });
  assert.deepStrictEqual(
    leakedTags,
    [],
    "SKILL should not hand-list AI-visible component tags; agents must discover them from registry outputs"
  );

  console.log("SKILL Body DSL discovery contract tests passed");
}

main();
