# PPT Content Brief Contract

Use this reference when the input includes `ppt_content_brief.md`.

The brief is an upstream content contract. It fixes story, titles, conclusions, section order, and layout family. It is not a rendering script.

## Parse First

Run:

```bash
node scripts/pptx/parse_ppt_content_brief.js path/to/ppt_content_brief.md --json
```

Use parser output as the source of truth. Do not recreate mappings from memory.

## Hard Fields

Preserve these fields in the plan and visible deck:

- page count and page order;
- `页面标题` -> slide `title`;
- `标题说明` -> `titleNote` / `titleSubtitle`;
- `分析总结` -> `summary.body` label/text;
- TOC `小标题` and descriptions;
- content-slide `所属章节` -> `currentSection`;
- parser-derived `bodyLayout.type` for the Body DSL root layout.

Do not shorten, rewrite, hide, or substitute hard fields to satisfy style, density, or visual-QA feedback. If a hard field creates a visible design issue, keep it, let the layout allocate the needed space, and record an upstream brief issue only when the page still cannot fit.

## Layout Family

The parser derives the Body DSL layout family from `分析总结` count:

- 1 point -> `biased_column`;
- 2 points -> `two_column`;
- 3 points -> `three_column`.

Use this `bodyLayout.type` as mandatory for brief-backed summary and content pages.

## Source Material Fields

Use these fields as material for layout and compression:

- `正文内容`: supporting explanation, readings, caveats, table values, KPI text.
- `参考图片`: source evidence. Route source figures, charts, screenshots, and tables through `Evidence` anchors.
- `备注`: speaker notes, caveats, low-distraction limitations.
- `research_audit.md`: verification-only source. Do not copy Claim/Evidence/Implication scaffolding into visible slides.

Local paths and Markdown image URLs inside `正文内容` or `参考图片` are source locators. Use them to find and route evidence; do not render the raw path text on the slide.

`核心结论` is deck-level source material, not a cover subtitle. Use it to guide the summary page and speaker notes. If the cover needs a subtitle, use the Summary Page `标题说明` or a shorter positioning phrase that fits one line. The hard-field immutability rule applies to summary/content page `titleNote`; it does not require rendering the full `核心结论` inside the cover.

When a brief captions a source figure with what it proves, preserve that evidence relationship. A source image cited for one page section may be reused if it proves another local module claim, but it must not be borrowed as a generic image placeholder for an unrelated claim.

## Forbidden Patterns

- Do not copy local absolute paths into visible slide text.
- Do not accept `template`, `visual_anchor.kind`, font, color, or column-count instructions inside the brief.
- Do not use `参考图片` as direct `addImage` bypass; source figures enter through `Evidence`.
- Do not make a KPI/generated visual replace a cited source figure that carries the claim.
