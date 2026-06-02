"use strict";

const { getComponentContract, officialDrawIds } = require("./component_registry");
const { componentExampleToDomSnippet } = require("./example_snippets");

function describeComponent(tag) {
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

if (require.main === module) {
  const tag = process.argv[2];
  if (!tag) {
    console.error("Usage: node scripts/pptx/dsl/describe_component.js <ComponentTag>");
    process.exit(1);
  }
  console.log(JSON.stringify(describeComponent(tag), null, 2));
}

module.exports = {
  describeComponent,
};
