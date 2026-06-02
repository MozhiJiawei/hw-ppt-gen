# Page Standards

Use this reference to decide what each page type must deliver.

## Cover

- Communicates topic, audience, and date.
- Does not use `分析总结`.
- Does not participate in evidence logic unless the user explicitly requests a visual cover.
- The subtitle is a short positioning line, not the deck's full core conclusion. Keep it to one visible line. Put long argument chains on the summary page or in speaker notes, not in the cover red band.

## Contents

- Lists top-level chapters in the deck order.
- Uses concise descriptions.
- Does not use `分析总结`.

## Summary Page

The summary page is the deck's evidence overview, not a KPI-only dashboard.

Required:

- preserves the brief's title, title note, and `分析总结`;
- uses the parser-derived `bodyLayout.type`;
- presents the key evidence objects named by the summary brief when available;
- keeps each evidence object readable;
- uses KPI/cards/tables only as supporting components that explain the evidence.

For summary and content pages, the page chrome is fixed: title, title note, section tabs, `分析总结`, summary body, footer, and page number are rendered by the shared Huawei shell helpers from the parsed brief. Body DSL layout starts below the `分析总结` band and must not move or redraw those shell elements. Do not add manual text boxes in the title-summary gap to patch density or repeat summary content.

Reject:

- three columns of KPI cards when the brief names source figures;
- evidence thumbnails that are present but unreadable;
- a collage that hides several figures inside one evidence object.

For a three-viewpoint summary, each column should normally contain:

- one primary source evidence object or complete source subfigure;
- a short module title;
- optional compact KPI/readout components only when they do not shrink the evidence below readability;
- 2-4 short claim lines with bold black claim handles and sparse red-bold conclusion variables, not a paragraph.

Do not make all three columns table-driven. Use generated tables sparingly; on a three-column summary, one mechanism/comparison table is usually enough. Scenario/result columns should usually read as evidence + conclusion lines or KPI readouts. Tables and KPI cards support the anchor; they do not satisfy the anchor requirement.

## Content Page

Each content page has:

- one viewpoint in the title/title note;
- one `分析总结` band under the title;
- one primary evidence object;
- compact judgment, caveat, KPI, or table supporting content near the evidence;
- footer source note.

Prefer this visible structure:

- evidence first;
- then 2-5 short conclusion lines;
- then a compact readout, table, or conclusion box if more density is needed.

Avoid text blocks that read like paragraph notes. If a module needs more than 5 lines, convert part of it to KPI cards or a conclusion note. Use `Matrix/table` only when comparison or stage split is the actual point.
Avoid text blocks that merely tell the reader how to read the figure. Replace `读法/含义/说明` with a claim handle and judgment the page can stand behind.

When a page cites several figures, choose the one that carries the page claim as the primary evidence. Secondary figures become short text, KPI/table readouts, speaker-note caveats, or another slide. Do not hide them inside a collage.

## Dense Evidence Page

Multiple evidence objects on one page are allowed only when each remains readable at final size and the layout still follows a fixed Huawei Body DSL layout family.

If several figures cannot all remain readable:

- use the complete relevant subfigure when the source image contains multiple panels;
- move secondary evidence into text/table/KPI supporting form;
- split the material across pages if page count is not fixed;
- record the limitation when page count is fixed.

Do not alter source evidence merely to fill a panel. If evidence is too small, change the layout allocation, reduce supporting material, or split the claim.
