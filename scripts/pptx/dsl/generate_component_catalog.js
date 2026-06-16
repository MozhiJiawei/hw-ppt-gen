"use strict";

const fs = require("fs");
const path = require("path");
const {
  defaultVisualSpecFor,
  listAiComponents,
  officialDrawRows,
} = require("./component_registry");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_OUT = path.join(ROOT, "references", "generated_dsl_component_catalog.md");
const DEFAULT_DETAIL_DIR = path.join(ROOT, "references", "generated_dsl_component_details");

function generateComponentCatalog(options = {}) {
  const detailDir = options.detailDir || DEFAULT_DETAIL_DIR;
  const components = listAiComponents();
  const draws = officialDrawRows();
  const componentRows = components
    .filter((item) => item.tag !== "Columns")
    .map((item) => `- \`<${item.tag}>\`: ${item.description || item.docs.useWhen}`);

  const lines = [
    "# Generated Body DSL Component Catalog",
    "",
    "This file is generated from `scripts/pptx/dsl/component_registry.js`.",
    "",
    "Use this as the first-level drawing index. It should stay short: choose the body structure, choose whether the slide needs source evidence or generated drawing, then open only the draw detail file you need.",
    "",
    "## Authoring Entry",
    "",
    "- Body layout and non-drawing readouts use JSX-like tags such as `<TwoColumn>`, `<Module>`, `<EvidenceFigure>`, `<KpiCards>`, `<Table>`, and `<InsightText>`.",
    "- Generated drawing uses the soft entry `<Visual draw=\"Kind/template\" model={...} source={source} />`.",
    "- `draw=\"Kind/template\"` can call an existing official renderer, and later can route to dynamic agent-generated draw functions behind the same registry boundary.",
    "",
    "## Drawing Principles",
    "",
    "- Proof priority is explicit: `source_evidence > generated_drawing > supporting_readout > text`.",
    "- Prefer source evidence when it proves the claim. If the first authored DSL chose `<EvidenceFigure>` or `<EvidenceChart>`, keep that same source evidence through QA repair and improve the layout around it.",
    "- Generated drawing is secondary. Use it when no readable source evidence exists, when it annotates preserved source evidence, or when it replaces prose by clarifying structure, sequence, comparison, or relationship.",
    "- Keep drawing models relationship-native: steps for flows, nodes/edges for networks, rows/columns/values for matrices, series/categories for charts. Put explanations in editable PPT text, not inside the drawing model.",
    "- Respect the body slot budget. Large drawings need fewer neighboring text lines and fewer supporting components.",
    "- Use Huawei-compatible restraint: readable Microsoft YaHei text, red only for decisive emphasis, clear labels, no decorative clutter, and no manual page coordinates in Body DSL.",
    "- Supporting draw templates such as data cards, heatmaps, tables, capability matrices, and capability stacks do not satisfy the real proof requirement by themselves.",
    "",
    "## Body Components",
    "",
    "- `<TwoColumn>`, `<BiasedColumn>`, `<ThreeColumn>`, `<FourColumn>`: layout tags; the tag chooses the layout type.",
    ...componentRows,
    "",
    "## Native Draw Capabilities",
    "",
    "| draw | Role | Renderer | Use when | Detail |",
    "| --- | --- | --- | --- | --- |",
    ...draws.map((row) => {
      const detail = relativeDetailPath(row, detailDir);
      return `| \`${row.kind}/${row.template}\` | ${row.anchorEligibility} | ${row.renderer} | ${drawUseWhen(row)} | [details](${detail}) |`;
    }),
    "",
  ];
  return lines.join("\n");
}

function generateDrawDetail(row) {
  const draw = `${row.kind}/${row.template}`;
  const model = defaultVisualSpecFor(row);
  const lines = [
    `# ${draw}`,
    "",
    `Generated from official visual template \`${draw}\`.`,
    "",
    "## When To Use",
    "",
    drawUseWhen(row),
    "",
    "## Contract",
    "",
    `- draw: \`${draw}\``,
    `- renderer: \`${row.renderer}\``,
    `- role: \`${row.anchorEligibility}\``,
    `- measure support: \`${row.measureSupport}\``,
    `- resize policy: \`${row.resizePolicy}\``,
    "",
    "## DSL",
    "",
    "```jsx",
    `<Visual id="${safeId(row.template)}_1" title="${row.type} 标题" claim="${row.type} 支撑当前模块判断。" source={source} draw="${draw}" model={model} />`,
    "```",
    "",
    "## Model",
    "",
    "```json",
    JSON.stringify(model, null, 2),
    "```",
    "",
    "## Authoring Notes",
    "",
    "- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.",
    "- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.",
    "- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.",
    "- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.",
    "",
  ];
  return lines.join("\n");
}

