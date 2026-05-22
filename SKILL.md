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
- `references/evidence_schema.md` before placing source figures, charts, tables, or screenshots.
- `references/layout_standards.md` before choosing or coding `05`-`08` content layouts.
- `references/content_layout_schema.md` before writing `contentLayout`.
- `references/generated_visual_schema.md` before using generated visual anchors or supporting components such as KPI cards, tables, matrices, stacks, or heatmaps.

## Hard Priorities

1. Source evidence is TOP1. If source evidence supports the slide claim, it must appear as readable evidence.
2. One page has one primary evidence object. Do not hide multiple source figures inside one unreadable collage.
3. Evidence must bind to the nearby claim. The module title, visual-anchor `claim`, and editable conclusion lines must describe the same subject and judgment; never borrow an unrelated figure just to satisfy the visual-anchor rule.
4. Generated visuals are secondary. Use them only when evidence images are missing or when they replace long prose with a clearer visual explanation.
5. Brief-backed hard fields are immutable: page count, page order, titles, title notes, analysis summary, TOC, content-slide sections, and parser-derived `contentLayout.type`.
6. Huawei density means readable evidence plus compact conclusions, not pasted paragraphs or empty cards.
7. Visible text must become short claim lines, deliberate red-bold emphasis terms, KPI/readout cards, and conclusion boxes. Do not use long bullet stacks or decorative tables to fill space.
8. Write the slide as conclusions, not as instructions for reading the slide. Avoid meta labels such as `读法`, `含义`, `说明`, and `可见`; use claim handles such as `问题定性`, `机制变化`, `业务收益`, `边界条件`, and `决策口径`.
9. Tables are exceptional compression, not the default density tool. On a three-column summary, prefer evidence + conclusion lines; use at most one generated table unless the brief explicitly requires multiple real comparisons.
10. Visual anchors are evidence or diagrams, not structured text. `data_cards`, `Matrix/table`, `capability_matrix`, `capability_stack`, and generated `heatmap` are supporting components: use them for density, but never to satisfy a page or module's visual-anchor requirement.

## Runtime Workflow

1. Read the source material and identify audience, purpose, storyline, and evidence.
   - Visible text created by you must be Chinese.
   - Keep source figures/tables as-is; translate slide titles, subtitles, card titles, body text, captions, footers, contents, and QA notes.
   - Keep necessary technical acronyms, product names, metric names, and source-specific terms inline when the brief or evidence requires them.
2. If `ppt_content_brief.md` is present:
   - Read `references/brief_contract.md`.
   - Run `node scripts/pptx/parse_ppt_content_brief.js <brief> --json`.
   - Copy hard fields from parser output into the plan. Do not hand-map them from memory.
3. Choose a deck name `<deck>` and write all run-specific artifacts under `.tmp/<deck>/`:
   - `.tmp/<deck>/<deck>.pptx`
   - `.tmp/<deck>/generate_<deck>.js`
   - `.tmp/<deck>/<deck>_plan.json`
   - `.tmp/<deck>/<deck>_visual_anchor_manifest.json`
   - `.tmp/<deck>/<deck>_content_qa.json` or `.md`
   - `.tmp/<deck>/<deck>.qa.json`
   - `.tmp/<deck>/images/`
   - `.tmp/<deck>/slides/`
4. Plan the deck before coding:
   - Use cover and contents pages for decks over four slides.
   - Do not add standalone chapter divider pages.
   - Every content and summary page rendered through `addVisualAnchorContentSlide` must have `分析总结`, a page title, Huawei content framing, footer, and at least one real visual anchor: source evidence, source-backed chart/screenshot/table, or a generated diagram/chart that can be understood without reading the surrounding prose.
   - In `two_column`, `three_column`, and `four_column` content layouts, every module must include at least one real visual anchor. `data_cards`, `Matrix/table`, `capability_matrix`, `capability_stack`, and generated `heatmap` can support the module, but they do not count as its anchor.
   - For each content/summary page, identify the primary evidence object first. Then choose a fixed layout and supporting text.
   - Before rendering, do an evidence-binding pass for every module: the module title, visual-anchor `claim`, and text lines must be about the same claim. If the brief's best evidence for a module lives inside an existing source figure, reuse the complete source figure or complete subfigure that proves it; do not pull a figure from another section just because the module needs a visual anchor.
   - Do not crop source evidence as a layout shortcut. Cropping is allowed only to extract a complete subfigure or a human/source-provided region, and the crop must preserve axes, legends, labels, titles, borders, and the full plotted/diagrammed evidence object. If a complete evidence object is too small, rebalance layout, reduce supporting components/text, or split the point instead of cutting the image.
   - Compress visible prose into short conclusion lines. Each line should state the judgment the evidence supports, not explain how to read the slide.
   - Use `emphasis` in text blocks for 1-3 decisive terms after the claim handle. The claim handle before `：` is a structural label: keep it bold black, not red. Move longer material into KPI cards or conclusion notes first. Use a table only when a real two-axis relationship would be lost as prose.
   - Do not use KPI cards, tables, heatmaps, or capability grids to "make the module have a visual". They are supporting components after the anchor is already present.
   - Do not use `Matrix/table` as a disguised `标签：正文` list. A table must express a real relationship: before/after, option/constraint/judgment, risk/boundary/action, or metric/evidence/decision.
   - Use `contentLayout.type` from the brief parser when present. Otherwise choose a fixed Huawei layout from `references/layout_standards.md`.
