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
2. Choose a filesystem-safe deck name `<deck>` before creating any artifacts. Create the deck workspace `.tmp/<deck>/` and save every deck-specific generated or temporary file under that directory. Use this pattern consistently:
   - Final PPTX: `.tmp/<deck>/<deck>.pptx`
   - Deck-specific generation script: `.tmp/<deck>/generate_<deck>.js`
   - Plans, inventories, manifests, QA notes, and scratch JSON: `.tmp/<deck>/<deck>_*.json` or `.tmp/<deck>/<deck>_*.md`
   - Derived images and screenshots: `.tmp/<deck>/images/` or another subdirectory inside `.tmp/<deck>/`
   - Exported slide PNGs: `.tmp/<deck>/slides/`
3. For parsed PDF/XML/HTML directories, create a source inventory before planning. Save it under `.tmp/<deck>/` and include:
   - Source title, authors/date when available, and source file paths.
   - Major sections and the one-sentence role each section plays in the story.
   - Figure/table image paths, captions, and which ones are worth using as evidence.
   - Headline numeric claims that will appear in the deck.
4. Inspect the bundled reference images in `assets/slides_ref/` before writing generation code. This is a blocking gate:
   - Run `node scripts/pptx/prepare_reference_review.js --out .tmp/<deck>/<deck>_reference_review.json`.
   - Open the reference images and fill every `observations` and `applied_to_slides` entry in that JSON before writing generation code.
   - Use the notes to calibrate density, card shapes, grid proportions, red/gray usage, table treatment, chart treatment, and footer language.
   - Do not merely say the images were referenced; leave review evidence in `.tmp/<deck>/<deck>_reference_review.json`.
5. Plan the deck slide by slide before coding. Save the plan as `.tmp/<deck>/<deck>_plan.json` or `.tmp/<deck>/<deck>_plan.md`. Keep the plan separate from visual construction:
   - Define the deck outline once as `sections`, using the same top-level chapter names as the contents page. Use the real chapter names; do not shorten them just to fit the indicator.
   - Do not insert standalone chapter divider slides. The top-right chapter indicator on each正文内容页 is the only chapter/progress marker.
   - Every正文内容页 must show a compact top-right chapter indicator that mirrors the reference images: white tabs for sibling sections and a Huawei-red tab for the current section. Pass `sections` and `currentSection` to the helper for each content page so the reader can see where the page sits in the outline. The helper dynamically sizes each tab by label length, right-aligns the full indicator to the content edge, and caps total width so the indicator does not collide with the page title.
   - Order正文内容页 by the contents-page chapter sequence. Do not jump from a later chapter back to an earlier chapter; finish all pages for one chapter before moving to the next unless the user explicitly asks for a non-linear appendix.
   - Use a two-part title on content pages: a short 24 pt main title states the page type or viewpoint, and an optional 18 pt subtitle explains the nuance. Do not put long explanatory clauses entirely in the 24 pt title.
   - Every正文内容页 must include a top `分析总结` block under the page title. Cover and contents slides do not use this block.
   - The `分析总结` block summarizes the page's core viewpoint in no more than three points. Each point must start with a meaning-specific short label such as `规划先行：` or `风险收敛：`; do not use generic labels like `结论1：`.
   - Each slide has at most three core messages.
   - Choose a layout by content count and relationship, not by decoration.
   - Record the source evidence for important claims and figures.
   - Every正文内容页 must plan one primary `visual_anchor` before rendering. The visual anchor is the page's main attention object and must use `kind`: `Evidence`, `Quantity`, `Sequence`, `Loop`, `Hierarchy`, `Matrix`, or `Network`. Text cards explain or interpret the visual anchor; they must not become a competing second anchor.
   - Choose `Evidence` when a source figure, source table, source screenshot, or source chart directly supports the slide claim. Otherwise choose the single dominant information relationship from the six conceptual kinds.
   - For each content slide, record `visual_anchor.kind`, `template`, source/data basis, and `why_this_visual`. Never put `renderer`, `visual_strategy`, or old `intent` fields in the model-facing plan; rendering is controlled globally by `HW_VISUAL_ANCHOR_RENDERER=rough_svg|ppt_native`.
   - When a slide needs a visual anchor beyond ordinary cards, load `references/visual_diagram_rules.md`. Load `references/visual_diagram_spec_schema.md` before writing a structured `visual_anchor`. Do not load the diagram rules for simple text-card-only pages.
   - Every embedded source figure or table must be treated as an evidence module, not a picture-only box. Prefer `visual + Chinese figure legend + 1-3 short interpretation lines` inside the same module when space permits. If the module would otherwise look empty, add source-grounded observations, conclusions, or reading guidance instead of leaving blank space.
   - Every embedded source figure or table must have a Chinese figure-legend description tightly attached below the visual, not pinned to the bottom of the card. By default, center the visual within its available visual area; the legend follows the visual's actual bottom edge. Use 12 pt, bold, italic text for the legend, for example `semi-PD 实验结果：Llama3-8B / 70B 的实验结果`. Keep the smaller source/caption note directly below the legend at 6 pt, then place optional interpretation lines below the source note. Leave extra whitespace beneath the interpretation, not between the visual and legend.
   - For tables that you create or transcribe, use native PowerPoint tables via `slide.addTable` / `addHuaweiTable`. Do not simulate a table by stacking rectangles and text boxes. Use source table screenshots only when the table is being cited as visual evidence from the paper.