function writeComponentCatalog(outFile = DEFAULT_OUT, detailDir = DEFAULT_DETAIL_DIR) {
  const markdown = generateComponentCatalog({ detailDir });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, markdown, "utf8");
  writeDrawDetails(detailDir);
  return outFile;
}

function writeDrawDetails(detailDir = DEFAULT_DETAIL_DIR) {
  fs.rmSync(detailDir, { recursive: true, force: true });
  fs.mkdirSync(detailDir, { recursive: true });
  for (const row of officialDrawRows()) {
    fs.writeFileSync(path.join(detailDir, `${drawSlug(row)}.md`), generateDrawDetail(row), "utf8");
  }
  return detailDir;
}

function drawUseWhen(row) {
  const key = `${row.kind}/${row.template}`;
  const uses = {
    "Quantity/data_cards": "Use for a few numeric readouts after the module already has real evidence or drawing proof.",
    "Quantity/bar_chart": "Use for categorical numeric comparison with a small number of categories.",
    "Quantity/line_chart": "Use for trend or progression across ordered categories.",
    "Quantity/proportion_chart": "Use for part-to-whole proportions with a small number of segments.",
    "Quantity/heatmap": "Use for compact scored values across two axes; make score basis visible.",
    "Sequence/process": "Use for ordered mechanisms, workflows, or execution paths.",
    "Sequence/timeline": "Use for chronological stages or milestone progression.",
    "Sequence/swimlane": "Use for a process split across roles, systems, or responsibilities.",
    "Loop/closed_loop": "Use for one feedback loop with clear input, action, feedback, and correction.",
    "Loop/dual_loop": "Use for two interacting loops or inner/outer feedback systems.",
    "Loop/spiral_iteration_ladder": "Use for iterative improvement that accumulates by stages.",
    "Hierarchy/tree": "Use for branching decomposition or parent-child structure.",
    "Hierarchy/layered_architecture": "Use for architecture layers, module boundaries, and cross-layer edges.",
    "Hierarchy/capability_stack": "Use as a supporting readout for layered capabilities.",
    "Matrix/table": "Use as a supporting readout when row and column intersection carries meaning.",
    "Matrix/quadrant_matrix": "Use for two-axis positioning with a small number of items.",
    "Matrix/capability_matrix": "Use as a supporting matrix for capability coverage or maturity.",
    "Matrix/heatmap": "Use as a supporting matrix when intensity values are the point.",
    "Network/hub_spoke_network": "Use for one central node connected to several surrounding nodes.",
    "Network/dependency_graph": "Use for dependency, constraint, or prerequisite relationships.",
    "Network/module_interaction_map": "Use for module-to-module interactions in an architecture.",
    "Network/causal_influence_graph": "Use for cause, influence, and propagation relationships.",
  };
  return uses[key] || `Use for ${key} visual content.`;
}

function relativeDetailPath(row, detailDir) {
  return path.relative(path.dirname(DEFAULT_OUT), path.join(detailDir, `${drawSlug(row)}.md`)).replace(/\\/g, "/");
}

function drawSlug(row) {
  return `${row.kind}_${row.template}`.replace(/[^\w]+/g, "_").toLowerCase();
}

function safeId(value) {
  return String(value || "visual").replace(/[^\w]+/g, "_").toLowerCase();
}

if (require.main === module) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT;
  console.log(writeComponentCatalog(out));
}

module.exports = {
  DEFAULT_DETAIL_DIR,
  DEFAULT_OUT,
  drawSlug,
  generateComponentCatalog,
  generateDrawDetail,
  writeComponentCatalog,
  writeDrawDetails,
};
