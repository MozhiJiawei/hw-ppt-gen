# Visual Anchor Rules

Use this reference when planning or implementing the primary visual anchor for a Huawei content slide. Do not load it for cover, contents, chapter divider, or text-only appendix pages.

## Contents

- [Contract](#contract)
- [Top-Level Kinds](#top-level-kinds)
- [Templates](#templates)
- [Runtime Rendering Policy](#runtime-rendering-policy)
- [Evidence](#evidence)
- [Layout Rule](#layout-rule)
- [Quality Gates](#quality-gates)

## Contract

Every正文内容页 has exactly one primary `visual_anchor`. Text cards, captions, legends, side explanations, and micro-cards may support it, but they must not become competing anchors.

The model-facing visual anchor spec has no renderer field:

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

Required fields:

- `id`: stable file-safe id.
- `title`: short metadata title; not rendered inside generated images.
- `claim`: page-level claim; not rendered inside generated images.
- `kind`: one of `Evidence`, `Quantity`, `Sequence`, `Loop`, `Hierarchy`, `Matrix`, `Network`.
- `template`: a kind-specific visual template.
- `visual_spec`: structured data for conceptual anchors. `Evidence` uses `source` instead.

Recommended semantic fields outside `visual_spec`:

- `layout_reference`: composition reference such as `09 内容 图文并茂1` or `10 内容 图文并茂2`; this controls how the visual anchor is integrated with interpretation text.
- `relationship_test`: a one-sentence check that the chosen kind/template matches the slide's real information relationship.
- `highlight_reason`: required whenever `visual_spec.highlight` is present; this must also be reflected in visible slide text.
- `score_basis`: required when matrix/heatmap values are subjective scores rather than sourced measurements.

Never include `renderer`, `visual_strategy`, or the old `intent` field. Rendering is a runtime policy controlled by code.

Do not put slide-level wording inside SVG data. `title` and `claim` are planning/manifest metadata, not image text. Do not include standalone explanation fields anywhere under `visual_spec`, such as `annotation`, `note`, `notes`, `summary`, `callout`, `callout_title`, `caption`, `description`, `detail`, `figure_legend`, `source_note`, `interpretation`, `insight`, `rationale`, `reading_guide`, `takeaway`, or `conclusion`; put captions, page claims, figure legends, source notes, and interpretation paragraphs in editable PPT text boxes or supporting cards. For conceptual visual anchors, use `visualAnchorCaption` / `visual_anchor_caption` on `addVisualAnchorContentSlide` to render the editable figure-legend text below the visual anchor.

`visual_spec` is closed at the top level for each template. Do not add ad hoc keys to carry prose. If the slide needs prose, put it in `summary`, supporting cards, evidence legends, or other PPT text-layer fields outside the image spec.

## Top-Level Kinds

- `Evidence`: original source figure, source table, source screenshot, or source chart. Use when source material itself is the most trustworthy visual anchor.
- `Quantity`: KPI cards, bar charts, line charts, proportions, heatmaps, numeric deltas.
- `Sequence`: processes, stages, timelines, swimlanes, delivery flows.
- `Loop`: feedback cycles, dual loops, iteration ladders, flywheels.
- `Hierarchy`: trees, layered architectures, capability stacks, taxonomies.
- `Matrix`: native tables, quadrant maps, capability matrices, two-dimensional comparisons.
- `Network`: hub-spoke maps, dependency graphs, module interaction maps, causal influence graphs.

Decision priority:

1. If a source figure/table/screenshot directly proves the slide claim, choose `Evidence`.
2. If numeric evidence is central, choose `Quantity`.
3. If a closed feedback relation is central, choose `Loop`.
4. If order over time or stages is central, choose `Sequence`.
5. If containment, branching, decomposition, bottom-to-top support, or layers are central, choose `Hierarchy`.
6. If two dimensions classify or compare items, choose `Matrix`.
7. Use `Network` only for genuinely many-to-many interaction or dependency.

Rejection checks:

- Do not choose `Hierarchy` for a set of parallel mechanisms, risks, observations, metrics, or takeaways. Use `Matrix/table`, `Sequence/process`, `Network/module_interaction_map`, or `Quantity/data_cards` instead.
- Do not choose `capability_stack` unless each level clearly supports, contains, depends on, or abstracts the adjacent levels. If the relationship is "A, B, and C all matter", it is not a stack.
- Do not choose `capability_matrix` or `heatmap` for subjective risks, priorities, or maturity unless there is a source value or an explicit scoring method. Prefer qualitative tables with `高 / 中 / 低`, drivers, and observable signals.
- Do not add `highlight` just to make the visual look designed. A highlight must identify the slide's decisive evidence, bottleneck, inflection point, or action priority.
- Do not treat an `Evidence` anchor as permission to make a picture-only slide. Important source figures/charts should normally use `10 内容 图文并茂2`: a framed evidence region plus side interpretation cards in PPT text.

## Templates

Supported model-facing templates:

- Evidence: `source_figure`, `source_table`, `source_screenshot`, `source_chart`.
- Quantity: `data_cards`, `bar_chart`, `line_chart`, `proportion_chart`, `heatmap`.
- Sequence: `process`, `timeline`, `swimlane`.
- Loop: `closed_loop`, `dual_loop`, `spiral_iteration_ladder`.
- Hierarchy: `tree`, `layered_architecture`, `capability_stack`.
- Matrix: `table`, `quadrant_matrix`, `capability_matrix`, `heatmap`.
- Network: `hub_spoke_network`, `dependency_graph`, `module_interaction_map`, `causal_influence_graph`.

These names are semantic templates, not renderer names. For example, `bar_chart` may render through rough SVG or PPT native code depending on the global runtime mode.

## Runtime Rendering Policy

The model does not choose rendering. Code reads:

```text
HW_VISUAL_ANCHOR_RENDERER=rough_svg
HW_VISUAL_ANCHOR_RENDERER=ppt_native
```

Default is `rough_svg`.

Rough SVG output is an image of the visual relationship only. It may contain node labels, axis labels, values, and time labels, but it must not render page titles, slide claims, figure legends, source notes, standalone interpretation callouts, node notes, bottom slogans, side explanations, or decorative empty placeholders.

Fixed overrides:

- `Evidence` ignores the global renderer and is handled as an evidence module.
- `Matrix` + `template: "table"` ignores the global renderer and is always a native PPT table.
- All other conceptual anchors use the configured global renderer.

## Evidence

Use `Evidence` when the source visual is the anchor:

```json
{
  "id": "source_table_latency",
  "title": "Latency Source Table",
  "claim": "原始实验表格直接支撑延迟对比结论。",
  "kind": "Evidence",
  "template": "source_table",
  "source": {
    "path": ".tmp/source/table_2.png",
    "caption": "Table 2: Latency comparison",
    "relevance": "high",
    "treatment": "crop_zoom_annotate"
  }
}
```

Evidence modules must include a nearby Chinese figure/table legend, source note, and short interpretation text when space permits.

## Layout Rule

A visual anchor lives inside the normal Huawei content page structure: title, top-right section tabs, `分析总结`, red first-level bars, thin gray frames, interpretation text, and footer. Use the 图文并茂 references:

- `assets/slides_ref/09 内容 图文并茂1.png`: balanced mixed modules.
- `assets/slides_ref/10 内容 图文并茂2.png`: large visual region plus side interpretation.

Do not make a visual anchor a full-slide poster.

## Quality Gates

- Confirm each正文内容页 declares exactly one primary `visual_anchor`.
- Confirm source evidence was considered before choosing a conceptual anchor.
- Confirm the selected `kind` matches the slide's central question.
- Confirm important `Evidence/source_figure` and `Evidence/source_chart` slides include side interpretation cards or another explicit 图文并茂 layout reference.
- Confirm `relationship_test` proves the selected template's relationship. Fail `Hierarchy` when the visual is only a list of peers.
- Confirm the anchor is more informative than plain cards.
- Confirm every `highlight` has `highlight_reason`, and that the visible slide text explains the reason.
- Confirm subjective risk/priority/capability judgments are not rendered as decimal scores without `score_basis`.
- Confirm generated labels are readable and not clipped.
- Confirm rough SVG images contain only diagram-native labels, values, axes, and time labels. Page-level explanations must remain editable PPT text. Fail any generated image that includes standalone explanatory phrases, captions, source notes, node notes, or empty red callout boxes.
- Confirm rough SVG images are placed with proportional contain scaling; leave whitespace or redesign the layout rather than stretching the image to fill a region.
- Run `npm run test:diagram` after changing visual-anchor helpers.
- Run `npm run diagram-smoke` for rough SVG template changes and inspect the generated review deck.
