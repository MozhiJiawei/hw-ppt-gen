# Content Layout Schema

Use this reference when writing `contentLayout` data for `addVisualAnchorContentSlide`.

Design standards live in `references/layout_standards.md`. This file only defines the JSON shape.

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

`contentLayout.type` is authoritative. The Chinese `reference` label is optional derived compatibility metadata.

Supported types:

- `two_column`: 2 modules.
- `biased_column`: 2-4 modules; first module must be `visual_anchor`.
- `three_column`: 3 modules.
- `four_column`: 4 modules.

## Module Shape

```json
{
  "role": "content_panel",
  "title": "模块标题",
  "blocks": []
}
```

Allowed block types:

- `visual_anchor`
- `text`

Do not provide page-region coordinates such as `contentArea`, `content_area`, `x`, `y`, `w`, or `h` at the `contentLayout` root. The renderer owns the fixed Huawei page region.

Do not provide a `flow` field. The renderer owns internal visual/text flow based on module size and source image dimensions.

## Visual Anchor Block

```json
{
  "type": "visual_anchor",
  "visual_anchor": {
    "id": "stable_id",
    "title": "Evidence title",
    "claim": "一句中文核心观点。",
    "kind": "Evidence",
    "template": "source_figure",
    "source": {
      "path": ".tmp/deck/images/figure_1_crop.png",
      "caption": "Figure 1: workload"
    }
  }
}
```

Use `references/evidence_schema.md` for source evidence. Use `references/generated_visual_schema.md` for generated visuals.

## Text Block

```json
{
  "type": "text",
  "body": [
    "读法：左图说明长尾模型数量占绝对多数。",
    "含义：低频调用被固定容量放大为闲置成本。"
  ],
  "fontSize": 12
}
```

Use text blocks for interpretation, caveats, conclusions, and compact reading guidance. Text remains editable PPT text.

## Dense Caption Suppression

For dense `two_column` and `three_column` pages, the renderer suppresses module visual captions so the evidence can occupy the visual region. Put source notes and reading guidance in nearby text blocks, module titles, or the footer.

For `biased_column`, the first module is visual-only and interpretation belongs in right-side stacked cards/modules.

## Flow Arrows

`flowArrows` is an optional page-level annotation for red column-to-column markers in `three_column` layouts.

```json
{
  "contentLayout": {
    "type": "three_column",
    "flowArrows": { "arrows": [0.36, 0.5, 0.64] },
    "modules": []
  }
}
```

## Smoke Check

`npm run content-layout-smoke` generates a review deck and runs hard QA under `.tmp/content_layout_schema_smoke/`.
