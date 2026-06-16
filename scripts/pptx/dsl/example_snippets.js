"use strict";

function componentExampleToDomSnippet(example = {}, indent = 0) {
  const pad = " ".repeat(indent);
  const tag = authorTagFor(example.tag || "Component", example.props || {});
  const props = example.props || {};
  const children = example.children || [];
  const propsText = formatJsxProps(props, indent + 2);
  const open = propsText ? `<${tag} ${propsText}` : `<${tag}`;
  if (!children.length) return `${pad}${open} />`;
  const childText = children
    .map((child) => componentExampleToDomSnippet(child, indent + 2))
    .join("\n");
  return `${pad}${open}>\n${childText}\n${pad}</${tag}>`;
}

function formatJsxProps(props = {}, indent = 0) {
  return Object.entries(props || {})
    .filter(([key]) => !(key === "type" && ["two_column", "biased_column", "three_column", "four_column"].includes(props.type)))
    .map(([key, value]) => `${key}=${formatJsxValue(value, indent)}`)
    .join(" ");
}

function formatJsxValue(value, indent = 0) {
  if (typeof value === "string" && /^[\u4e00-\u9fa5A-Za-z0-9_ .:：,，。/-]+$/.test(value)) {
    return `"${value}"`;
  }
  const json = JSON.stringify(value, null, 2);
  if (!json || !json.includes("\n")) return `{${json}}`;
  const pad = " ".repeat(indent);
  return `{${json.split("\n").map((line, idx) => idx === 0 ? line : `${pad}${line}`).join("\n")}}`;
}

function authorTagFor(tag, props = {}) {
  if (tag !== "Columns") return tag;
  const map = {
    two_column: "TwoColumn",
    biased_column: "BiasedColumn",
    three_column: "ThreeColumn",
    four_column: "FourColumn",
  };
  return map[props.type] || "TwoColumn";
}

module.exports = {
  componentExampleToDomSnippet,
};
