# Skeleton Plan Schema

The skeleton plan is the mechanical frame contract for Huawei-style decks. It owns cover, contents, section tabs, page chrome, title text, title note, analysis-summary text, footer source, and page number.

It does not own creative body content below the analysis-summary band.

## Minimum Fields

```text
cover.title
cover.subtitle
cover.department
cover.date

toc.title
toc.items[].title
toc.items[].note

sections[]

slides[].page
slides[].role
slides[].title
slides[].titleNote
slides[].summary
slides[].currentSection
slides[].source
```

`slides[].summary` may use the existing summary object shape with `body`/`items`, or a plain string where supported by the renderer.

## Out Of Scope

The skeleton plan must not own:

- body content below the fixed `分析总结` band;
- evidence inventory or source image placement;
- visual anchors;
- supporting components;
- delivery constraints;
- body slot coordinates;
- low-level layout geometry for the creative body area.

The frame renderer computes the blank body entry area. Later body authoring layers may consume that budget, but they must not push those fields back into the skeleton plan.

## Contract Test

`scripts/smoke/test_ppt_skeleton_rendering.js` is the executable contract for this schema. The fixture at `scripts/smoke/fixtures/ppt_skeleton_plan.json` intentionally includes body-content and reference-image sentinels; those fields must not render in a skeleton deck.
