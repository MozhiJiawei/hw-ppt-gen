# Visual Diagram Rules

Use this reference only when a deck needs a real diagram and no source figure can carry the slide by itself. Do not load it for ordinary text, table, card, or simple list slides.

## Evidence Priority

1. Use the original source figure, table, screenshot, or chart when it is available and directly supports the slide claim.
2. If the source figure is too dense, crop or simplify it, but keep the source visual as the evidence anchor.
3. If the source provides numbers but no usable visual, create a data chart from the source values.
4. If no source visual exists and the slide needs a relationship diagram, draw a generated diagram.
5. If the content is just parallel items, use normal text boxes or cards instead of a diagram.

Original figures outrank generated hand-drawn diagrams. Generated diagrams are for explaining relationships, mechanisms, search spaces, loops, hierarchies, and architecture when the source does not provide a usable visual.

## Atomic Diagram Intents

Choose one primary intent before writing the diagram spec:

- `Quantity`: values, comparisons, distributions, rankings, deltas. Use charts first.
- `Sequence`: process, timeline, pipeline, stage progression.
- `Loop`: feedback cycle, iterative improvement, control loop, flywheel.
- `Hierarchy`: tree, layered architecture, decomposition, taxonomy, parent-child relations.
- `Matrix`: two-axis positioning, quadrants, trade-off maps.
- `Network`: many-to-many links, dependency graph, topology.

Decision priority when multiple intents appear:

1. If numeric comparison is the point, use `Quantity`.
2. If a closed feedback relation is the point, use `Loop`.
3. If order over time is the point, use `Sequence`.
4. If containment or parent-child structure is the point, use `Hierarchy`.
5. If two dimensions classify items, use `Matrix`.
6. Use `Network` only when many-to-many connectivity is the message.

Do not expose all intents as equal choices in the prompt. Ask the model to identify the slide's single dominant relationship, then use the priority list to break ties.

## Rendering Path

The hand-drawn rendering path is fixed:

1. `source_visual`: use original figure/table/screenshot whenever available.
2. `rough_svg`: when no usable source visual exists and the slide needs a real visual anchor, render with `scripts/hw_diagram_helpers.js`.
3. Standard PPT helpers: use normal tables, cards, native bar charts, and evidence modules for non-hand-drawn pages.

Do not use other hand-drawn renderers. Native PPT shapes remain part of the general deck system, but they are not the selected hand-drawn diagram implementation.

## Rough SVG Supported Templates

The helper in `scripts/hw_diagram_helpers.js` currently supports:

- `layered_architecture`: layered systems, architecture stacks, side modules, cross-layer flow.
- `grouped_bar_chart`: small benchmark or category comparisons with one to three series.
- `tree`: archive/search/evolution trees with highlighted terminal nodes.
- `closed_loop`: five-step feedback loops with a central concept and highlighted archive/selection step.
- `horizontal_sequence`: left-to-right stages, delivery flows, quality gates.
- `quadrant_matrix`: two-axis positioning and renderer/strategy trade-off maps.
- `hub_spoke_network`: small collaboration networks with a central hub and limited cross-links.

Each diagram spec should include:

- `id`: stable file-safe id.
- `title`: short slide-level diagram title.
- `claim`: one concise Chinese sentence explaining the diagram.
- `intent`: one of the atomic intents.
- `template`: one supported template.
- `visual_spec`: structured nodes, edges, labels, steps, highlights, and annotations.

Load `references/visual_diagram_spec_schema.md` before writing a Rough SVG spec. The schema file contains template-specific required fields and examples.

## Quality Gates

Before accepting a generated diagram:

- Export the final PPTX to PNG using `scripts/export_pptx_images.js`.
- Inspect the PNG at original size.
- Confirm the diagram is the main visual anchor, not a disguised card list.
- Confirm all generated visible labels are readable.
- Confirm no labels are clipped, overlapping, or detached from the relevant node.
- Confirm the diagram makes the intended relationship obvious within five seconds.
- Confirm hand-drawn styling improves comprehension rather than becoming decoration.

If the source figure exists and is readable, use it even if a hand-drawn version would look nicer.
