"use strict";

const { listAiComponents } = require("./component_registry");

function listComponents() {
  return listAiComponents().map((entry) => ({
    tag: entry.tag,
    role: entry.role,
    maturity: entry.maturity,
    description: entry.description,
    requiredProps: entry.requiredProps,
    useWhen: entry.docs.useWhen,
    avoidWhen: entry.docs.avoidWhen,
  }));
}

if (require.main === module) {
  console.log(JSON.stringify(listComponents(), null, 2));
}

module.exports = {
  listComponents,
};
