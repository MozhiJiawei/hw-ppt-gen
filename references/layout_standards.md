# Layout Standards

Use this reference before choosing or coding Huawei content layouts.

The bundled reference images live in `assets/slides_ref/`:

- `01 目录.png`: contents layout.
- `02 配色示例.png`: color palette and neutral/red balance.
- `03 手绘图 饼图.png`: generated proportion-chart style.
- `04 手绘图 柱状图.png`: generated bar-chart style.
- `05 内容 二分栏.png`: equal two-column content page.
- `06 内容 偏分栏.png`: biased column layout with top analysis summary.
- `07 内容 三分栏.png`: three-column content page with top analysis summary.
- `08 内容 四分栏.png`: four-panel 2x2 content page with top analysis summary.

## Shared Content Page Structure

Every summary/content page rendered by `addVisualAnchorContentSlide` keeps:

- page title and red rule;
- top-right section tabs when sections exist;
- `分析总结` band directly below the title;
- red module headers;
- thin gray frames;
- evidence or generated visual anchors inside modules;
- nearby interpretation text;
- footer source and page number.

## `05 内容 二分栏`

Two balanced modules.

Use when the page has two viewpoint modules or one evidence module plus one interpretation/table module.

Good:

- one readable source figure on the left, compact reading text/table on the right;
- two readable evidence modules when both are equally important and both remain legible.

Reject:

- two unrelated tiny figures in one module;
- a large empty text card;
- direct source-image box with no reading guidance.

## `06 内容 偏分栏`

One wide visual region plus one to three stacked interpretation cards.

Use when one evidence object is clearly dominant.

Rules:

- left region is visual-first;
- right cards explain reading, boundary, KPI, or action;
- do not put long prose into the visual region;
- do not shrink the dominant evidence to make room for secondary evidence.

## `07 内容 三分栏`

Three modules in one row.

Use when the brief has three top-level viewpoints, especially summary pages.

Rules:

- each column must carry a complete module;
- evidence must remain readable in each column;
- if a column source figure is too dense, crop to the relevant region or use a compact readout beside the evidence;
- do not use three KPI-only columns when source figures are available.

## `08 内容 四分栏`

Four modules arranged 2x2.

Use for four comparable modules, not for stuffing many source figures into a gallery.

Rules:

- each panel needs a short module title;
- evidence inside each panel must remain readable;
- if four source figures cannot be read, reduce the number of visual panels or move details into text/table form.

## Density Standard

Fill space with readable evidence, concise tables, KPI readouts, and short interpretation. Do not fill space with paragraphs. Do not leave large cards half-empty unless the card is dominated by readable evidence.

## Text Rhythm

Dense Huawei pages should alternate visual weights:

- source figure;
- short emphasized interpretation;
- KPI/readout cards;
- compact table or conclusion note.

Do not fill a column by stretching a KPI card or writing a long bullet stack. If a column has empty bottom space, add a meaningful structure: 2x2 mechanism table, small KPI row, source-grounded conclusion note, or red arrow relationship.

Use red-bold emphasis sparingly inside text blocks. Emphasize the claim handle, number, or decision term, not whole sentences.
