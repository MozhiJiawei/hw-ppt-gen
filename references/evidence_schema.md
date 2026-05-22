# Evidence Schema

Use this reference before placing any source figure, chart, screenshot, or table.

## Contract

Evidence anchors route source visuals through the unified content-slide path and manifest. Do not bypass this with direct `slide.addImage`.

```json
{
  "id": "figure_01_workload",
  "title": "Figure 1 Workload Evidence",
  "claim": "Figure 1 supports the slide's primary evidence claim.",
  "kind": "Evidence",
  "template": "source_figure",
  "source": {
    "path": "source_images/figure01_workload.png",
    "caption": "Figure 1: concurrent LLM serving workloads",
    "treatment": "original"
  }
}
```

Supported templates:

- `source_figure`
- `source_chart`
- `source_table`
- `source_screenshot`

Required fields:

- `id`: stable file-safe id.
- `title`: short metadata title, not rendered inside the source image.
- `claim`: what the evidence proves.
- `kind`: `Evidence`.
- `template`: one of the supported evidence templates.
- `source.path`: original or derived source image path.
- `source.caption`: original figure/table caption or short source note.

Optional `source.treatment`:

- `original`
- `crop`
- `crop_zoom`
- `padded_canvas`
- `annotated_crop`

Default to `original` or an already complete source subfigure. `crop`, `crop_zoom`, and `annotated_crop` are exceptions, not normal layout tools.

## Evidence Object Rule

One `Evidence` anchor corresponds to one readable evidence object.

Do not use one `Evidence` anchor for:

- a collage of several source figures;
- a contact sheet;
- multiple unrelated subfigures;
- a giant canvas where the relevant figure is a thumbnail.

If one paper figure has subfigures and the slide claim depends on one subfigure, use a complete subfigure as the evidence object. A crop is acceptable only when it extracts that complete subfigure or a human/source-provided region. The crop must preserve the full plotted or diagrammed object: axes, tick labels, legends, labels, titles, borders, arrows, and annotations that make the evidence interpretable.

Do not crop only to make the image larger in a fixed layout. Cutting off a chart axis, legend, figure label, timeline endpoint, diagram node, or table boundary is evidence loss, not text compression. If the complete evidence object is too small, choose a larger visual region, reduce secondary text/tables/KPI cards, use a different fixed layout if the brief allows it, or split the point if page count permits.

If the claim needs two separate source figures, choose a primary evidence object and convert the secondary evidence into concise text, KPI/table readout, speaker note, or another slide.

## Evidence Binding Rule

Evidence is not a decorative image slot. It must prove the local module claim.

For each content module:

- the module title names the claim being proven;
- `visual_anchor.claim` states what the evidence proves;
- nearby text states the same judgment in compact business language.

These three must point at the same subject. Do not use a figure from another section merely because the module needs a visual anchor. If the desired proof is one subfigure inside a larger source figure, use the complete subfigure or complete source figure rather than substituting an unrelated figure.

Bad pattern:

- module title: `保真证据：低 cache retention 仍保持问答质量`;
- text: `R-CLA 在 50% retention 下缓解基线退化`;
- visual anchor: training-time random cross-layer attention mechanism.

The mechanism figure is real evidence, but it proves how R-CLA is trained, not the measured quality under cache retention.

## Readability Rule

The evidence must be readable at final slide size. The reader should be able to inspect the decisive trend, label, table value, architecture relationship, or comparison without zooming.

If proportional placement makes the evidence too small:

- choose a layout with a larger visual region;
- reduce supporting components or visible prose before reducing evidence size;
- use the complete relevant subfigure when the source image contains multiple panels;
- split the page if page count permits;
- replace secondary evidence with concise text/table/KPI explanation.

Never solve small evidence by trimming away chart boundaries or diagram context. The original source evidence is the strongest proof; preserving its integrity ranks above filling the module perfectly.

## Text Around Evidence

Evidence modules need nearby editable PPT text:

- a Chinese figure/table legend when layout space permits;
- a source note or footer source;
- 1-3 short conclusion lines, table rows, KPI readouts, or caveats.

For dense `two_column` and `three_column` layouts, captions may be omitted under the image so the evidence can occupy the visual region. In that case, put the conclusion, boundary, or source note in adjacent text, module title, or footer source.
