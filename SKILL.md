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
- `references/generated_visual_schema.md` only when the source lacks a usable evidence image or a generated visual replaces long prose.

## Hard Priorities

1. Source evidence is TOP1. If source evidence supports the slide claim, it must appear as readable evidence.
2. One page has one primary evidence object. Do not hide multiple source figures inside one unreadable collage.
3. Generated visuals are secondary. Use them only when evidence images are missing or when they replace long prose with a clearer visual explanation.
4. Brief-backed hard fields are immutable: page count, page order, titles, title notes, analysis summary, TOC, content-slide sections, and parser-derived `contentLayout.type`.
5. Huawei density means readable evidence plus compact interpretation, not pasted paragraphs or empty cards.

## Runtime Workflow

1. Read the source material and identify audience, purpose, storyline, and evidence.
   - Visible text created by you must be Chinese.
   - Keep source figures/tables as-is; translate slide titles, subtitles, card titles, body text, captions, footers, contents, and QA notes.
   - Keep necessary technical acronyms inline, for example `首 Token 时延（TTFT）`, `服务等级目标（SLO）`, `GPU`, and `KV cache`.
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
   - Every content and summary page rendered through `addVisualAnchorContentSlide` must have `分析总结`, a page title, Huawei content framing, footer, and at least one visual anchor.
   - For each content/summary page, identify the primary evidence object first. Then choose a fixed layout and supporting text.
   - Use `contentLayout.type` from the brief parser when present. Otherwise choose a fixed Huawei layout from `references/layout_standards.md`.
5. Generate with `pptxgenjs`:
   - Use `scripts/pptx/hw_pptx_helpers.js` for cover, contents, page shell, and footer primitives.
   - Use `scripts/pptx/hw_visual_anchor_slide.js` for every summary/content page so evidence, generated visuals, content layout, and manifest entries stay on one path.
   - Use `Evidence` anchors for source figures/charts/tables/screenshots; do not bypass the manifest with direct `addImage`.
   - Use generated visual anchors only after loading `references/generated_visual_schema.md`.
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
