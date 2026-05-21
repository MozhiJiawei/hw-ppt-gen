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

Do not provide manual column widths or gutter sizes. The renderer owns evidence-aware balancing inside the selected layout type: it can slightly rebalance two-column/three-column widths and biased-column visual share to keep source figures readable.

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
    "资源错配：非关键环节仍占用固定投入。",
    "弹性不足：异常波动会抬高安全垫。",
    "判断：优化起点是需求形态，不是单点效率。"
  ],
  "emphasis": ["资源错配", "弹性不足", "优化起点"],
  "fontSize": 12
}
```

Use text blocks for source-grounded judgments, caveats, conclusions, and compact business decisions. Text remains editable PPT text.

Text block rules:

- Use 2-5 short lines by default.
- Avoid more than 6 visible lines in one text block.
- Avoid more than 4 total visible text lines inside a three-column module; other column modules should stay under 6. If the module needs more, move the extra material into `Matrix/table`, KPI cards, or a conclusion note.
- Keep each line as `结论柄：判断` when possible.
- Avoid meta labels such as `读法`, `含义`, `说明`, and `可见` as repeated body rhythm. They describe how the slide is read, not what the audience should conclude.
- If those words appear in the brief, translate them into claim handles before writing visible body text.
- Use `emphasis` for 1-3 decisive words, numbers, or labels. The renderer marks those terms Huawei red and bold.
- Do not use `emphasis` to color a whole sentence.

For longer material, use another visual anchor instead of prose, but do not turn every column into a table:

- `Quantity/data_cards` for KPI readouts.
- `Matrix/table` for real dimensions, comparisons, stage splits, risks, boundaries, or decision paths.
- A separate short `text` block for final conclusion or boundary.

Do not use `Matrix/table` as a disguised `标签：正文` list. If a two-column table can be read row-by-row as `字段：一句话`, it should usually stay as short conclusion lines. A useful table must make the row/column intersection carry meaning, such as `基线 vs 改进`, `阶段A vs 阶段B`, `风险 vs 收敛动作`, or `指标 vs 证据 vs 判断`.
Weak table pairs include `口径 / 判断`, `维度 / 说明`, and `字段 / 含义`; these are usually better as conclusion lines or a bordered note.

On `three_column` summary pages, use generated tables sparingly. Prefer source evidence plus conclusion lines in each column; add a table only for the one column whose claim depends on a real comparison or stage split.

On three-column summary pages, keep the primary source figure readable before adding conclusion text. Do not shrink a non-wide evidence figure below roughly one quarter of the module height just to add more text.
When evidence still feels tight, remove secondary prose or decorative structure first. The correct response is a stronger evidence-first composition, not more explanatory text.

## Dense Caption Suppression

For dense `two_column` and `three_column` pages, the renderer suppresses module visual captions so the evidence can occupy the visual region. Put source notes, conclusions, and boundaries in nearby text blocks, module titles, or the footer.

For `biased_column`, the first module is visual-only and conclusions belong in right-side stacked cards/modules.

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
