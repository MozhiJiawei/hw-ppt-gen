---
name: huawei-pptx-generator
description: Generate new Huawei-style PPTX decks from arbitrary readable source material using pptxgenjs. Use when Codex must create a fresh .pptx from webpages, Markdown, paper extraction output, repository analysis, plain text, or a user prompt, with Huawei business-material styling only. This skill does not edit, merge, split, or deeply modify existing presentations and does not offer alternate visual themes.
---

# Huawei PPTX Generator

Generate a new Huawei-style `.pptx` deck from readable input material. The runtime goal is not to "make slides"; it is to deliver dense, evidence-first, fact-presenting Huawei business material.

## Load First

Always read:

- `references/delivery_standard.md`
- `references/page_standards.md`

Then load only what the task needs:

- `references/brief_contract.md` when the input includes `ppt_content_brief.md`.
- `references/evidence_schema.md` before placing source image evidence.
- `references/layout_standards.md` before choosing a body layout family.
- `references/slide_dsl_authoring_schema.md` before writing `bodyDsl`.
- `references/generated_dsl_component_catalog.md` when choosing body components or generated drawing.
- `references/generated_dsl_component_details/<draw>.md` before writing a `<Visual draw="Kind/template" ... />` model selected from the generated catalog.
- `references/huawei_layout_primitives.md` when a content page is dense enough that evidence, supporting components, and text compete for space.
- `references/generated_visual_schema.md` when a discovered component detail points to generated visual model fields.

Body component discovery is automatic. Do not rely on hand-written component lists in this skill. Author `bodyDsl` as JSX-like markup parsed by `scripts/pptx/dsl/jsx_dsl.js`, not as raw JSON or manual coordinate objects. Before authoring `bodyDsl`, run:

```bash
node scripts/pptx/dsl/list_components.js
```

For every body component you intend to use, inspect its generated contract:

```bash
node scripts/pptx/dsl/describe_component.js <ComponentTag>
```

For generated drawing, use `<Visual draw="Kind/template" model={...} />`. Choose the draw id from `references/generated_dsl_component_catalog.md`, then open the linked detail file under `references/generated_dsl_component_details/` for the model shape. Treat registry-discovered source-evidence components as higher proof priority than the generated-drawing entry.

## Hard Priorities

1. Source evidence is TOP1. If source evidence supports the slide claim, it must appear as readable evidence.
2. One page has one primary evidence object. Do not hide multiple source figures inside one unreadable collage.
3. Evidence must bind to the nearby claim. The module title, evidence `claim`, and editable conclusion lines must describe the same subject and judgment; never borrow an unrelated figure just to satisfy the proof requirement.
4. Generated drawings are secondary. Use them only when evidence images are missing, when they annotate preserved source evidence, or when they replace long prose with a clearer visual explanation.
5. Brief-backed hard fields are immutable: page count, page order, titles, title notes, analysis summary, TOC, content-slide sections, and parser-derived body layout type. Put the parser-derived body layout type into the discovered Body DSL layout root's layout-type prop.
6. Page chrome is not body composition. Title, title note, section tabs, `分析总结`, summary body, footer, and page number must be rendered only by the Huawei shell helpers from the parsed brief. Do not add manual `textBox` or shape overlays in the title-summary gap or change shell coordinates to fix body density.
7. Huawei density means readable evidence plus compact conclusions, not pasted paragraphs or empty cards.
8. Visible text must become short claim lines, deliberate red-bold emphasis terms, and conclusion boxes by default. KPI/readout cards are only for real numeric readouts; tables are only for real row/column relationships. Do not use long bullet stacks, decorative tables, or fake KPI cards to fill space.
9. Write the slide as conclusions, not as instructions for reading the slide. Avoid meta labels such as `读法`, `含义`, `说明`, and `可见`; use claim handles such as `问题定性`, `机制变化`, `业务收益`, `边界条件`, and `决策口径`.
10. Tables are exceptional compression, not the default density tool. On a three-column summary, prefer evidence + conclusion lines; use at most one generated table unless the brief explicitly requires multiple real comparisons.
11. Real proof components are source evidence or generated drawings, not structured text. `data_cards`, `Matrix/table`, `capability_matrix`, `capability_stack`, and generated `heatmap` are supporting components: use them for density, but never to satisfy a page or module's proof requirement.
12. Preserve semantic anchors when repairing QA feedback. A semantic anchor is the source evidence, generated drawing, chart, table, KPI group, or key text block that carries a module's main claim. Proof priority is `source_evidence > generated_drawing > supporting_readout > text`. Once Body DSL compiles successfully, runtime QA records each page/module's primary visual-anchor proof type and the CLI will tell you this memory is active. If the first authored Body DSL chose source evidence for a module, keep that same source evidence as the primary proof through repair. Improve layout by giving it more slot, reducing neighbors, adding source-grounded conclusion lines, or using generated drawing only as supporting explanation around the preserved evidence. Replace the anchor only when it is semantically wrong, unsupported, unreadable, or unable to prove the claim after reasonable strengthening.

