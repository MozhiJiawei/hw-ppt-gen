# PPT Content Brief Consumption

This reference defines how this Huawei PPT generator consumes an optional upstream `ppt_content_brief.md` from `ppt-deep-search`.

The brief is an upstream content contract, not a Huawei layout contract. Validate and normalize it first, then map it into the existing deck plan and `addVisualAnchorContentSlide` slide schema. Do not add another rendering path.

## Evidence-First Principle

Huawei-style output from this skill is dense, evidence-first, and fact-presenting. Source evidence is TOP1. If brief text uses `Figure X`, `Figure X 说明`, `Figure X 展示`, `如图 X`, or equivalent wording to establish a point, that figure is part of the page's evidence structure. Keep the source figure on the same slide as an `Evidence/source_figure` or `Evidence/source_chart` anchor unless it is unreadable, unrelated to the slide claim, or misleading without surrounding context.

Redrawn diagrams, KPI cards, matrices, and hand-drawn Huawei-style visuals may coexist with source evidence. Use them to make the fact easier to scan, not to replace the cited source figure when the page's text depends on that figure.

## Required Shape

`ppt_content_brief.md` must contain:

- `# PPT Content Brief`
- `## Deck Metadata`
- `## Summary Page`

Multi-page decks must also contain:

- `## Table of Contents`
- `## Page Content`

One-page decks contain only `Deck Metadata` and `Summary Page`; they omit `Table of Contents` and `Page Content`.

## 硬约束字段

These fields must be preserved in the downstream plan and visible text. Do not rewrite their meaning during generation.

- `页面标题`: map to slide `title`.
- `标题说明`: map to `titleNote` / `titleSubtitle`.
- `分析总结`: map to `summary.body` entries as `{ label, text }`. Keep the source labels; do not replace them with generic labels such as `结论1`.
- `## Table of Contents` items: map `小标题` to contents-page items and to the content-slide `sections` array.
- `所属章节`: map to each content slide's `currentSection`. It must exactly match one TOC `小标题`. Summary Page is standalone and does not get `currentSection`.
- Page order: content pages must progress monotonically through the TOC order.
- Page count: Summary Page is Page 2 in multi-page decks and Page 1 in one-page output.

`分析总结` must contain 1-3 bullets in `小标题：解释` form. Each label must be explicitly supported by at least one `正文内容` bullet or paragraph beginning with the same label.

Keep the top `分析总结` band unchanged. Use the number of `分析总结` entries to choose the lower content layout:

- 1 条 `分析总结` -> `contentLayout.type = "biased_column"` / `06 内容 偏分栏`.
- 2 条 `分析总结` -> `contentLayout.type = "two_column"` / `05 内容 二分栏`.
- 3 条 `分析总结` -> `contentLayout.type = "three_column"` / `07 内容 三分栏`.

The parser derives this as `contentLayoutRecommendation` and exposes the downstream hard field as `planContract.slides[].contentLayout.type`. Treat `contentLayout.type` as the authoritative layout value for brief-backed pages; the Chinese Huawei reference label is derived from that type by scripts and QA, not maintained separately by the model.

## Reference-Only Fields

These fields provide material for Huawei-style compression, body cards, captions, notes, and visual-anchor selection. They are not direct layout or rendering instructions.

- `正文内容`: content pool for supporting cards, explanatory text, interpretation, captions, and table/matrix values. It must support the chosen `分析总结` labels.
- `参考图片`: evidence and visual source candidates. Absolute local paths may appear as source locators in the brief so downstream agents can bind `Figure X` to the extracted image file. Use it to decide whether a slide needs `Evidence/source_figure` or a redrawn `Quantity`, `Sequence`, `Matrix`, `Hierarchy`, `Loop`, or `Network` anchor.
- `备注`: speaker notes, footnotes, caveats, or low-distraction limitations.
- `research_audit.md`: verification-only source for facts, evidence boundaries, and source locators. Do not copy audit vocabulary or Claim/Evidence/Implication scaffolding into visible slide text.

## Parser Contract

