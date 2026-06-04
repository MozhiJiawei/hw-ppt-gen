"use strict";

const { parseSlideBodyDsl } = require("../dsl/jsx_dsl");
const { compileSlideDsl } = require("../dsl/compile_slide_dsl");
const {
  createCompileIr,
  createDslIr,
} = require("./ir_contracts");

function compilePageBodyDslToIr(page = {}) {
  const parsed = parsePageBodyDsl(page.bodyDsl, page.dslScope || page.scope || {});
  const compileResult = compileSlideDsl(parsed.bodyDsl, { throwOnError: false, source: page.bodyDsl });
  return {
    ok: compileResult.ok,
    phase: "compile",
    dslIr: createDslIr({
      pageIndex: page.pageIndex,
      pageId: page.pageId,
      bodyDsl: parsed.bodyDsl,
      root: parsed.root,
      slideProps: parsed.slideProps,
      sourceMap: collectDslSourceMap(parsed.root),
    }),
    compileIr: compileResultToIr(compileResult, page),
    issues: compileResult.feedbackIssues || [],
  };
}

function parsePageBodyDsl(bodyDsl, scope = {}) {
  if (typeof bodyDsl === "string") return parseSlideBodyDsl(bodyDsl, scope);
  return {
    slideProps: {},
    bodyDsl,
    root: bodyDsl,
  };
}

function compileResultToIr(compileResult = {}, page = {}) {
  const renderModel = compileResult.renderModel || null;
  return createCompileIr({
    pageIndex: page.pageIndex,
    pageId: page.pageId,
    tree: compileResult.tree || null,
    renderModel,
    visiblePrimitives: collectVisiblePrimitives(renderModel),
    feedbackIssues: compileResult.feedbackIssues || [],
    sourceMap: collectTreeSourceMap(compileResult.tree),
  });
}

function collectVisiblePrimitives(renderModel = {}) {
  if (!renderModel) return [];
  return (renderModel.modules || []).flatMap((module, moduleIndex) => {
    return (module.componentPrimitives || []).map((primitive, blockIndex) => ({
      identity: primitiveIdentity(primitive),
      source: primitive.dsl || primitive.sourceComponent || null,
      dsl: primitive.dsl || primitive.sourceComponent || null,
      sourceComponent: primitive.sourceComponent || null,
      moduleIndex,
      blockIndex,
      primitive,
      location_quality: primitive.dsl?.selector ? "dsl_mapped" : "page_only",
    }));
  });
}

function collectDslSourceMap(root) {
  const out = [];
  visitDslNode(root, out);
  return out;
}

function visitDslNode(node, out) {
  if (!node || typeof node !== "object") return;
  const meta = node.props?.__dsl || {};
  if (meta.selector || meta.sourceSpan) {
    out.push({
      selector: meta.selector,
      sourceSpan: meta.sourceSpan,
      codeFrame: meta.codeFrame,
    });
  }
  (node.children || []).forEach((child) => visitDslNode(child, out));
}

function collectTreeSourceMap(tree) {
  const out = [];
  visitCompiledNode(tree, out);
  return out;
}

function visitCompiledNode(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.source) out.push(node.source);
  (node.children || []).forEach((child) => visitCompiledNode(child, out));
}

function primitiveIdentity(primitive = {}) {
  const visual = primitive.visual_anchor || primitive.component || {};
  return {
    componentId: primitive.dsl?.id || visual.id,
    blockType: primitive.type,
    kind: visual.kind || (primitive.type === "text" ? "Text" : undefined),
    template: visual.template || (primitive.type === "text" ? "body_text" : undefined),
  };
}

module.exports = {
  collectVisiblePrimitives,
  compilePageBodyDslToIr,
  compileResultToIr,
};
