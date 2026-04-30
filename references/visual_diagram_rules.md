# Visual Diagram Rules

Use this reference only when a deck needs a real diagram and no source figure can carry the slide by itself. Do not load it for ordinary text, table, card, or simple list slides.

## Evidence Priority

1. Use the original source figure, table, screenshot, or chart when it is available and directly supports the slide claim.
2. If the source figure is too dense, crop or simplify it, but keep the source visual as the evidence anchor.
3. If the source provides numbers but no usable visual, create a data chart from the source values.
4. If no source visual exists and the slide needs a relationship diagram, draw a generated diagram.
5. If the content is just parallel items, use normal text boxes or cards instead of a diagram.

Original figures outrank generated hand-drawn diagrams. Generated diagrams are for explaining relationships, mechanisms, search spaces, loops, hierarchies, and architecture when the source does not provide a usable visual.

Every content slide must record a `visual_anchor` decision before rendering. If the slide uses a generated diagram, `visual_anchor.source_visual_search.performed` must be `true`, and the candidates or rejection reason must be explicit. This makes "source visual first" checkable in deck planning and smoke reviews.

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
2. `rough_svg`: when no usable source visual exists and the slide needs a real visual anchor, render an SVG image with `scripts/hw_diagram_helpers.js`.
3. Standard PPT helpers: use normal tables, cards, native bar charts, and evidence modules for non-hand-drawn pages.

Do not use other hand-drawn renderers. Native PPT shapes remain part of the general deck system, but they are not the selected hand-drawn diagram implementation.

The diagram helper exports an image anchor only. Do not call it to create a full PPT slide. Deck code should embed the generated SVG inside a standard Huawei content page so analysis summaries, section indicators, footers, evidence notes, and layout rules remain under the normal PPT page system.

## Rough SVG Supported Templates

The helper in `scripts/hw_diagram_helpers.js` currently supports 20 visually distinct base templates:

- Quantity: `grouped_bar_chart`, `line_chart`, `donut_proportion_chart`, `heatmap`.
- Sequence: `horizontal_process`, `vertical_process`, `timeline`, `swimlane`.
- Loop: `closed_loop`, `dual_loop`, `spiral_iteration_ladder`.
- Hierarchy: `tree`, `layered_architecture`, `pyramid_capability_stack`.
- Matrix: `quadrant_matrix`, `capability_matrix`.
- Network: `hub_spoke_network`, `dependency_graph`, `module_interaction_map`, `causal_influence_graph`.

Do not add a new template name unless it creates a clear visual difference. If a deck needs a semantic variant such as a decision tree, risk matrix, or goal-centered cycle, copy the closest base renderer in the deck-specific script and customize the visual treatment there.

Each diagram spec should include:

- `id`: stable file-safe id.
- `title`: short metadata title for filenames/review context; do not render it into the image.
- `claim`: one concise sentence for PPT/page-level context; do not render it into the image.
- `intent`: one of the atomic intents.
- `template`: one supported template.
- `visual_spec`: structured nodes, edges, labels, steps, highlights, and annotations.

Load `references/visual_diagram_spec_schema.md` before writing a Rough SVG spec. The schema file contains template-specific required fields and examples.

Pass the required canvas ratio at render time, for example `{ aspectRatio: "16:9", width: 1600 }`. The SVG may be scaled by the PPT layout tool, but the source image ratio should match the intended content slot.

The exported image should contain only diagram content: nodes, edges, axes, legends, values, and other visual encodings. Page titles, diagram captions, explanatory claims, and interpretation text belong in the PPT layout layer.

## Quality Gates

Before accepting a generated diagram:

- Run `npm run test:diagram` after changing the helper.
- Run `npm run diagram-smoke` and inspect the generated SVG anchors.
- For deck composition, embed the SVG into a standard content slide, export the final PPTX to PNG using `scripts/export_pptx_images.js`, and inspect the PNG at original size.
- Confirm the diagram is the main visual anchor, not a disguised card list.
- Confirm all generated visible labels are readable.
- Confirm no labels are clipped, overlapping, or detached from the relevant node.
- Confirm the diagram makes the intended relationship obvious within five seconds.
- Confirm hand-drawn styling improves comprehension rather than becoming decoration.
- Confirm the rendered SVG includes every validated node, edge endpoint, step, matrix item, category, and series instead of silently truncating input.

If the source figure exists and is readable, use it even if a hand-drawn version would look nicer.