## Runtime Workflow

1. Read the source material and identify audience, purpose, storyline, and evidence.
   - Visible text created by you must be Chinese.
   - Keep source images as-is; translate slide titles, subtitles, card titles, body text, captions, footers, contents, and review notes.
   - Keep necessary technical acronyms, product names, metric names, and source-specific terms inline when the brief or evidence requires them.
2. If `ppt_content_brief.md` is present:
   - Read `references/brief_contract.md`.
   - Run `node scripts/pptx/parse_ppt_content_brief.js <brief> --json`.
   - Copy hard fields from parser output into the generated slide data. Do not hand-map them from memory.
3. Choose a deck name `<deck>` and write all run-specific artifacts under `.tmp/<deck>/`:
   - `.tmp/<deck>/<deck>.pptx`
   - `.tmp/<deck>/generate_<deck>.js`
   - `.tmp/<deck>/<deck>_content_review.json` or `.md`
   - `.tmp/<deck>/images/`
   - `.tmp/<deck>/slides/`
4. Compose the deck before coding:
   - Use cover and contents pages for decks over four slides.
   - Do not add standalone chapter divider pages.
   - Every content and summary page rendered through `addVisualAnchorContentSlide` must pass `bodyDsl`, have `分析总结`, a page title, Huawei content framing, footer, and at least one real proof component: source image evidence, source chart evidence, or a generated drawing that can be understood without reading the surrounding prose.
   - Pass brief-derived `title`, `titleNote`, `summary`, `sections`, `currentSection`, `source`, and `page` into `addVisualAnchorContentSlide` verbatim. Do not draw extra title, title-note, analysis-summary, footer, or page-number text after the helper returns.
   - Discover component tags and props through `list_components.js` and `describe_component.js`; do not invent tags or copy examples from memory.
   - In multi-module body layouts, every module must include at least one real proof component. Supporting components can support the module, but they do not count as proof.
   - For each content/summary page, identify the primary evidence object first. Then choose a fixed layout and supporting text.
   - Before rendering, do an evidence-binding pass for every module: the module title, evidence or drawing `claim`, and text lines must be about the same claim. If the brief's best evidence is one complete source object, pass that image file as Evidence; do not pull a figure from another section just because the module needs proof.
   - Evidence is an identity component: the image file passed to `source.path` is the image that appears in the deck. Do not alter source evidence to fit a layout. If the evidence object is too small, rebalance layout, reduce supporting components/text, or split the point.
   - Body DSL is resolved and measured before drawing. If generation fails with primitive min/preferred/max or resize-limit diagnostics, simplify the module: remove secondary prose, reduce supporting components, add missing explanatory content, change the layout, or split the claim onto another slide. Do not add manual coordinates or bypass `bodyDsl`.
   - Compress visible prose into short conclusion lines. Each line should state the judgment the evidence supports, not explain how to read the slide.
   - Use `emphasis` in text blocks for 1-3 decisive terms after the claim handle. The claim handle before `：` is a structural label: keep it bold black, not red. When layout feedback says density is low or gaps are excessive, review the source material for that module's claim and add source-grounded conclusions, evidence boundaries, decision criteria, or supporting facts. Use KPI cards only for real metrics, and use a table only when a real two-axis relationship would be lost as prose.
   - Do not use KPI cards, tables, heatmaps, or capability grids to "make the module have proof". They are supporting components after real evidence or drawing is already present.
   - Do not use `Matrix/table` as a disguised `标签：正文` list. A table must express a real relationship: before/after, option/constraint/judgment, risk/boundary/action, or metric/evidence/decision.
   - Use the parser-derived layout type from the brief parser when present. Otherwise choose a fixed Huawei layout from `references/layout_standards.md`, then express it through `bodyDsl`.
