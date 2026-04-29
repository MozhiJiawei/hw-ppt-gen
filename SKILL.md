---
name: huawei-pptx-generator
description: Generate new Huawei-style PPTX decks from arbitrary readable source material using pptxgenjs. Use when Codex must create a fresh .pptx from webpages, Markdown, paper extraction output, repository analysis, plain text, or a user prompt, with Huawei business-material styling only. This skill does not edit, merge, split, or deeply modify existing presentations and does not offer alternate visual themes.
---

# Huawei PPTX Generator

Generate a new Huawei-style `.pptx` deck from readable input material. Use `pptxgenjs` as the generation path, the bundled components as the visual system, and the bundled checker for hard compliance gates.

## Required Workflow

1. Read the user's source material and identify the audience, purpose, story line, and evidence.
   - All visible deck text that you create must be Chinese. Keep source figures/tables as-is, but translate slide titles, subtitles, card titles, body text, captions, footers, contents, and QA notes into Chinese.
   - Keep necessary technical acronyms in parentheses or inline, for example `首 Token 时延（TTFT）`, `每 Token 时延（TPOT）`, `服务等级目标（SLO）`, `GPU`, `KV cache`, and `SM`.
2. For parsed PDF/XML/HTML directories, create a source inventory before planning. Save it under `.tmp/` and include:
   - Source title, authors/date when available, and source file paths.
   - Major sections and the one-sentence role each section plays in the story.
   - Figure/table image paths, captions, and which ones are worth using as evidence.
   - Headline numeric claims that will appear in the deck.
3. Inspect the bundled reference images in `assets/slides_ref/` before writing generation code. This is a blocking gate:
   - Run `node scripts/prepare_reference_review.js --out .tmp/<deck>_reference_review.json`.
   - Open the reference images and fill every `observations` and `applied_to_slides` entry in that JSON before writing generation code.
   - Use the notes to calibrate density, card shapes, grid proportions, red/gray usage, table treatment, chart treatment, and footer language.
   - Do not merely say the images were referenced; leave review evidence in `.tmp/<deck>_reference_review.json`.
4. Plan the deck slide by slide before coding. Save the plan as `.tmp/<deck>_plan.json` or `.tmp/<deck>_plan.md`. Keep the plan separate from visual construction:
   - Slide title states the point of view.
   - Each slide has at most three core messages.
   - Choose a layout by content count and relationship, not by decoration.
   - Record the source evidence for important claims and figures.
5. Create deck-specific generation scripts and all generated files under `.tmp/`. Do not write generated `.pptx`, deck-specific scripts, images, extracted text, QA reports, or scratch JSON outside `.tmp/`.
6. Generate the PPTX with `pptxgenjs`, preferably by importing `scripts/hw_pptx_helpers.js`.
7. Run content QA manually against the source material: missing text, ordering mistakes, placeholders, stale examples, unsourced numeric claims, and obvious wording errors. Save a concise QA note to `.tmp/<deck>_content_qa.json` or `.tmp/<deck>_content_qa.md`.
8. Run hard style QA:

   ```bash
   node scripts/check_huawei_pptx.js .tmp/<deck>.pptx --out .tmp/<deck>.qa.json --require-reference-review .tmp/<deck>_reference_review.json
   ```

