# Huawei Layout Primitives

Huawei content-page layout uses measured primitives before rendering. A primitive is a semantic body-content component with a size contract; it is not a low-level shape and it does not draw itself.

The supported path is:

```text
Body DSL component tree
-> taxonomy classification
-> primitive measurement
-> module stack allocation
-> existing PPT renderers
-> manifest diagnostics
```

## Primitive Contract

Each measured primitive reports:

- `minSize`: smallest acceptable box before readability or text-fit risk becomes hard.
- `preferredSize`: normal box for the current module width.
- `maxUsefulSize`: largest useful box before extra space should go elsewhere.
- `resizePolicy`: how it may shrink or grow.
- `priority`: layout priority when the stack must compress.
- `diagnostics`: warnings or errors created before paint.

The renderer receives final boxes from the layout layer. It should not renegotiate module allocation during drawing.

## Measured Primitive Coverage

Every official body-content visual template is required to enter the measured path:

- Evidence: `Evidence/source_figure` and `Evidence/source_chart`. Tables, screenshots, and UI captures are image inputs; bind them as `source_figure` unless the source is specifically a chart.
- Quantitative readouts/charts: `Quantity/data_cards`, `Quantity/bar_chart`, `Quantity/line_chart`, `Quantity/proportion_chart`, and `Quantity/heatmap`.
- Relationship diagrams: `Sequence/process`, `Sequence/timeline`, `Sequence/swimlane`, `Loop/closed_loop`, `Loop/dual_loop`, `Loop/spiral_iteration_ladder`, `Hierarchy/tree`, `Hierarchy/layered_architecture`, and all `Network/*` templates.
- Matrix/table primitives: `Matrix/table`, `Matrix/quadrant_matrix`, `Matrix/capability_matrix`, and `Matrix/heatmap`.
- Structured text: editable text blocks measured with PowerPoint text bounds.

`legacy_fallback` and `unsupported` are failure states for the measured layout path. The correct response is to simplify content, split the page, or add a measured renderer contract for the missing primitive.

## Measurement Harness

`measured` means the primitive has a renderer-backed proof path, not just a JavaScript guess.

The development harness is:

```text
PptxGenJS calibration deck
-> scripts/pptx/measure_pptx_layout.js sends the deck to the shared PowerPoint COM broker
-> the broker opens the PPTX and reads shape bounds and TextRange2 bounds
-> smoke tests compare actual bounds against primitive min/preferred/final boxes
```

For text, the harness temporarily enables PowerPoint text auto-size during measurement, then reads `TextFrame2.TextRange.BoundHeight` and `BoundWidth`.
For native supporting components, it reads the shape union emitted by the same renderer path used in real decks.
For SVG-backed generated visuals, the harness inserts the same generated image into a probe deck and reads the PowerPoint image bounds; semantic readability floors define the minimum useful height for scalable diagrams.
PNG export remains the visual review layer; COM measurement is the lightweight numeric oracle.

## Layout Diagnostics

Module stack layout records:

- layout engine used;
- layout status;
- available, minimum, and preferred main-axis budgets;
- primitive taxonomy and support level;
- min/preferred/max/final sizes;
- shrink diagnostics;
- fallback or infeasible diagnostics.

Diagnostics augment manifest and render-evidence checks. They do not replace visual-anchor parity, real-anchor requirements, or PowerPoint render evidence.
