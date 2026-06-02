# Generated Body DSL Component Catalog

This file is generated from `scripts/pptx/dsl/component_registry.js`.

Use this as the first-level drawing index. It should stay short: choose the body structure, choose whether the slide needs source evidence or generated drawing, then open only the draw detail file you need.

## Authoring Entry

- Body layout and non-drawing readouts use JSX-like tags such as `<TwoColumn>`, `<Module>`, `<EvidenceFigure>`, `<KpiCards>`, `<Table>`, and `<InsightText>`.
- Generated drawing uses the soft entry `<Visual draw="Kind/template" model={...} />`.
- `draw="Kind/template"` can call an existing official renderer, and later can route to dynamic agent-generated draw functions behind the same registry boundary.

## Drawing Principles

- Prefer source evidence when it proves the claim; generated drawing is secondary and should replace prose only when it clarifies structure, sequence, comparison, or relationship.
- Keep drawing models relationship-native: steps for flows, nodes/edges for networks, rows/columns/values for matrices, series/categories for charts. Put explanations in editable PPT text, not inside the drawing model.
- Respect the body slot budget. Large drawings need fewer neighboring text lines and fewer supporting components.
- Use Huawei-compatible restraint: readable Microsoft YaHei text, red only for decisive emphasis, clear labels, no decorative clutter, and no manual page coordinates in Body DSL.
- Supporting draw templates such as data cards, heatmaps, tables, capability matrices, and capability stacks do not satisfy the real proof requirement by themselves.

## Body Components

- `<TwoColumn>`, `<BiasedColumn>`, `<ThreeColumn>`, `<FourColumn>`: layout tags; the tag chooses the layout type.
- `<Module>`: A titled body panel inside a body layout tag.
- `<EvidenceFigure>`: Source-backed figure evidence with preserved aspect ratio.
- `<EvidenceChart>`: Source-backed chart evidence with preserved aspect ratio.
- `<KpiCards>`: Compact KPI card row used as a secondary readout next to evidence.
- `<Table>`: Generated native table for real row/column comparisons.
- `<CapabilityStack>`: Layered capability stack as a supporting structured readout.
- `<InsightText>`: Editable PPT text for compact judgments, caveats, and conclusions.
- `<Visual>`: Generated drawing entry for registered kind/template draw functions.

## Native Draw Capabilities

| draw | Role | Renderer | Use when | Detail |
| --- | --- | --- | --- | --- |
| `Quantity/data_cards` | supporting_component | ppt_native | Use for a few numeric readouts after the module already has real evidence or drawing proof. | [details](generated_dsl_component_details/quantity_data_cards.md) |
| `Quantity/bar_chart` | real_anchor | rough_svg | Use for categorical numeric comparison with a small number of categories. | [details](generated_dsl_component_details/quantity_bar_chart.md) |
| `Quantity/line_chart` | real_anchor | rough_svg | Use for trend or progression across ordered categories. | [details](generated_dsl_component_details/quantity_line_chart.md) |
| `Quantity/proportion_chart` | real_anchor | rough_svg | Use for part-to-whole proportions with a small number of segments. | [details](generated_dsl_component_details/quantity_proportion_chart.md) |
| `Quantity/heatmap` | supporting_component | ppt_native | Use for compact scored values across two axes; make score basis visible. | [details](generated_dsl_component_details/quantity_heatmap.md) |
| `Sequence/process` | real_anchor | ppt_native | Use for ordered mechanisms, workflows, or execution paths. | [details](generated_dsl_component_details/sequence_process.md) |
| `Sequence/timeline` | real_anchor | ppt_native | Use for chronological stages or milestone progression. | [details](generated_dsl_component_details/sequence_timeline.md) |
| `Sequence/swimlane` | real_anchor | ppt_native | Use for a process split across roles, systems, or responsibilities. | [details](generated_dsl_component_details/sequence_swimlane.md) |
| `Loop/closed_loop` | real_anchor | rough_svg | Use for one feedback loop with clear input, action, feedback, and correction. | [details](generated_dsl_component_details/loop_closed_loop.md) |
| `Loop/dual_loop` | real_anchor | rough_svg | Use for two interacting loops or inner/outer feedback systems. | [details](generated_dsl_component_details/loop_dual_loop.md) |
| `Loop/spiral_iteration_ladder` | real_anchor | rough_svg | Use for iterative improvement that accumulates by stages. | [details](generated_dsl_component_details/loop_spiral_iteration_ladder.md) |
| `Hierarchy/tree` | real_anchor | rough_svg | Use for branching decomposition or parent-child structure. | [details](generated_dsl_component_details/hierarchy_tree.md) |
| `Hierarchy/layered_architecture` | real_anchor | rough_svg | Use for architecture layers, module boundaries, and cross-layer edges. | [details](generated_dsl_component_details/hierarchy_layered_architecture.md) |
| `Hierarchy/capability_stack` | supporting_component | ppt_native | Use as a supporting readout for layered capabilities. | [details](generated_dsl_component_details/hierarchy_capability_stack.md) |
| `Matrix/table` | supporting_component | ppt_native | Use as a supporting readout when row and column intersection carries meaning. | [details](generated_dsl_component_details/matrix_table.md) |
| `Matrix/quadrant_matrix` | real_anchor | rough_svg | Use for two-axis positioning with a small number of items. | [details](generated_dsl_component_details/matrix_quadrant_matrix.md) |
| `Matrix/capability_matrix` | supporting_component | ppt_native | Use as a supporting matrix for capability coverage or maturity. | [details](generated_dsl_component_details/matrix_capability_matrix.md) |
| `Matrix/heatmap` | supporting_component | ppt_native | Use as a supporting matrix when intensity values are the point. | [details](generated_dsl_component_details/matrix_heatmap.md) |
| `Network/hub_spoke_network` | real_anchor | rough_svg | Use for one central node connected to several surrounding nodes. | [details](generated_dsl_component_details/network_hub_spoke_network.md) |
| `Network/dependency_graph` | real_anchor | rough_svg | Use for dependency, constraint, or prerequisite relationships. | [details](generated_dsl_component_details/network_dependency_graph.md) |
| `Network/module_interaction_map` | real_anchor | rough_svg | Use for module-to-module interactions in an architecture. | [details](generated_dsl_component_details/network_module_interaction_map.md) |
| `Network/causal_influence_graph` | real_anchor | rough_svg | Use for cause, influence, and propagation relationships. | [details](generated_dsl_component_details/network_causal_influence_graph.md) |
