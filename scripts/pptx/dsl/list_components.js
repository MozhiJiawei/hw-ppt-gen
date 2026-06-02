"use strict";

const { listAiComponents } = require("./component_registry");
const { listLayoutAuthoringTags } = require("./layout_authoring_tags");

function listComponents() {
  const layoutTags = listLayoutAuthoringTags().map((entry) => ({
    tag: entry.tag,
    role: entry.role,
    maturity: entry.maturity,
    description: entry.description,
    requiredProps: entry.requiredProps,
    useWhen: entry.docs.useWhen,
    avoidWhen: entry.docs.avoidWhen,
  }));
  const components = listAiComponents()
    .filter((entry) => entry.tag !== "Columns")
    .map((entry) => ({
      tag: entry.tag,
      role: entry.role,
      maturity: entry.maturity,
      description: entry.description,
      requiredProps: entry.requiredProps,
      useWhen: entry.docs.useWhen,
      avoidWhen: entry.docs.avoidWhen,
    }));
  return [...layoutTags, ...components];
}

if (require.main === module) {
  console.log(JSON.stringify(listComponents(), null, 2));
}

module.exports = {
  listComponents,
};
