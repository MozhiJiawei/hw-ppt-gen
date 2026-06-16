"use strict";

const { listAiComponents } = require("./component_registry");

function h(tag, props = {}, ...children) {
  const normalizedProps = props && typeof props === "object" && !Array.isArray(props) ? props : {};
  const normalizedChildren = props && (typeof props !== "object" || Array.isArray(props))
    ? [props, ...children]
    : children;
  return {
    tag,
    props: normalizedProps,
    children: normalizedChildren.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false),
  };
}

function createDslComponents() {
  const entries = {};
  for (const component of listAiComponents()) {
    entries[component.tag] = (props = {}, ...children) => h(component.tag, props, ...children);
  }
  return Object.freeze(entries);
}

const dsl = createDslComponents();

module.exports = {
  createDslComponents,
  dsl,
  h,
};
