"use strict";

const { h } = require("./components");

const LAYOUT_TAGS = Object.freeze({
  TwoColumn: "two_column",
  BiasedColumn: "biased_column",
  ThreeColumn: "three_column",
  FourColumn: "four_column",
});

function parseSlideBodyDsl(markup, scope = {}) {
  const root = parseJsxLikeMarkup(markup, scope);
  if (!root) {
    throw new Error("Body DSL markup must contain a root element.");
  }
  annotateSelectors(root);
  if (root.tag === "Slide") {
    const bodyRoot = root.children.find((child) => child && typeof child === "object");
    if (!bodyRoot) throw new Error("<Slide> must contain a body layout such as <TwoColumn>.");
    return {
      slideProps: root.props || {},
      bodyDsl: bodyRoot,
      root,
    };
  }
  return {
    slideProps: {},
    bodyDsl: root,
    root,
  };
}

function annotateSelectors(node, parentSelector = "", childIndex = null) {
  if (!node || typeof node !== "object") return;
  const meta = node.props?.__dsl || {};
  const tag = meta.selectorTag || meta.authorTag || node.tag;
  const localSelector = childIndex === null ? tag : `${tag}:nth-child(${childIndex + 1})`;
  const selector = parentSelector ? `${parentSelector} > ${localSelector}` : localSelector;
  node.props = {
    ...(node.props || {}),
    __dsl: {
      ...meta,
      selector,
    },
  };
  (node.children || []).forEach((child, idx) => annotateSelectors(child, selector, idx));
}

function parseJsxLikeMarkup(markup, scope = {}) {
  const input = String(markup || "");
  const stack = [];
  let root = null;
  let pos = 0;

  while (pos < input.length) {
    const open = input.indexOf("<", pos);
    if (open < 0) break;
    if (input.startsWith("<!--", open)) {
      const closeComment = input.indexOf("-->", open + 4);
      if (closeComment < 0) throw new Error("Unclosed JSX comment in Body DSL markup.");
      pos = closeComment + 3;
      continue;
    }
    const close = findTagClose(input, open + 1);
    if (close < 0) throw new Error("Unclosed JSX tag in Body DSL markup.");
    const rawTag = input.slice(open + 1, close).trim();
    pos = close + 1;
    if (!rawTag || rawTag.startsWith("!")) continue;

    if (rawTag.startsWith("/")) {
      const closeTag = rawTag.slice(1).trim();
      const frame = stack.pop();
      if (!frame || frame.authorTag !== closeTag) {
        throw new Error(`Mismatched Body DSL closing tag </${closeTag}>.`);
      }
      appendNode(frame.node);
      continue;
    }

    const selfClosing = rawTag.endsWith("/");
    const body = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const firstSpace = body.search(/\s/);
    const authorTag = firstSpace < 0 ? body : body.slice(0, firstSpace);
    const attrText = firstSpace < 0 ? "" : body.slice(firstSpace + 1);
    const props = parseProps(attrText, scope);
    const node = createNode(authorTag, props, []);
    const frame = { authorTag, node };

    if (selfClosing) {
      appendNode(node);
    } else {
      stack.push(frame);
    }
  }

  if (stack.length) {
    throw new Error(`Unclosed Body DSL tag <${stack[stack.length - 1].authorTag}>.`);
  }
  return root;

  function appendNode(node) {
    const parent = stack[stack.length - 1]?.node;
    if (parent) {
      parent.children.push(node);
    } else if (!root) {
      root = node;
    } else {
      throw new Error("Body DSL markup must have a single root element.");
    }
  }
}

function createNode(authorTag, props, children) {
  if (!authorTag) throw new Error("Body DSL element is missing a tag name.");
  if (authorTag === "Slide") return h("Slide", withSource(authorTag, props, authorTag), children);
  if (LAYOUT_TAGS[authorTag]) {
    return h("Columns", withSource(authorTag, { ...props, type: LAYOUT_TAGS[authorTag] }, authorTag), children);
  }
  return h(authorTag, withSource(authorTag, props, authorTag), children);
}

function withSource(authorTag, props, selectorTag) {
  return {
    ...props,
    __dsl: {
      authorTag,
      selectorTag: selectorTag || authorTag,
    },
  };
}

function parseProps(attrText, scope) {
  const props = {};
  let pos = 0;
  const text = String(attrText || "");

  while (pos < text.length) {
    while (/\s/.test(text[pos] || "")) pos += 1;
    if (pos >= text.length) break;

    const nameMatch = /^[A-Za-z_][\w:-]*/.exec(text.slice(pos));
    if (!nameMatch) throw new Error(`Invalid Body DSL prop near: ${text.slice(pos, pos + 24)}`);
    const name = nameMatch[0];
    pos += name.length;
    while (/\s/.test(text[pos] || "")) pos += 1;

    if (text[pos] !== "=") {
      props[name] = true;
      continue;
    }
    pos += 1;
    while (/\s/.test(text[pos] || "")) pos += 1;

    const quote = text[pos];
    if (quote === "\"" || quote === "'") {
      const end = text.indexOf(quote, pos + 1);
      if (end < 0) throw new Error(`Unclosed string prop ${name}.`);
      props[name] = text.slice(pos + 1, end);
      pos = end + 1;
      continue;
    }

    if (text[pos] === "{") {
      const end = findExpressionClose(text, pos);
      if (end < 0) throw new Error(`Unclosed expression prop ${name}.`);
      props[name] = resolveExpression(text.slice(pos + 1, end), scope);
      pos = end + 1;
      continue;
    }

    const bare = /^[^\s>]+/.exec(text.slice(pos));
    if (!bare) throw new Error(`Missing value for prop ${name}.`);
    props[name] = bare[0];
    pos += bare[0].length;
  }
  return props;
}

function resolveExpression(expression, scope) {
  const expr = String(expression || "").trim();
  if (!expr) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  if (expr === "true") return true;
  if (expr === "false") return false;
  if (expr === "null") return null;
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(expr)) {
    return expr.split(".").reduce((value, key) => value == null ? undefined : value[key], scope);
  }
  try {
    return Function("scope", `with (scope) { return (${expr}); }`)(scope);
  } catch (error) {
    throw new Error(`Cannot resolve Body DSL expression {${expr}}: ${error.message}`);
  }
}

function findTagClose(input, start) {
  let quote = null;
  let braceDepth = 0;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote && input[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (char === ">" && braceDepth === 0) return i;
  }
  return -1;
}

function findExpressionClose(text, start) {
  let quote = null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

module.exports = {
  LAYOUT_TAGS,
  parseJsxLikeMarkup,
  parseSlideBodyDsl,
};
