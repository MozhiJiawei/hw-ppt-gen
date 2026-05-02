# Visual Anchor Spec Schema

Use this reference after `references/visual_diagram_rules.md` has selected a `visual_anchor.kind` and `visual_anchor.template`.

The renderer is not part of the spec. Code chooses rough SVG or PPT native from `HW_VISUAL_ANCHOR_RENDERER`, with fixed overrides for `Evidence` and native tables.

## Contents

- [Common Shape](#common-shape)
- [Quantity](#quantity)
- [Sequence](#sequence)
- [Loop](#loop)
- [Hierarchy](#hierarchy)
- [Matrix](#matrix)
- [Network](#network)
- [Evidence](#evidence)

## Common Shape

```json
{
  "id": "stable_file_safe_id",
  "title": "Short review title",
  "claim": "一句中文核心观点。",
  "kind": "Quantity",
  "template": "bar_chart",
  "visual_spec": {}
}
```

Required common fields:

- `id`
- `title`
- `claim`
- `kind`: `Evidence`, `Quantity`, `Sequence`, `Loop`, `Hierarchy`, `Matrix`, or `Network`
- `template`

For all conceptual anchors except `Evidence`, include `visual_spec`. For `Evidence`, include `source`.

Do not output `renderer`, `visual_strategy`, `intent`, or `visual_spec.annotation`.

`title` and `claim` are metadata for planning, manifest review, and PPT composition. They are not rendered inside generated SVG images. Standalone captions, figure legends, source notes, and explanatory paragraphs belong in editable PPT text boxes or supporting cards, not inside `visual_spec`.

## Quantity

### `data_cards`

```json
{
  "kind": "Quantity",
  "template": "data_cards",
  "visual_spec": {
    "cards": [
      { "id": "roi", "label": "ROI 提升", "value": "42", "unit": "%", "note": "季度环比" },
      { "id": "cost", "label": "成本下降", "value": "18", "unit": "%", "note": "资源节省" }
    ],
    "highlight": "roi"
  }
}
```

### `bar_chart` / `line_chart`

```json
{
  "kind": "Quantity",
  "template": "bar_chart",
  "visual_spec": {
    "y_label": "SWE-bench (%)",
    "categories": ["o3-mini", "Claude 3.5", "Claude 3.7"],
    "series": [
      { "name": "Base agent", "values": [23.0, 20.0, 19.0] },
      { "name": "DGM agent", "values": [33.0, 50.0, 59.5] }
    ],
    "highlight": { "category": "Claude 3.7", "series": "DGM agent" }
  }
}
```

Rules:

- All series must match category count.
- Use `highlight` for the main value, not every improved value.

### `proportion_chart`

```json
{
  "kind": "Quantity",
  "template": "proportion_chart",
  "visual_spec": {
    "total_label": "流量占比",
    "segments": [
      { "label": "搜索", "value": 52 },
      { "label": "推荐", "value": 33 },
      { "label": "直达", "value": 15 }
    ],
    "highlight": "推荐"
  }
}
```

### `heatmap`

Use for numeric values across two dimensions. It can be `Quantity` when cell values are the message, or `Matrix` when coverage/classification is the message.

```json
{
  "kind": "Quantity",
  "template": "heatmap",
  "visual_spec": {
    "rows": ["安全", "效率", "成本"],
    "columns": ["方案A", "方案B", "方案C"],
    "values": [[0.2, 0.7, 0.4], [0.8, 0.5, 0.3], [0.3, 0.6, 0.9]],
    "highlight": { "row": "成本", "column": "方案C" }
  }
}
```

## Sequence

### `process`

```json
{
  "kind": "Sequence",
  "template": "process",
  "visual_spec": {
    "steps": [
      { "id": "request", "label": "需求输入", "note": "澄清目标" },
      { "id": "plan", "label": "任务规划", "note": "拆分步骤" },
      { "id": "review", "label": "规则校验", "note": "验证质量" }
    ],
    "highlight": "review",
    "orientation": "horizontal"
  }
}
```

`orientation` may be `horizontal` or `vertical`; omit it for horizontal.

### `timeline`

Same as `process`, with `time` on each step.

### `swimlane`

```json
{
  "kind": "Sequence",
  "template": "swimlane",
  "visual_spec": {
    "lanes": [
      { "id": "biz", "label": "业务", "steps": [{ "id": "b1", "label": "提出目标" }] },
      { "id": "agent", "label": "Agent", "steps": [{ "id": "a1", "label": "执行验证" }] }
    ],
    "highlight": "a1"
  }
}
```

## Loop

### `closed_loop`

```json
{
  "kind": "Loop",
  "template": "closed_loop",
  "visual_spec": {
    "center": "Self-improving Agent",
    "steps": [
      { "id": "inspect", "label": "分析失败", "note": "读取日志" },
      { "id": "edit", "label": "修改自身", "note": "改工具" },
      { "id": "eval", "label": "基准评测", "note": "验证收益" }
    ],
    "highlight": "eval"
  }
}
```

`dual_loop` uses `loops`; `spiral_iteration_ladder` uses `center` and `steps`.

## Hierarchy

Supported templates:

- `tree`: nodes, edges, labels, highlight.
- `layered_architecture`: layers, side_modules, edges.
- `capability_stack`: levels, highlight.

Edges must reference known node/item ids. Unknown endpoints are validation errors.

## Matrix

### `table`

Tables are always native PPT tables. Use for generated or transcribed structured comparisons.

```json
{
  "kind": "Matrix",
  "template": "table",
  "visual_spec": {
    "rows": [
      ["能力", "当前", "目标"],
      ["检索", "人工", "自动"]
    ]
  }
}
```

### `quadrant_matrix` / `capability_matrix`

Use the same fields as the existing rough SVG implementations:

- `quadrant_matrix`: `x_axis`, `y_axis`, `items`, optional `highlight`.
- `capability_matrix`: `rows`, `columns`, `values`, optional `highlight`.

## Network

Supported templates:

- `hub_spoke_network`: `hub`, `nodes`, `edges`.
- `dependency_graph`
- `module_interaction_map`
- `causal_influence_graph`

Graph templates require explicit `nodes` and `edges`. Unknown endpoints are validation errors.

## Evidence

Evidence has no `visual_spec` requirement:

```json
{
  "id": "source_figure_arch",
  "title": "Source Architecture Figure",
  "claim": "原始架构图是本页的核心证据。",
  "kind": "Evidence",
  "template": "source_figure",
  "source": {
    "path": ".tmp/source_figures/figure_3.png",
    "caption": "Figure 3: System architecture",
    "treatment": "crop_zoom_annotate"
  }
}
```
