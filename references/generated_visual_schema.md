# Generated Visual Schema

Use this reference only when:

- the source has no usable evidence image; or
- a generated visual replaces long prose with a clearer visual explanation.

Generated visuals are secondary. They must not replace source evidence that proves the slide claim.

## Common Shape

```json
{
  "id": "stable_file_safe_id",
  "title": "Short metadata title",
  "claim": "一句中文核心观点。",
  "kind": "Matrix",
  "template": "table",
  "visual_spec": {}
}
```

Required common fields:

- `id`
- `title`
- `claim`
- `kind`
- `template`
- `visual_spec`

Supported generated kinds and templates:

- `Quantity`: `data_cards`, `bar_chart`, `line_chart`, `proportion_chart`, `heatmap`
- `Sequence`: `process`, `timeline`, `swimlane`
- `Loop`: `closed_loop`, `dual_loop`, `spiral_iteration_ladder`
- `Hierarchy`: `tree`, `layered_architecture`, `capability_stack`
- `Matrix`: `table`, `quadrant_matrix`, `capability_matrix`, `heatmap`
- `Network`: `hub_spoke_network`, `dependency_graph`, `module_interaction_map`, `causal_influence_graph`

## Field Boundaries

`title` and `claim` are metadata. They are not rendered inside generated images.

Do not put slide-level prose inside `visual_spec`, including:

- `caption`
- `description`
- `detail`
- `figure_legend`
- `source_note`
- `interpretation`
- `insight`
- `rationale`
- `reading_guide`
- `takeaway`
- `conclusion`
- `note` / `notes`
- `callout`

Put captions, source notes, reading guidance, and interpretation in editable PPT text boxes or supporting cards.

Do not output implementation-control fields such as `visual_strategy` or `intent`.

## Metadata Gates

- If `visual_spec.highlight` is present, include `highlight_reason` outside `visual_spec` and echo it in visible text.
- If matrix/heatmap values are subjective scores, include `score_basis` and make the judgment nature visible. Prefer qualitative `Matrix/table` rows for subjective risks or priorities.

## Template Shapes

### `Quantity/data_cards`

```json
{
  "kind": "Quantity",
  "template": "data_cards",
  "visual_spec": {
    "cards": [
      { "id": "before", "label": "原 H20", "value": "1,192", "unit": "个" },
      { "id": "after", "label": "现 H20", "value": "213", "unit": "个" }
    ],
    "highlight": "after"
  },
  "highlight_reason": "高亮现 H20，因为它承载生产侧资源收敛结果。"
}
```

### `Quantity/bar_chart` / `Quantity/line_chart`

```json
{
  "kind": "Quantity",
  "template": "bar_chart",
  "visual_spec": {
    "y_label": "GPU 数量",
    "categories": ["部署前", "部署后"],
    "series": [
      { "name": "H20", "values": [1192, 213] }
    ],
    "highlight": { "category": "部署后", "series": "H20" }
  },
  "highlight_reason": "高亮部署后，因为它对应最终资源需求。"
}
```

### `Sequence/process`

```json
{
  "kind": "Sequence",
  "template": "process",
  "visual_spec": {
    "steps": [
      { "id": "prefill", "label": "prefill" },
      { "id": "decode", "label": "decoding" },
      { "id": "switch", "label": "token 间隙换模" }
    ],
    "orientation": "horizontal",
    "highlight": "switch"
  },
  "highlight_reason": "高亮 token 间隙换模，因为它是机制突破点。"
}
```

### `Matrix/table`

Generated or transcribed tables must use `Matrix/table`; do not call a page-level table helper directly.

```json
{
  "kind": "Matrix",
  "template": "table",
  "visual_spec": {
    "rows": [
      ["维度", "证据", "含义"],
      ["成本", "1,192 -> 213 H20", "生产 GPU 需求下降"],
      ["稳定", "未观察到 SLO violation", "只按观测口径表述"]
    ]
  }
}
```

### Other Templates

Use the same common shape and keep `visual_spec` relationship-native:

- `Loop`: center/steps/loops only.
- `Hierarchy`: nodes/layers/levels only; use only for real containment, layering, decomposition, or support relationships.
- `Network`: nodes/edges only; use only for real many-to-many relationships.
- `Matrix/capability_matrix` and `Quantity/heatmap`: use only for sourced values or explicit scoring methods.

## Rejection Checks

- Do not choose generated visuals when readable source evidence should carry the claim.
- Do not choose `Hierarchy/capability_stack` for parallel mechanisms or metrics.
- Do not make subjective scores look like sourced measurements.
- Do not add highlight for decoration.
- Do not include standalone prose inside generated visual output.
