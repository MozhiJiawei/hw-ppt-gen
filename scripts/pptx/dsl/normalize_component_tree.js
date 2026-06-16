"use strict";

const {
  getComponentContract,
  validateRegisteredProps,
} = require("./component_registry");
const { createFeedbackIssue } = require("../feedback/feedback_issue");

function normalizeComponentTree(source, options = {}) {
  const issues = [];
  const tree = normalizeNode(source, {
    path: options.path || "bodyDsl",
    selector: options.selector || "bodyDsl",
    semanticStack: [],
    parent: null,
    issues,
  });
  return { tree, issues };
}

function normalizeNode(node, context) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    context.issues.push(issue("dsl_node_invalid", context, "Body DSL node must be a JSX-like element such as <TwoColumn><Module>...</Module></TwoColumn>."));
    return null;
  }
  const tag = safeText(node.tag || node.type || node.component);
  const meta = node.props?.__dsl || node.__dsl || {};
  const nodeContext = {
    ...context,
    selector: meta.selector || node.source?.selector || (context.parent ? context.selector : `${context.selector} > ${tag || "Unknown"}`),
    path: node.source?.path || context.path,
    sourceSpan: meta.sourceSpan || node.source?.sourceSpan,
    codeFrame: meta.codeFrame || node.source?.codeFrame,
  };
  const props = node.props || node.attrs ? normalizeProps(node.props || node.attrs, false) : normalizeProps(node, true);
  const children = Array.isArray(node.children) ? node.children : [];
  const contract = getComponentContract(tag);
  const semanticStack = [
    ...(context.semanticStack || []),
    semanticStackFrame(tag, props, nodeContext),
  ];

  for (const message of validateRegisteredProps(tag, props)) {
    context.issues.push(issue("dsl_component_prop_invalid", { ...nodeContext, semanticStack }, message, { tag }));
  }
  if (contract?.childTags?.length) {
    children.forEach((child, idx) => {
      const childTag = safeText(child?.tag || child?.type || child?.component);
      if (childTag && !contract.childTags.includes(childTag)) {
        context.issues.push(issue(
          "dsl_child_component_invalid",
          childContext({ ...nodeContext, semanticStack }, child, childTag, idx),
          `${tag} cannot contain ${childTag}; allowed children: ${contract.childTags.join(", ")}.`,
          { tag, childTag }
        ));
      }
    });
  }

  const normalized = {
    tag,
    role: contract?.role || "unknown",
    props,
    contract,
    source: { path: nodeContext.path, selector: nodeContext.selector, semanticStack, sourceSpan: nodeContext.sourceSpan, codeFrame: nodeContext.codeFrame },
    children: [],
  };
  normalized.children = children
    .map((child, idx) => normalizeNode(child, {
      path: `${context.path}.children[${idx}]`,
      selector: childSelector(nodeContext.selector, safeText(child?.tag || child?.type || child?.component) || "Unknown", idx),
      sourceSpan: child?.props?.__dsl?.sourceSpan || child?.source?.sourceSpan,
      codeFrame: child?.props?.__dsl?.codeFrame || child?.source?.codeFrame,
      semanticStack,
      parent: normalized,
      issues: context.issues,
    }))
    .filter(Boolean);
  return normalized;
}

function normalizeProps(input = {}, stripNodeKeys = false) {
  const out = {};
  const reserved = new Set(["tag", "type", "component", "children", "attrs", "props", "__dsl"]);
  for (const [key, value] of Object.entries(input || {})) {
    if (!stripNodeKeys || !reserved.has(key)) out[key] = value;
  }
  delete out.__dsl;
  return out;
}

function childContext(context, child, tag, idx) {
  const meta = child?.props?.__dsl || child?.__dsl || {};
  const source = child?.source || {};
  return {
    ...context,
    path: `${context.path}.children[${idx}]`,
    selector: childSelector(context.selector, tag, idx),
    sourceSpan: meta.sourceSpan || source.sourceSpan,
    codeFrame: meta.codeFrame || source.codeFrame,
  };
}

function childSelector(parentSelector, tag, idx) {
  return `${parentSelector} > ${tag}:nth-child(${idx + 1})`;
}

function issue(code, context, message, details = {}) {
  const structuredDetails = detailsForCompilerIssue(message, details);
  return createFeedbackIssue({
    code,
    severity: "error",
    phase: "compile",
    target: { path: context.path, selector: context.selector, semanticStack: context.semanticStack, sourceSpan: context.sourceSpan, codeFrame: context.codeFrame },
    message,
    details: { path: context.path, selector: context.selector, ...details, ...structuredDetails },
    repairs: [
      "Use discovered JSX-like DSL tags such as <TwoColumn>, <Module>, or another tag from list_components.",
      "Remove manual style/coordinate props and express only constrained layout intent.",
    ],
  });
}

function detailsForCompilerIssue(message, details = {}) {
  const requiredProp = /^([A-Za-z][A-Za-z0-9_]*) requires props\.([A-Za-z][A-Za-z0-9_]*)\.$/.exec(message || "");
  if (!requiredProp) return {};
  const componentTag = details.tag || requiredProp[1];
  return {
    componentTag,
    missingProps: [requiredProp[2]],
  };
}

function semanticStackFrame(tag, props = {}, context = {}) {
  return {
    tag,
    id: props.id,
    title: props.title || props.label,
    path: context.path,
    selector: context.selector,
    sourceSpan: context.sourceSpan,
  };
}

function safeText(value) {
  return String(value ?? "").trim();
}

module.exports = {
  normalizeComponentTree,
};