Use `scripts/pptx/parse_ppt_content_brief.js` before generation:

```bash
node scripts/pptx/parse_ppt_content_brief.js path/to/ppt_content_brief.md --expected-pages 7 --json
```

The parser returns:

- `metadata`
- `sections`
- `summaryPage`
- `tocItems`
- `contentPages`
- `slideContract.cover`
- `slideContract.summary`
- `slideContract.toc`
- `slideContract.contentSlides`
- `contentLayoutRecommendation` on parsed summary/content slides, derived from the count of `分析总结` entries
- `planContract.slides`, the hard deck-plan mapping for brief-backed pages

The parser validates required fields, page numbers, chapter matching, TOC monotonicity, supported analysis labels, and banned audit/layout tokens. It does not reject absolute local paths; paths are source locators, not visible deck text. Deck generation must copy hard fields from `planContract.slides`; agents should not recreate this mapping manually.

## Mapping To Existing Deck Plan

Map the normalized structure into the existing plan and slide schema:

- `Deck Metadata.主题` -> cover title or subtitle context.
- `Deck Metadata.核心结论` -> cover subtitle or summary context.
- `Table of Contents` -> `addTocSlide({ items })`.
- `sections` -> every content page's top-right chapter indicator.
- `Summary Page` -> standalone top-level conclusion slide.
- `Page Content` -> `addVisualAnchorContentSlide`.
- `页面标题` -> `title`.
- `标题说明` -> `titleNote`.
- `分析总结` -> `summary.body`.
- `contentLayoutRecommendation` -> lower content-area `contentLayout.type`; scripts and QA derive the fixed Huawei reference from this type.
- `所属章节` -> `currentSection` on content slides only.
- `正文内容`, `参考图片`, `备注` -> source pool for `contentLayout` text blocks, visual-anchor selection, captions, source notes, speaker notes, and footers. When the brief provides an absolute path for `Figure X`, preserve the path in parsed data and route it through an `Evidence/source_figure` visual anchor when the page text depends on that figure.

When hard QA runs for a brief-backed deck, pass the brief path:

```bash
node scripts/qa/check_huawei_pptx.js .tmp/<deck>/<deck>.pptx \
  --require-plan .tmp/<deck>/<deck>_plan.json \
  --require-ppt-content-brief path/to/ppt_content_brief.md
```

QA fails when the deck plan rewrites `页面标题`, `标题说明`, `分析总结`, content-slide `所属章节`, page order, or parser-derived `contentLayout.type`. If a plan also records `layout_reference`, QA treats it as a derived label and fails only when it conflicts with `contentLayout.type`.

Brief-backed hard fields are immutable: do not shorten, rewrite, hide, or substitute them to satisfy style, language, title-wrap, density, or visual-QA feedback. This is not a waiver for sparse or weak page design. If the deck feels underfilled, solve it in PPT-gen by using `正文内容`, cited source evidence, notes, modules, cards, charts, tables, or a denser layout while keeping the brief hard fields unchanged. If a hard field itself is unreasonable, keep the PPT aligned with the brief and record an upstream `ppt-deep-search` issue.

The brief does not contain `visual_anchor.kind`, `template`, `contentLayout`, column count, font size, color, or renderer choices. Choose those in the downstream plan using `references/visual_diagram_rules.md`, `references/visual_diagram_spec_schema.md`, and `references/content_layout_schema.md`.

## Forbidden Consumption Patterns

- Do not silently invent missing facts from `research_audit.md`.
- Do not accept `contentLayout`, `template:`, `visual_anchor.kind`, font, color, or column-count instructions inside the brief.
- Do not put slide captions, source notes, reading guidance, or conclusions into `visual_anchor.visual_spec`.
- Do not use `参考图片` as a direct image bypass; source figures must enter through `Evidence`.
- Do not copy `Claim`, `Evidence`, `Implication`, approval logs, source locator tables, or local absolute paths into PPT visible text.

If validation fails, ask for a revised brief or fix the brief as a source artifact before generating the PPT.