9. Export slide images with the target PPT renderer:

   ```bash
   node scripts/export_pptx_images.js .tmp/<deck>.pptx --out .tmp/<deck>_slides
   ```

   On Windows, this script defaults to PowerPoint COM when PowerPoint is available so the exported PNGs match the actual PPTX rendering. LibreOffice is only a fallback. Check `.tmp/<deck>_slides/render_manifest.json`; if `renderer` is `libreoffice`, record that final PowerPoint visual rendering was unavailable.

   If fallback rendering needs `soffice`, `pdfinfo`, or `pdftoppm` and they are not on PATH, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/setup_render_tools_path.ps1
   ```

   The export script must call command names from PATH; do not hardcode executable paths in deck scripts.
10. Re-run hard QA with render evidence:

   ```bash
   node scripts/check_huawei_pptx.js .tmp/<deck>.pptx --out .tmp/<deck>.qa.json --require-reference-review .tmp/<deck>_reference_review.json --require-render-dir .tmp/<deck>_slides
   ```

11. Triage hard-QA output. Treat errors as blockers. For every warning, either fix it or record why it is accepted in the QA note. Re-run hard QA after fixes.
12. Run independent LLM visual QA from the exported PNGs. This is a blocking gate:
   - Use a separate reviewer subagent when subagents are available. Give it only the exported slide PNGs, the reference images, and the visual QA rubric; do not give it the generation script, prior QA pass/fail result, or your intended fixes.
   - If subagents are unavailable, perform a fresh independent review pass yourself after clearing generation assumptions from the prompt context. Treat the pass as adversarial review, not author self-check.
   - Inspect every `.tmp/<deck>_slides/slide_XX.png` at original size, not only a contact sheet.
   - Save `.tmp/<deck>_visual_qa.json` or `.tmp/<deck>_visual_qa.md` with one entry per slide. Each entry must include `language_status`, `title_status`, `overflow_status`, `overlap_status`, `reference_match_status`, and `blocking_findings`.
   - Fail visual QA if any created visible text is not Chinese, any page title wraps to multiple lines, any text leaves its card/text box, any module overlaps another module, or any footer/title/card is visibly clipped.
   - If image export fails, visual QA is not complete; report `visual_qa_status: failed_or_unavailable`, not `completed`.
13. Fix the first version and regenerate when content QA, hard style QA, or visual QA finds issues.

## Output Rules

- Save generated decks to `.tmp/*.pptx`.
- Save generated plans, deck-specific scripts, intermediate JSON, screenshots, extracted images, and QA reports to `.tmp/`.
- Keep reusable skill files in `scripts/`, `references/`, and `assets/`; keep run-specific artifacts out of those folders.
- When embedding source figures or tables, the source images may remain in their original input directory, but any derived or edited copies must be written to `.tmp/`.

## Huawei Style Contract

- Use 16:9 widescreen layout.
- Use Microsoft YaHei for Chinese and Arial for English-compatible text. Use Impact only for large numeric data.
- Use Chinese for all generated visible text. English source material must be translated or summarized in Chinese; only technical acronyms, model names, product names, arXiv identifiers, and source-figure text may remain in English.
- Use Huawei red `C00000`, black, white, and restrained grays as the default palette.
- Do not use animations or transitions.
- Use 0.5 pt lines for normal card outlines, separators, arrows, and chart axes.
- Keep typography to a small fixed scale: 12 pt, 14 pt, 18 pt, and 24 pt. Use 6 pt only for footers or compact source captions.
- Use these size bands:
  - Page title: 24 pt bold, Huawei red `C00000`.
  - First-level card title: 14 pt.
  - Second-level title: 14 pt.
  - Body: 12 pt by default; use 14 pt for conclusion, interpretation, or other large text boxes.
  - KPI/data emphasis: 18 pt.
  - Footers and compact source captions: 6 pt.
  - Never go below 6 pt.
- Use 1.5x line spacing for body text boxes by default (`lineSpacingMultiple: 1.5` in pptxgenjs).
- Page titles must fit on one line at 24 pt. If a title does not fit, shorten the Chinese viewpoint; do not rely on wrapping, shrinking, or hiding overflow.
- Keep expression dense and restrained: viewpoint in the title, limited red emphasis, no generic AI decoration, no ornamental gradients.
- Do not use giant empty cards. A large gray card is acceptable only when it contains a real table, chart, source figure, process, dense list, or compact evidence block.
- Match text amount to the text-box size. If a card is large, write enough source-grounded interpretation, implications, or conclusion text to visually fill it at 12/14 pt with 1.5x line spacing; otherwise shrink the card or choose a more compact layout.

## Built-In Components

Use `scripts/hw_pptx_helpers.js` for stable components:

- `createHuaweiDeck(metadata)` creates a 16:9 deck.
- `addCoverSlide(pptx, data)` creates a red-band cover.
- `addTocSlide(pptx, data)` creates a numbered contents page.
- `addSectionSlide(pptx, data)` creates a hard-QA-compatible chapter divider with a top-left red page title.
- `addContentCardsSlide(pptx, data)` creates red-title plus gray-card content blocks.
- `addColumnsSlide(pptx, data)` creates two-, three-, or four-column pages.
- `addDataCardsSlide(pptx, data)` creates compact data-card pages.
- `addTableSlide(pptx, data)` creates Huawei-style dense tables.
- `addBarChartSlide(pptx, data)` creates a simple business bar chart.
- `addFlowSlide(pptx, data)` creates a horizontal process page.

Write custom deck scripts by composing these helpers. For uncommon layouts, create a small local helper in `.tmp/` that still uses `HW_STYLE`, `addPageTitle`, `addFooter`, `redTitleCard`, `grayCard`, and `safeText`.

## pptxgenjs Guardrails

- Pass colors without `#`, for example `C00000`.
- Do not use 8-digit hex colors to express transparency.
- Do not use Unicode bullets. Use plain lines, numbered labels, or ASCII hyphens.
- Do not reuse an options object after passing it to `pptxgenjs`; clone or create a fresh object each time.
- Prefer explicit `x`, `y`, `w`, `h`, `fontFace`, `fontSize`, `color`, `margin`, and `fit` values.
- Prefer `fit: "shrink"` only for source images and dense figure/table evidence. Do not rely on text autofit or shrink-to-fit to make prose fit; shorten, split, or resize text boxes instead.
- Use helper functions for cards, titles, tables, charts, and footers so mechanical style rules remain enforceable.

## Planning Heuristics

- Use a cover and contents page for decks over four slides.
- Use content-card pages for one to three analytical messages.
- Use two columns for comparison; use biased columns when one side contains the main evidence and the other side contains interpretation.
- Use three or four columns for parallel categories, workstreams, markets, or phases.
- Use data cards for KPI summaries and table-plus-chart slides for performance review material.
- Use flow slides for end-to-end processes, delivery plans, and operating mechanisms.
- Merge related content when one dense slide can carry it cleanly.
- For paper or technical-report inputs, default to this story arc unless the user asks otherwise: problem and trade-off, key insight, architecture/mechanism, algorithm or workflow, evaluation setup, key results, implementation or deployment notes, conclusion.
- Use original figures/tables as evidence when they carry important technical details; pair them with a short interpretation card rather than retyping every label.
- Avoid using source figures as decoration. Each embedded figure must support a slide message and have a short caption or source note.
- Prefer compact cards plus a chart/table/diagram/evidence region over full-height empty cards. If a card contains fewer than three substantive lines, do not stretch it to fill a column.
- For conclusion and interpretation slides, use fewer but fuller text boxes with 14 pt body when the layout has enough space. Do not leave large cards half-empty just to keep wording short.
- For two-, three-, and four-column Huawei layouts, match the reference-image density: combine red title bars, compact text, numbered lists, small modules, charts/tables, process arrows, or source figures.

## QA Checklist

Content QA:

- Verify every planned slide appears in the deck.
- Verify all generated visible text is Chinese, with only necessary technical acronyms/model names/source identifiers left in English.
- Compare slide titles and key claims against the source material.
- Verify numeric claims in titles, data cards, and conclusion slides against the source inventory.
- Remove placeholders such as `TBD`, `TODO`, `XX`, `示例`, and accidental lorem ipsum unless the source material intentionally uses them.
- Check that ordering matches the story line.
- Check that every embedded source figure/table has a reason to appear and is referenced by the slide message.

Visual QA:

- Use the PowerPoint-rendered PNGs when available. LibreOffice-rendered PNGs are fallback evidence and must be marked as such.
- Check titles, cards, tables, charts, and footers align to a consistent grid.
- Check page titles are one line and do not enter the content area.
- Check no text obviously overflows its card or table cell.
- Check page titles are 24 pt Huawei red, not black.
- Check body text uses 1.5x line spacing and 12/14 pt sizing, with conclusion or interpretation boxes using the larger body size when space allows.
- Check large text boxes are filled with content length appropriate to their size; if a box looks sparse, add grounded explanation or reduce the box height.
- Check red is used for hierarchy and emphasis, not as a page-wide accent everywhere.
- Check chart labels, notes, and table values remain readable at final size.
- Compare against `assets/slides_ref/` for density and restraint before declaring done.
- Use exported PNGs from `scripts/export_pptx_images.js` as the primary visual QA artifact.
- The visual QA reviewer must be independent from the generation pass whenever subagents are available.
- If visual rendering is unavailable, do not mark visual QA complete. Record the failed tool command, missing command, and residual risk.

Hard QA:

- Run `scripts/check_huawei_pptx.js`.
- Treat errors as blockers.
- Fix warnings when they indicate visible drift from the Huawei style contract.
- Record accepted warnings with a concrete reason. Common accepted warnings include helper-generated font-size variety caused by a page title, card title, body, footer, and labels coexisting on a dense page; do not accept warnings that mask low contrast, tiny text, off-palette colors, or animation.
- Run hard QA with `--require-reference-review` and `--require-render-dir` before final delivery so missing reference-image review and missing exported PNGs fail the workflow.
