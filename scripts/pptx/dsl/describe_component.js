"use strict";

const { getComponentContract, officialDrawIds } = require("./component_registry");
const { componentExampleToDomSnippet } = require("./example_snippets");
const { getLayoutAuthoringTag } = require("./layout_authoring_tags");

function describeComponent(tag) {
  const layoutTag = getLayoutAuthoringTag(tag);
  if (layoutTag) {
    return describeLayoutTag(layoutTag);
  }
  const contract = getComponentContract(tag);
  if (!contract || !contract.aiVisible) {
    throw new Error(`Unknown AI-visible Body DSL component: ${tag}`);
  }
  return {
    tag: contract.tag,
    role: contract.role,
    maturity: contract.maturity,
    description: contract.description,
    requiredProps: contract.requiredProps,
    propEnums: contract.propEnums,
    propLimits: contract.propLimits,
    layoutIntent: contract.layoutIntent,
    visual: contract.visual,
    docs: contract.docs,
    examples: contract.examples,
    authoringExamples: contract.examples.map((example) => componentExampleToDomSnippet(example)),
    officialDrawIds: contract.tag === "Visual" ? officialDrawIds() : undefined,
  };
}

function describeLayoutTag(contract) {
  return {
    tag: contract.tag,
    role: contract.role,
    maturity: contract.maturity,
    description: contract.description,
    requiredProps: contract.requiredProps,
    propEnums: {},
    propLimits: {},
    layoutIntent: {},
    visual: null,
    docs: contract.docs,
    examples: contract.examples,
    authoringExamples: contract.examples.map((example) => componentExampleToDomSnippet(example)),
    resolvedInternalTag: "Columns",
    resolvedProps: { type: contract.type },
  };
}

if (require.main === module) {
  const tag = process.argv[2];
  if (!tag) {
    console.error("Usage: node scripts/pptx/dsl/describe_component.js <ComponentTag>");
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(describeComponent(tag), null, 2));
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  describeComponent,
};
