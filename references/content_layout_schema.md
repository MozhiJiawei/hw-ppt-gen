# Content Layout Schema

Use this schema for Huawei content pages that need richer 图文并茂 layouts than a single large visual plus side cards.

The schema follows a strict three-step contract:

1. `contentLayout.type` chooses the fixed page layout.
2. Each module `blocks` list declares visual rendering blocks.
3. Text blocks, captions, legends, and interpretation stay as editable PPT annotations outside `visual_anchor.visual_spec`.

The schema describes layout, visual anchors, and editable text only. It must not carry implementation-control fields. PPT text annotations remain editable PPT objects.

## Page Shape

```json
{
  "contentLayout": {
    "type": "two_column",
    "reference": "05 内容 二分栏",
    "modules": []
  }
}
```

Supported fixed layouts:

- `two_column`: `05 内容 二分栏`, two equal columns.
- `biased_column`: `06 内容 偏分栏`, one wide visual-only region on the left and one to three stacked interpretation cards on the right.
- `three_column`: `07 内容 三分栏`, three equal columns.
- `four_column`: `08 内容 四分栏`, four panels arranged as 2x2.

Module counts match the references: `two_column` has 2 modules, `biased_column` has 2-4 modules, `three_column` has 3 modules, and `four_column` has 4 modules. A page may contain one or more visual anchors, but hard QA requires at least one manifest-backed rendered anchor.

## Module Blocks

A normal content module is a layout container. It may stack or place multiple visual and text blocks within one column/panel.

```json
{
  "role": "content_panel",
  "title": "这里是标题区域 样式",
  "blocks": [
    {
      "type": "text",
      "height": 1.1,
      "body": ["解释文字一。", "解释文字二。"]
    },
    {
      "type": "visual_anchor",
      "visual_anchor": {
        "id": "stable_id",
        "title": "Review title",
        "claim": "一句中文核心观点。",
        "kind": "Matrix",
        "template": "capability_matrix",
        "visual_spec": {}
      }
    }
  ]
}
```

The renderer owns block placement inside the module. Do not provide a `flow` field.
When a module contains source evidence plus text, the renderer uses the available
panel size and source image dimensions to choose the internal relationship:
wide evidence normally stacks above text, while tall/narrow evidence can sit
beside its reading text. Block sizing uses `height` in inches for fixed vertical
blocks and `weight` for flexible remaining space; horizontal visual/text sizing is
resolved by the renderer.

## Visual Blocks

Use existing visual-anchor semantics before creating new categories:

- KPI strips: `Quantity / data_cards`.
- Dense small-box grids: `Matrix / capability_matrix` or, for true tables, `Matrix / table`.
- Sectioned grids: multiple `Matrix` visual blocks separated by short `text` annotation blocks.
- Process/flow evidence: `Sequence / process` or `Quantity / data_cards` when the object is a compact numbered card sequence.
- Generated/transcribed tables: `Matrix / table`, always a manifest-backed visual anchor.
- Source figures/tables/screenshots: `Evidence`.

Generated and transcribed tables must remain editable. Do not add `type: "table"` or `role: "table"` blocks to `contentLayout`; use a `type: "visual_anchor"` block whose anchor is `Matrix/table`.

## Text Annotations

Use `type: "text"` blocks for module interpretation, section labels, conclusions, and reading guidance. Use `visualAnchorCaption` / `visual_anchor_caption` beside a visual block for editable figure legends only when the layout has enough visual space.

For dense `two_column` (`05 内容 二分栏`) and `three_column` (`07 内容 三分栏`) pages, omit visual captions and source notes under module visuals. The renderer suppresses module visual captions in these layouts so the image or chart can occupy the full block. Put the evidence reading and source reference in the adjacent text block, the page footer, or the brief-backed narrative.

For `biased_column`, the first module remains visual-only. Put interpretation in the right-side stacked cards, not inside the left visual box.

## Flow Arrows

`flowArrows` is a page-level layout annotation for the red column-to-column markers in `07 内容 三分栏`; it is not a visual object inside a module.

```json
{
  "contentLayout": {
    "type": "three_column",
    "flowArrows": { "arrows": [0.36, 0.5, 0.64] },
    "modules": []
  }
}
```

## Smoke Checks

`npm run content-layout-smoke` generates the review deck, runs hard QA, and writes the PPTX, plan, and manifest files under `.tmp/content_layout_schema_smoke/`.