6. Create deck-specific generation scripts and all generated files under `.tmp/<deck>/`. Do not write generated `.pptx`, deck-specific scripts, images, extracted text, QA reports, or scratch JSON outside that deck workspace.
7. Generate the PPTX with `pptxgenjs`. Use `scripts/pptx/hw_pptx_helpers.js` for cover, contents, page shell, footer, and table primitives; use `scripts/pptx/hw_visual_anchor_slide.js` for every正文内容页 so the visual anchor, supporting cards, and manifest evidence stay on one path.
8. Run content QA manually against the source material: missing text, ordering mistakes, placeholders, stale examples, unsourced numeric claims, and obvious wording errors. Save a concise QA note to `.tmp/<deck>/<deck>_content_qa.json` or `.tmp/<deck>/<deck>_content_qa.md`.
9. Run hard style QA:

   ```bash
   node scripts/qa/check_huawei_pptx.js .tmp/<deck>/<deck>.pptx --out .tmp/<deck>/<deck>.qa.json --require-reference-review .tmp/<deck>/<deck>_reference_review.json --require-visual-anchor-manifest .tmp/<deck>/<deck>_visual_anchor_manifest.json
   ```

10. Export slide images with the target PPT renderer:

   ```bash
   node scripts/pptx/export_pptx_images.js .tmp/<deck>/<deck>.pptx --out .tmp/<deck>/slides
   ```

   On Windows, this script defaults to PowerPoint COM when PowerPoint is available so the exported PNGs match the actual PPTX rendering. LibreOffice is only a fallback. Check `.tmp/<deck>/slides/render_manifest.json`; if `renderer` is `libreoffice`, record that final PowerPoint visual rendering was unavailable.

   If fallback rendering needs `soffice`, `pdfinfo`, or `pdftoppm` and they are not on PATH, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/pptx/setup_render_tools_path.ps1
   ```

   The export script must call command names from PATH; do not hardcode executable paths in deck scripts.
11. Re-run hard QA with render evidence:

   ```bash
   node scripts/qa/check_huawei_pptx.js .tmp/<deck>/<deck>.pptx --out .tmp/<deck>/<deck>.qa.json --require-reference-review .tmp/<deck>/<deck>_reference_review.json --require-visual-anchor-manifest .tmp/<deck>/<deck>_visual_anchor_manifest.json --require-render-dir .tmp/<deck>/slides
   ```

12. Triage hard-QA output. Treat errors as blockers. For every warning, either fix it or record why it is accepted in the QA note. Re-run hard QA after fixes.
13. Run independent LLM visual QA from the exported PNGs. This is a blocking gate:
   - Limit visual-QA-driven regeneration to **two total visual QA iterations** per deck. The first exported deck counts as iteration 1; one regenerated-and-rechecked deck counts as iteration 2. After iteration 2, do not keep looping. Record any remaining non-blocking concerns in `.tmp/<deck>/<deck>_visual_qa.json` or `.tmp/<deck>/<deck>_visual_qa.md`, and report unresolved blocking issues explicitly instead of starting another regeneration cycle.
   - Tell the visual reviewer this iteration cap in its prompt: "最多进行两轮视觉 QA 迭代；若第二轮后仍有问题，只报告问题，不要求继续重做。"
   - Use a separate reviewer subagent when subagents are available. Give it only the exported slide PNGs, the reference images, and the visual QA rubric; do not give it the generation script, prior QA pass/fail result, or your intended fixes.
   - If subagents are unavailable, perform a fresh independent review pass yourself after clearing generation assumptions from the prompt context. Treat the pass as adversarial review, not author self-check.
   - Inspect every `.tmp/<deck>/slides/slide_XX.png` at original size, not only a contact sheet.
   - Save `.tmp/<deck>/<deck>_visual_qa.json` or `.tmp/<deck>/<deck>_visual_qa.md` with one entry per slide. Each entry must include `language_status`, `title_status`, `overflow_status`, `overlap_status`, `reference_match_status`, and `blocking_findings`.
   - Fail visual QA if any created visible text is not Chinese, any page title wraps to multiple lines, any text leaves its card/text box, any module overlaps another module, or any footer/title/card is visibly clipped.
   - If image export fails, visual QA is not complete; report `visual_qa_status: failed_or_unavailable`, not `completed`.
14. Fix the first version and regenerate when content QA, hard style QA, or visual QA finds issues, while respecting the two-iteration cap for visual-QA-driven regeneration. Content QA and hard style QA errors remain blockers, but visual QA must not become an unbounded loop.

## Output Rules

- Save each generated deck and every deck-specific temporary artifact under `.tmp/<deck>/`.
- Save generated decks to `.tmp/<deck>/<deck>.pptx`.
- Save generated plans, deck-specific scripts, intermediate JSON, screenshots, extracted images, slide exports, and QA reports inside `.tmp/<deck>/` or its child directories.
- Keep reusable skill files in `scripts/`, `references/`, and `assets/`; keep run-specific artifacts out of those folders.
- When embedding source figures or tables, the source images may remain in their original input directory, but any derived or edited copies must be written inside `.tmp/<deck>/`.

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
  - Page subtitle/title note: 18 pt bold, Huawei red `C00000`, placed after the main title on the same line.
  - Analysis summary: 14 pt; left label is bold white text on Huawei red; in the gray body only the meaning-specific point labels are bold, and the explanatory text after each colon is regular weight.
  - First-level card title: 14 pt.
  - Second-level title: 14 pt.
  - Body: 12 pt by default; use 14 pt for conclusion, interpretation, or other large text boxes.
  - KPI/data emphasis: 18 pt.
  - Footers and compact source captions: 6 pt.
  - Never go below 6 pt.
- Use 1.5x line spacing for body text boxes by default (`lineSpacingMultiple: 1.5` in pptxgenjs).
- Page title area must fit on one line: keep the 24 pt main title short, and move explanatory text into the 18 pt `titleNote` / `titleSubtitle`. Do not rely on wrapping, shrinking, or hiding overflow.
- Every正文内容页 must include a top-right chapter indicator flush with the top page edge and right-aligned to the same content edge as the title rule. Keep enough vertical distance between the indicator and the page title so the title never visually touches the tabs. Use thin black tab borders, white inactive tabs, one Huawei-red active tab, and 8 pt bold labels matching the contents-page section names. Tab widths must adapt to label length with a reasonable maximum total width; do not pre-truncate normal section names such as `semi-PD 设计`.
- Every正文内容页 must reserve the first content band below the title for `分析总结`: red left label and gray right body, with no outer border around the whole summary band. Keep it high on the slide, then place detailed cards/charts/tables below it.
- Generated tables must be real PPT table objects, not card grids made from manually aligned rectangles. Use a Huawei-red header row, 0.5 pt cell borders, restrained white/light-gray body rows, and bold first-column labels when they identify row entities.
- Keep expression dense and restrained: viewpoint in the title, limited red emphasis, no generic AI decoration, no ornamental gradients.
- Do not use giant empty cards. A large gray card is acceptable only when it contains a real table, chart, source figure, process, dense list, or compact evidence block.
- Match text amount to the text-box size. If a card is large, write enough source-grounded interpretation, implications, or conclusion text to visually fill it at 12/14 pt with 1.5x line spacing; otherwise shrink the card or choose a more compact layout.
- Treat `assets/slides_ref/09 内容 图文并茂1.png` and `assets/slides_ref/10 内容 图文并茂2.png` as the visual-anchor references. A content page may have one dominant figure/table/chart/diagram region, but it must remain inside the Huawei page system: title, section indicator, `分析总结`, red first-level bars, thin gray frames, interpretation text, and footer. Do not turn a content slide into a full-bleed illustration or a standalone hand-drawn poster.
- For 图文并茂 pages, prefer either `left/right mixed modules` like reference 09 or `large visual + side interpretation` like reference 10. The visual anchor should occupy meaningful attention, usually about half to two-thirds of the detail band when it is the main evidence, while adjacent text explains exactly how to read it.

## Built-In Components

Use `scripts/pptx/hw_pptx_helpers.js` only for stable page primitives:

- `createHuaweiDeck(metadata)` creates a 16:9 deck.
- `addCoverSlide(pptx, data)` creates a red-band cover.
- `addTocSlide(pptx, data)` creates a numbered contents page.
- `addHuaweiTable(slide, rows, options)` inserts a reusable native PPT table inside visual-anchor modules or local layouts.
- `addPageTitle`, `addAnalysisSummary`, `addSectionTabs`, `addFooter`, `redTitleCard`, `grayCard`, `textBox`, and `safeText` are low-level building blocks for the unified content-slide path.

Use `scripts/pptx/hw_visual_anchor_slide.js` for every正文内容页:

- `addVisualAnchorContentSlide(pptx, data)` creates the page title, top-right chapter indicator, `分析总结`, one primary visual anchor, optional supporting cards, footer, and manifest entry.
- `addEvidenceModule(slide, visualAnchor, area)` renders a source-backed evidence anchor inside an existing content region.
- `addSupportingCards(slide, cards, area)` adds interpretation cards that explain the primary visual anchor.
- `writeVisualAnchorManifest(pptx, fileName)` writes `.tmp/<deck>/<deck>_visual_anchor_manifest.json`; hard QA uses this as evidence that every正文内容页 has exactly one rendered visual anchor.

For `addVisualAnchorContentSlide`, pass the 24 pt title as `title` and the 18 pt explanatory subtitle as `titleNote` or `titleSubtitle`. Pass `summary` as a string, array, or `{ body/items, fill }`. Prefer `summary.body` entries as `{ label, text }`, for example `{ label: "规划先行", text: "先完成页面级观点规划，再进入生成脚本。" }`. The helper keeps the left label fixed as `分析总结`; do not use `summary.title` to replace that label. Use `visualAnchorCaption` or `visual_anchor_caption` for the editable Chinese figure-legend text below the visual anchor. This caption is PPT text-layer content and must stay outside `visual_anchor.visual_spec`.

Also pass `sections` and `currentSection`. `sections` should be an array of top-level contents-page chapter names, and `currentSection` may be a matching string or a 1-based index. The helper draws the top-right chapter indicator, dynamically sizes each tab from the visible label length, caps total width, right-aligns the indicator, and highlights the active tab in Huawei red.

For structured visual anchors, use `scripts/pptx/hw_diagram_helpers.js` as the shared renderer and validator. Use `validateVisualAnchorSpec` for model-facing specs, `renderVisualAnchorPptNative` for PPT-native rendering, and SVG/image export helpers only when the global renderer is `rough_svg`. Do not create an alternate content-page renderer in deck-specific scripts; put local custom work behind `visual_anchor` data and supporting cards. Validate final deck composition through exported PNGs.

Do not duplicate visual-anchor kind, template, or renderer rules in deck-specific prompts or scripts. `references/visual_diagram_rules.md` is the single source of truth for kind/template selection and renderer policy. `references/visual_diagram_spec_schema.md` is the single source of truth for field-level schema examples. The skill workflow only decides when to load those references.

Rough SVG visual anchors are diagram images, not miniature PPT pages. They may include diagram-native labels, axis text, values, and time labels, but must not include page titles, slide claims, figure legends, source notes, standalone captions, interpretation paragraphs, node notes, bottom slogans, side callouts, or empty placeholder boxes. Put those in editable PPT text boxes, `分析总结`, supporting cards, or evidence legends. Do not use standalone explanation fields anywhere under `visual_spec`, including `annotation`, `note`, `notes`, `summary`, `callout`, `callout_title`, `caption`, `description`, `detail`, `figure_legend`, `source_note`, `interpretation`, `insight`, `rationale`, `reading_guide`, `takeaway`, or `conclusion`. The `visual_spec` top-level schema is closed per template; do not add ad hoc prose keys.

When embedding rough SVG output in PPT, preserve the SVG aspect ratio with proportional contain placement. Do not stretch an image to fill a region. If a visual looks too sparse after proportional placement, redesign the slide layout or regenerate the visual content instead of forcing the image to scale non-proportionally.

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
- Do not add standalone chapter divider pages; begin each chapter with a normal content slide whose top-right indicator highlights the current chapter.
- Use `Quantity` anchors for KPI summaries, quantitative comparisons, scorecards, and compact performance views.
- Use `Sequence` anchors for workflows, timelines, delivery plans, and operating mechanisms.
- Use `Hierarchy` anchors for architectures, capability stacks, classification trees, and layered systems.
- Use `Matrix` anchors for comparisons, heatmaps, prioritization quadrants, and structured tables.
- Use `Loop` anchors for feedback cycles, iteration mechanisms, flywheels, and closed-loop governance.
- Use `Network` anchors for dependencies, module relationships, stakeholder maps, and causal influence graphs.
- Use native PPT tables for generated or transcribed structured comparisons. Only embed a table as an image when preserving the original paper table as source evidence is the point of the slide.
- Merge related content when one dense slide can carry it cleanly.
- For paper or technical-report inputs, default to this story arc unless the user asks otherwise: problem and trade-off, key insight, architecture/mechanism, algorithm or workflow, evaluation setup, key results, implementation or deployment notes, conclusion.
- For every正文内容页, choose the page's `visual_anchor.kind` and `template` before choosing text card geometry. Use `Evidence` when source figures/tables/screenshots carry the claim; otherwise choose the dominant relationship kind and let code apply the global renderer.
- Use the 图文并茂 reference layouts when the visual anchor is important: reference 09 for two balanced content modules with one embedded visual, and reference 10 for one large visual region plus side interpretation cards linked by red arrows or proximity. Keep the visual framed and explained; do not let the diagram float without a red title bar or nearby reading guidance.
- Use original figures/tables as evidence when they carry important technical details; pair them with a short interpretation card rather than retyping every label.
- Avoid using source figures as decoration. Each embedded figure must support a slide message and have a short caption or source note.
- Every embedded source figure/table must be an evidence module, not a picture-only box. Include a figure-legend description directly below the visual: 12 pt, bold, italic, Chinese, with a meaning-specific prefix such as `semi-PD 实验结果：` or `semi-PD 架构图：`. The legend should sit close to the image/table bottom edge; do not place it at the bottom of a large empty image card. Put original figure/table number and source notes immediately below it in 6 pt. When the module has visible empty space, add 1-3 concise Chinese interpretation lines in the same module.
- Prefer compact cards plus a chart/table/diagram/evidence region over full-height empty cards. If a card contains fewer than three substantive lines, do not stretch it to fill a column.
- For conclusion and interpretation slides, use fewer but fuller text boxes with 14 pt body when the layout has enough space. Do not leave large cards half-empty just to keep wording short.
- For supporting text regions, match the reference-image density: combine red title bars, compact text, numbered lists, small modules, chart/table interpretation, process explanations, or source-figure reading guidance.

## QA Checklist

Content QA:

- Verify every planned slide appears in the deck.
- Verify every正文内容页 has a top-right chapter indicator and that the active tab matches the slide's section in the contents outline.
- Verify正文内容页 proceed monotonically through the contents outline: chapter 1 pages, then chapter 2 pages, then chapter 3 pages. Do not bounce between sections.
- Verify every正文内容页 has the top `分析总结` block, and verify cover and contents slides do not have it.
- Verify every正文内容页 records exactly one primary `visual_anchor` in the plan. If a slide has no visual anchor, justify why the page is not a正文内容页 or redesign it. If a slide has several competing visual regions, choose one as the anchor and demote the others to supporting evidence or text.
- Verify every `visual_anchor` uses the new `kind`/`template` contract and does not include `renderer`, `visual_strategy`, or `intent`. Verify `Evidence` is used whenever source figure/table/screenshot evidence is the anchor.
- Verify all generated visible text is Chinese, with only necessary technical acronyms/model names/source identifiers left in English.
- Compare slide titles and key claims against the source material.
- Verify numeric claims in titles, data cards, and conclusion slides against the source inventory.
- Remove placeholders such as `TBD`, `TODO`, `XX`, `示例`, and accidental lorem ipsum unless the source material intentionally uses them.
- Check that ordering matches the story line.
- Check that every embedded source figure/table has a reason to appear and is referenced by the slide message.

Visual QA:

- Use the PowerPoint-rendered PNGs when available. LibreOffice-rendered PNGs are fallback evidence and must be marked as such.
- Check titles, cards, tables, charts, and footers align to a consistent grid.
- Check every正文内容页 has a visible primary visual anchor and that it is integrated into the Huawei page structure rather than replacing it. The page must still show the title area, section indicator, `分析总结`, content framing, and footer.
- Check 图文并茂 pages against `09 内容 图文并茂1.png` and `10 内容 图文并茂2.png`: use balanced modules or large-visual-plus-side-interpretation, keep red first-level title bars, preserve thin gray outlines, and place explanatory text close enough to the visual that the reading path is obvious.
- Check rough SVG visual anchors, when used, stay in the content area rather than becoming full-slide posters. Their labels must be readable, but titles, page claims, figure legends, source notes, standalone captions, and detailed interpretation should remain in editable PPT text boxes.
- Check rough SVG visual anchors are proportionally contained in their image region, not stretched to match the region. If proportional placement creates excessive whitespace, mark it as a layout/content redesign issue rather than accepting image distortion.
- Check the top-right chapter indicator is present on正文内容页, mirrors the contents-page section order, is flush with the top page edge, is right-aligned to the title rule, uses one active red tab, and leaves clear vertical distance from the page title.
- Check page title area is one line and does not enter the content area: main title is 24 pt, optional subtitle/title note is 18 pt.
- Check every正文内容页 places the `分析总结` block directly below the title: red label on the left, gray summary text on the right, no more than three meaning-specific points. Only the point label before `：` is bold; the explanatory text after it is regular weight.
- Check no text obviously overflows its card or table cell.
- Check page main titles are 24 pt Huawei red, optional title notes are 18 pt Huawei red, not black.
- Check body text uses 1.5x line spacing and 12/14 pt sizing, with conclusion or interpretation boxes using the larger body size when space allows.
- Check large text boxes are filled with content length appropriate to their size; if a box looks sparse, add grounded explanation or reduce the box height.
- Check red is used for hierarchy and emphasis, not as a page-wide accent everywhere.
- Check chart labels, notes, and table values remain readable at final size.
- Check generated/transcribed tables are editable PPT tables, not rectangle/text-box composites. It is acceptable for source paper tables to remain as images when they are evidence modules with legends and source notes.
- Check every embedded source figure/table has a 12 pt bold italic Chinese figure-legend description tightly below the visual, plus any original source note in 6 pt immediately beneath it; fail the visual QA if a large gap appears between the visual and its legend. If a figure/table module has large unused space and no interpretation text, mark it as a layout issue rather than accepting it as true 图文并茂.
- Compare against `assets/slides_ref/` for density and restraint before declaring done.
- Use exported PNGs from `scripts/pptx/export_pptx_images.js` as the primary visual QA artifact.
- The visual QA reviewer must be independent from the generation pass whenever subagents are available.
- If visual rendering is unavailable, do not mark visual QA complete. Record the failed tool command, missing command, and residual risk.

Hard QA:

- Run `scripts/qa/check_huawei_pptx.js`.
- Treat errors as blockers.
- Treat `analysis_summary_missing` as a blocker for正文内容页.
- Treat `analysis_summary_generic_label` as a blocker; replace `结论1：` style labels with content-specific labels.
- Treat `section_divider_slide_present` as a blocker; remove standalone chapter divider pages and rely on the top-right chapter indicator.
- Treat `section_indicator_missing` as a blocker for正文内容页; pass `sections` and `currentSection` to the helper and regenerate.
- Treat `section_indicator_alignment` as a blocker; keep the chapter indicator right-aligned to the title/content edge.
- Treat `section_order_regression` as a blocker; reorder slides so content follows the contents-page chapter sequence without jumping backward.
- Treat `content_visual_anchor_manifest_missing`, `content_visual_anchor_missing`, `content_visual_anchor_unrendered`, `content_visual_anchor_template_invalid`, and `content_visual_anchor_manifest_invalid` as blockers; every正文内容页 must have exactly one manifest-backed, rendered, schema-valid visual anchor.
- Fix warnings when they indicate visible drift from the Huawei style contract.
- Record accepted warnings with a concrete reason. Common accepted warnings include helper-generated font-size variety caused by a page title, card title, body, footer, and labels coexisting on a dense page; do not accept warnings that mask low contrast, tiny text, off-palette colors, or animation.
- Run hard QA with `--require-reference-review`, `--require-visual-anchor-manifest`, and `--require-render-dir` before final delivery so missing reference-image review, missing visual-anchor evidence, and missing exported PNGs fail the workflow.
