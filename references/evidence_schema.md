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

## Evidence Object Rule

One `Evidence` anchor corresponds to one readable evidence object.

Do not use one `Evidence` anchor for:

- a collage of several source figures;
- a contact sheet;
- multiple unrelated subfigures;
- a giant canvas where the relevant figure is a thumbnail.

If one paper figure has subfigures and the slide claim depends on one subfigure, crop to that subfigure. If the claim needs two separate source figures, choose a primary evidence object and convert the secondary evidence into concise text, KPI/table readout, speaker note, or another slide.

## Readability Rule

The evidence must be readable at final slide size. The reader should be able to inspect the decisive trend, label, table value, architecture relationship, or comparison without zooming.

If proportional placement makes the evidence too small:

- crop to the relevant source region inside `.tmp/<deck>/images/`;
- choose a layout with a larger visual region;
- split the page if page count permits;
- replace secondary evidence with concise text/table/KPI explanation.

## Text Around Evidence

Evidence modules need nearby editable PPT text:

- a Chinese figure/table legend when layout space permits;
- a source note or footer source;
- 1-3 short conclusion lines, table rows, KPI readouts, or caveats.

For dense `two_column` and `three_column` layouts, captions may be omitted under the image so the evidence can occupy the visual region. In that case, put the conclusion, boundary, or source note in adjacent text, module title, or footer source.
