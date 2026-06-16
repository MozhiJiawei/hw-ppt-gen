"use strict";

const { createFeedbackIssue } = require("../feedback/feedback_issue");
const { createFeedbackCliError, feedbackToCliText } = require("../feedback/feedback_reporter");
const { normalizeComponentTree } = require("./normalize_component_tree");
const { componentTreeToRenderModel } = require("./component_tree_model");

function compileSlideDsl(bodyDsl, options = {}) {
  const feedbackIssues = [];
  const { tree, issues } = normalizeComponentTree(bodyDsl, { path: options.path || "bodyDsl" });
  feedbackIssues.push(...issues);

  if (!tree) return finalize(null, null, feedbackIssues, options);
  if (tree.tag !== "Columns") {
    feedbackIssues.push(createFeedbackIssue({
      code: "dsl_root_invalid",
      severity: "error",
      phase: "compile",
      target: {
        path: tree.source?.path || "bodyDsl",
        selector: tree.source?.selector,
        semanticStack: tree.source?.semanticStack,
      },
      message: "Body DSL root must be a layout element such as <TwoColumn>, <ThreeColumn>, or <FourColumn>.",
      details: { actual: tree.tag, expected: "Columns" },
      repairs: ["Wrap body components in a JSX-like layout root such as <TwoColumn><Module>...</Module></TwoColumn>."],
    }));
  }
  if (!tree.children.length) {
    feedbackIssues.push(createFeedbackIssue({
      code: "dsl_modules_missing",
      severity: "error",
      phase: "compile",
      target: {
        path: "bodyDsl.children",
        selector: tree.source?.selector || "bodyDsl > Columns",
        semanticStack: tree.source?.semanticStack,
      },
      message: "Body DSL layout root must contain <Module> children.",
      repairs: ["Add <Module> children matching the selected layout tag."],
    }));
  }

  let renderModel = null;
  if (!feedbackIssues.some((issue) => issue.severity === "error")) {
    try {
      renderModel = componentTreeToRenderModel(tree, options);
    } catch (error) {
      feedbackIssues.push(createFeedbackIssue({
        code: error.feedbackCode || "dsl_component_tree_invalid",
        severity: "error",
        phase: "compile",
        target: error.feedbackTarget || {
          path: tree.source?.path || "bodyDsl",
          selector: tree.source?.selector || "bodyDsl",
          semanticStack: tree.source?.semanticStack,
        },
        message: error.message,
        details: { cause: error.message, ...(error.feedbackDetails || {}) },
        repairs: error.feedbackRepairs || [
          "Ensure the layout tag and <Module> count match an official layout container.",
          "Add at least one real proof component; supporting components cannot satisfy the proof requirement.",
        ],
      }));
    }
  }
  return finalize(tree, renderModel, feedbackIssues, options);
}

function finalize(tree, renderModel, feedbackIssues, options = {}) {
  const result = {
    ok: !feedbackIssues.some((issue) => issue.severity === "error"),
    tree,
    renderModel,
    feedbackIssues,
  };
  if (!result.ok && options.throwOnError !== false) {
    throw createFeedbackCliError(feedbackToCliText(feedbackIssues, { title: "Body DSL compile failed" }), {
      feedbackIssues,
      compileResult: result,
    });
  }
  return result;
}

module.exports = {
  compileSlideDsl,
};
