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
- `supporting_component`
- `text`

For `two_column`, `three_column`, and `four_column`, every module must include at least one real visual anchor. Text blocks are allowed only as nearby interpretation, conclusion, or caveat for that module's visual anchor; they must not become a standalone column.

The visual anchor must bind to that same module. The module title, visual-anchor `claim`, and text block body should share the same subject and judgment. If they do not, the module is wrong even when it has a real source figure.

Real visual anchors are evidence or diagrams:

- `Evidence/source_figure`, `Evidence/source_chart`, `Evidence/source_screenshot`, or source-backed `Evidence/source_table`;
- generated charts such as `bar_chart`, `line_chart`, and `proportion_chart`;
- generated relationship diagrams such as process, timeline, loop, hierarchy, network, dependency, mechanism, or quadrant visuals.

Structured text components should be written as `type: "supporting_component"` blocks. They do not count as visual anchors, even though the renderer records them in the same manifest-backed component path for QA traceability:

- `Quantity/data_cards`
- generated `heatmap`
- `Matrix/table`
- `Matrix/capability_matrix`
- `Hierarchy/capability_stack`

Use those components only after the module already has evidence or a real diagram. They are density/readout helpers, not substitutes for the anchor.

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
      "path": ".tmp/deck/images/figure_1_complete_subfigure.png",
      "caption": "Figure 1: workload"
    }
  }
}
```

Use `references/evidence_schema.md` for source evidence. Use `references/generated_visual_schema.md` for generated visuals.

Do not choose a visual anchor from another page section only to satisfy the module-anchor rule. If the module claim is about cache-retention performance, use the evidence that compares retention levels. If the module claim is about training-time random routing, use the figure or generated mechanism diagram that shows stochastic cross-layer attention.

Do not make a source crop just to fit the layout. If you use a derived source image, it must be a complete subfigure or source-provided region with axes, labels, legends, borders, and decisive annotations preserved. Layout should adapt around evidence; evidence should not be damaged to fit the layout.

## Supporting Component Block

```json
{
  "type": "supporting_component",
  "visual_anchor": {
    "id": "stable_readout_id",
    "title": "KPI readout",
    "claim": "结构化读数支撑旁边证据。",
    "kind": "Quantity",
    "template": "data_cards",
    "visual_spec": {
      "cards": [
        { "id": "full", "label": "完整缓存", "value": "100%", "unit": "" },
        { "id": "half", "label": "半量缓存", "value": "50%", "unit": "" }
      ]
    }
  }
}
```

The nested `visual_anchor` object is a renderer spec kept for implementation compatibility. The block's semantic role is still `supporting_component`; it is not a strict visual anchor.

## Text Block

```json
{
  "type": "text",
  "body": [
    "资源错配：非关键环节仍占用固定投入。",
    "弹性不足：异常波动会抬高安全垫。",
    "判断：优化起点是需求形态，不是单点效率。"
  ],
  "emphasis": ["非关键环节", "安全垫", "优化起点"],
  "fontSize": 12
}
```

Use text blocks for source-grounded judgments, caveats, conclusions, and compact business decisions. Text remains editable PPT text.

Text block rules:

- In `two_column`, `three_column`, and `four_column`, do not use a text block as the only block in a module.
- Use 2-5 short lines by default.
- Avoid more than 6 visible lines in one text block.
- Avoid more than 4 total visible text lines inside a three-column module; other column modules should stay under 6. If the module needs more, move the extra material into `Matrix/table`, KPI cards, or a conclusion note.
- Keep each line as `结论柄：判断` when possible.
- Avoid meta labels such as `读法`, `含义`, `说明`, and `可见` as repeated body rhythm. They describe how the slide is read, not what the audience should conclude.
- If those words appear in the brief, translate them into claim handles before writing visible body text.
- Treat the words before `：` as structural claim handles. They guide scanning and render bold black; do not put them in `emphasis`.
- Use `emphasis` for 1-3 decisive words, numbers, or conclusion variables after the claim handle. The renderer marks those terms Huawei red and bold.
- Do not mark a term red just because it is a repeated technical noun or a tidy label. Red should answer "what must the reader remember?"
- Do not use `emphasis` to color a whole sentence.

For longer material, use a supporting component instead of prose, but do not turn every column into a table:

- `Quantity/data_cards` for KPI readouts.
- `Matrix/table` for real dimensions, comparisons, stage splits, risks, boundaries, or decision paths.
- A separate short `text` block for final conclusion or boundary.

These supporting components still do not satisfy the module's visual-anchor requirement. Add source evidence or a generated diagram/chart first, then place the component as the readout.

Do not use `Matrix/table` as a disguised `标签：正文` list. If a two-column table can be read row-by-row as `字段：一句话`, it should usually stay as short conclusion lines. A useful table must make the row/column intersection carry meaning, such as `基线 vs 改进`, `阶段A vs 阶段B`, `风险 vs 收敛动作`, or `指标 vs 证据 vs 判断`.
Weak table pairs include `口径 / 判断`, `维度 / 说明`, and `字段 / 含义`; these are usually better as conclusion lines or a bordered note.

On `three_column` summary pages, use generated tables sparingly. Prefer source evidence plus conclusion lines in each column; add a table only for the one column whose claim depends on a real comparison or stage split.

On three-column summary pages, keep the primary source figure readable before adding conclusion text. Do not shrink a non-wide evidence figure below roughly one quarter of the module height just to add more text.
When evidence still feels tight, remove secondary prose or decorative structure first. The correct response is a stronger evidence-first composition, not more explanatory text.

## Dense Caption Suppression

For dense `two_column` and `three_column` pages, the renderer suppresses module visual captions so the evidence can occupy the visual region. Put source notes, conclusions, and boundaries in nearby text blocks, module titles, or the footer.

For `biased_column`, the first module is visual-only and conclusions belong in right-side stacked cards/modules.

## Layout Measurement Diagnostics

The renderer classifies body blocks into Huawei layout primitives before drawing. This does not change the authoring schema: agents still provide `visual_anchor`, `supporting_component`, and `text` blocks, not coordinates.

For module stacks, the manifest records primitive taxonomy, measured min/preferred/final sizes, resize policy, layout status, and diagnostics. Official body-content templates are expected to be measured. `legacy_fallback` or `unsupported` is a hard layout failure, not a successful render path.

Use diagnostics to reduce content density when QA reports an infeasible module, evidence below readable floor, width overflow, or excessive shrink. Do not solve those failures by adding manual coordinates or direct image/table blocks.

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