5. Generate with `pptxgenjs`:
   - Use `scripts/pptx/hw_pptx_helpers.js` for cover, contents, page shell, and footer primitives.
   - Use `scripts/pptx/hw_visual_anchor_slide.js` for every summary/content page so evidence, generated drawings, body components, measurement, layout, and render evidence stay on one path.
   - Use discovered source-evidence Body DSL components for source image evidence; do not bypass Body DSL with direct `addImage`.
   - Use generated drawing and supporting components only through discovered Body DSL components and draw detail contracts.
6. Run content review against the source material. Save concise notes under `.tmp/<deck>/`.
7. Export slide PNGs:

   ```bash
   node scripts/pptx/export_pptx_images.js .tmp/<deck>/<deck>.pptx --out .tmp/<deck>/slides
   ```

   On Windows this defaults to PowerPoint COM when available. LibreOffice is only a fallback; record that residual risk when used.
8. Generation/export scripts run runtime QA as compiler-style gates. When the CLI reports a runtime QA error, repair the DSL and rerun; visual review, content review, or manual judgment cannot waive an error-level diagnostic.
   - Treat QA feedback as a request to improve the current semantic expression, not as permission to swap to an easier component. First identify the module's semantic anchor, keep it if it is still the right proof, and repair around it. If you replace an anchor, the replacement must preserve or improve the claim, evidence chain, key metrics, and boundary conditions.
9. Inspect every exported `.tmp/<deck>/slides/slide_XX.png` at original size. Regenerate when content review, CLI feedback, or visual inspection finds blocking issues: unreadable evidence, evidence collage, broken image, text overflow, title clipping, footer clipping, module overlap, non-Chinese generated text, sparse cards, excessive empty space, or drift from Huawei layout references.

## Built-In Components

- `createHuaweiDeck(metadata)`: creates a 16:9 deck.
- `addCoverSlide(pptx, data)`: creates a Huawei red-band cover.
- `addTocSlide(pptx, data)`: creates a numbered contents page.
- `addVisualAnchorContentSlide(pptx, data)`: creates summary/content pages with title, section tabs, `分析总结`, required `bodyDsl`, proof components, footer, measurement, layout, and render evidence.

## Runtime Script Map

Use these repository scripts; do not reimplement their jobs inside a deck script:

- `scripts/pptx/parse_ppt_content_brief.js`: parses `ppt_content_brief.md` into the immutable slide contract and parser-derived layout types.
- `scripts/pptx/dsl/list_components.js`: lists AI-visible Body DSL components generated from the registry.
- `scripts/pptx/dsl/describe_component.js`: describes one Body DSL component's props, examples, budget hints, alternatives, repair hints, and generated visual model needs.
- `scripts/pptx/dsl/generate_component_catalog.js`: regenerates `references/generated_dsl_component_catalog.md` from the component registry.
- `scripts/pptx/hw_pptx_helpers.js`: page shell, cover, contents, title, section tabs, footer, text rendering, and Huawei primitive helpers.
- `scripts/pptx/hw_visual_anchor_slide.js`: the only supported summary/content-page entrypoint; routes evidence, generated drawings, Body DSL components, measurement, layout, and render evidence through one path.
- `scripts/pptx/layout/*`: measured body-content taxonomy, PowerPoint-backed primitive measurement, resize envelopes, strict module stack layout, and LayoutIR box/scale/density/constraint diagnostics.
- `scripts/pptx/export_pptx_images.js`: exports the generated deck to slide PNGs for visual inspection.
PowerPoint COM export is part of the delivery quality bar on Windows.
Use repository scripts such as `scripts/pptx/export_pptx_images.js` and `scripts/pptx/measure_pptx_layout.js` for PowerPoint rendering or measurement. They route COM work through the shared PowerPoint broker so parallel agents reuse one serialized desktop COM instance. Do not call `New-Object -ComObject PowerPoint.Application` directly from deck scripts.