5. Generate with `pptxgenjs`:
   - Use `scripts/pptx/hw_pptx_helpers.js` for cover, contents, page shell, and footer primitives.
   - Use `scripts/pptx/hw_visual_anchor_slide.js` for every summary/content page so evidence, generated visuals, content layout, and manifest entries stay on one path.
   - Use `Evidence` anchors for source figures/charts/tables/screenshots; do not bypass the manifest with direct `addImage`.
   - Use generated visual anchors and supporting components only after loading `references/generated_visual_schema.md`.
6. Run content QA against the source material. Save concise notes under `.tmp/<deck>/`.
7. Run hard QA:

   ```bash
   node scripts/qa/check_huawei_pptx.js .tmp/<deck>/<deck>.pptx --out .tmp/<deck>/<deck>.qa.json --require-plan .tmp/<deck>/<deck>_plan.json --require-visual-anchor-manifest .tmp/<deck>/<deck>_visual_anchor_manifest.json
   ```

   If the deck consumed a brief, add:

   ```bash
   --require-ppt-content-brief <path/to/ppt_content_brief.md>
   ```

8. Export slide PNGs:

   ```bash
   node scripts/pptx/export_pptx_images.js .tmp/<deck>/<deck>.pptx --out .tmp/<deck>/slides
   ```

   On Windows this defaults to PowerPoint COM when available. LibreOffice is only a fallback; record that residual risk when used.
9. Re-run hard QA with render evidence:

   ```bash
   node scripts/qa/check_huawei_pptx.js .tmp/<deck>/<deck>.pptx --out .tmp/<deck>/<deck>.qa.json --require-plan .tmp/<deck>/<deck>_plan.json --require-visual-anchor-manifest .tmp/<deck>/<deck>_visual_anchor_manifest.json --require-render-dir .tmp/<deck>/slides
   ```

10. Inspect every exported `.tmp/<deck>/slides/slide_XX.png` at original size. Regenerate when content QA, hard QA, or visual inspection finds blocking issues: unreadable evidence, evidence collage, broken image, text overflow, title clipping, footer clipping, module overlap, non-Chinese generated text, sparse cards, or drift from Huawei layout references.

## Built-In Components

- `createHuaweiDeck(metadata)`: creates a 16:9 deck.
- `addCoverSlide(pptx, data)`: creates a Huawei red-band cover.
- `addTocSlide(pptx, data)`: creates a numbered contents page.
- `addVisualAnchorContentSlide(pptx, data)`: creates summary/content pages with title, section tabs, `分析总结`, visual anchors, optional `contentLayout`, footer, and manifest entries.
- `writeVisualAnchorManifest(pptx, fileName)`: writes rendered visual-anchor evidence for QA.

## Runtime Script Map

Use these repository scripts; do not reimplement their jobs inside a deck script:

- `scripts/pptx/parse_ppt_content_brief.js`: parses `ppt_content_brief.md` into the immutable slide contract and parser-derived layout types.
- `scripts/pptx/hw_pptx_helpers.js`: page shell, cover, contents, title, section tabs, footer, text measurement, and Huawei primitive helpers.
- `scripts/pptx/hw_visual_anchor_slide.js`: the only supported summary/content-page entrypoint; routes evidence, generated visuals, layout modules, and manifest data through one path.
- `scripts/pptx/export_pptx_images.js`: exports the generated deck to slide PNGs for visual inspection.
- `scripts/qa/check_huawei_pptx.js`: hard QA for deck structure, layout rules, text fit, plan alignment, visual-anchor manifest alignment, and render evidence.

PowerPoint COM export is part of the delivery quality bar on Windows.
