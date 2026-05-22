# Generated Visual Schema

Use this reference only when:

- the source has no usable evidence image; or
- a generated visual replaces long prose with a clearer visual explanation.

Generated visuals are secondary. They must not replace source evidence that proves the slide claim.

Generated visuals split into two semantic classes:

- real visual anchors: charts, flows, loops, hierarchy diagrams, network/dependency diagrams, mechanism diagrams, and quadrant visuals;
- supporting components: `Quantity/data_cards`, generated `heatmap`, `Matrix/table`, `Matrix/capability_matrix`, and `Hierarchy/capability_stack`.

Supporting components are useful for density and compression, but they are structured text/readout components. They cannot satisfy a page or module's visual-anchor requirement by themselves.

## Common Shape

```json
{
  "id": "stable_file_safe_id",
  "title": "Short metadata title",
  "claim": "一句中文核心观点。",
  "kind": "Sequence",
  "template": "process",
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

Supported generated kinds and templates are split by semantic role.

Real visual anchors:

- `Quantity`: `bar_chart`, `line_chart`, `proportion_chart`
- `Sequence`: `process`, `timeline`, `swimlane`
- `Loop`: `closed_loop`, `dual_loop`, `spiral_iteration_ladder`
- `Hierarchy`: `tree`, `layered_architecture`
- `Matrix`: `quadrant_matrix`
- `Network`: `hub_spoke_network`, `dependency_graph`, `module_interaction_map`, `causal_influence_graph`

Supporting components:

- `Quantity`: `data_cards`, `heatmap`
- `Hierarchy`: `capability_stack`
- `Matrix`: `table`, `capability_matrix`, `heatmap`

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

Put captions, source notes, conclusions, and boundaries in editable PPT text boxes or supporting cards.

Do not output implementation-control fields such as `visual_strategy` or `intent`.

## Metadata Gates

- If `visual_spec.highlight` is present, include `highlight_reason` outside `visual_spec` and echo it in visible text.
- If matrix/heatmap values are subjective scores, include `score_basis` and make the judgment nature visible. Prefer qualitative `Matrix/table` rows for subjective risks or priorities.

## Template Shapes

### `Quantity/data_cards`

Use data cards as compact KPI readouts after the module already has source evidence or a real generated visual anchor. They should not become tall filler panels and they do not count as visual anchors. Place explanatory density in adjacent short conclusion lines or a conclusion note. Use a `Matrix/table` only when the missing structure is a real comparison.

```json
{
  "kind": "Quantity",
  "template": "data_cards",
  "visual_spec": {
    "cards": [
      { "id": "baseline", "label": "基线", "value": "120", "unit": "项" },
      { "id": "improved", "label": "改进后", "value": "45", "unit": "项" }
    ],
    "highlight": "improved"
  },
  "highlight_reason": "高亮改进后，因为它承载资源收敛结果。"
}
```

### `Quantity/bar_chart` / `Quantity/line_chart`

```json
{
  "kind": "Quantity",
  "template": "bar_chart",
  "visual_spec": {
    "y_label": "资源投入",
    "categories": ["基线", "改进后"],
    "series": [
      { "name": "投入项", "values": [120, 45] }
    ],
    "highlight": { "category": "改进后", "series": "投入项" }
  },
  "highlight_reason": "高亮改进后，因为它对应资源收敛结果。"
}
```

### `Sequence/process`

```json
{
  "kind": "Sequence",
  "template": "process",
  "visual_spec": {
    "steps": [
      { "id": "input", "label": "输入" },
      { "id": "process", "label": "处理" },
      { "id": "release", "label": "过程窗口释放" }
    ],
    "orientation": "horizontal",
    "highlight": "release"
  },
  "highlight_reason": "高亮过程窗口释放，因为它是机制变化点。"
}
```

### `Matrix/table`

Generated or transcribed tables must use `Matrix/table`; do not call a page-level table helper directly.

Use `Matrix/table` only when rows and columns jointly create meaning. It is a supporting component, not a visual anchor. Do not use it as a cosmetic replacement for `标签：正文` lines.
Do not use multiple generated tables on the same summary page just to increase density. If the table is not the clearest way to see the relationship, use conclusion lines, KPI cards, or a conclusion note.
Avoid weak two-column tables such as `口径 / 判断`, `字段 / 含义`, or `维度 / 说明`; they are usually prose in table clothing.

```json
{
  "kind": "Matrix",
  "template": "table",
  "visual_spec": {
    "rows": [
      ["方案", "释放窗口", "判断口径"],
      ["基线", "等批次结束", "等待被末端步骤锁住"],
      ["改进", "过程窗口释放", "释放点前移，等待缩短"]
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
- `Quantity/data_cards`, generated `heatmap`, `Matrix/table`, `Matrix/capability_matrix`, and `Hierarchy/capability_stack`: supporting components only; do not use them as the sole visual object in a content module.

## Rejection Checks

- Do not choose generated visuals when readable source evidence should carry the claim.
- Do not choose `Hierarchy/capability_stack` for parallel mechanisms or metrics.
- Do not make subjective scores look like sourced measurements.
- Do not add highlight for decoration.
- Do not include standalone prose inside generated visual output.
