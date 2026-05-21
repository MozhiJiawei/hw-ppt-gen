# Delivery Standard

This is the standard for a finished Huawei-style deck. Use it before planning or coding.

## Non-Negotiables

- The deck is evidence-first and fact-presenting.
- Source figures, charts, screenshots, and tables that establish a claim must appear as readable evidence.
- One page has one primary evidence object. Do not merge several source figures into one unreadable evidence collage.
- Generated visuals are secondary. Use them only when the source has no usable evidence image or when they replace long prose with one clear visual explanation.
- Text serves evidence. It explains how to read the figure, what the figure proves, and what boundary applies.
- High density means readable evidence plus compact interpretation, not long paragraphs or empty cards.

## Evidence Readability

A source evidence object is acceptable only when a reader can inspect the relevant labels, trend, comparison, table values, or diagram relationships at final slide size.

Reject:

- a source figure reduced to a thumbnail;
- a collage where subfigures cannot be read;
- a chart whose axes or decisive trend are too small to support the claim;
- a source image floating without nearby Chinese reading guidance;
- a generated KPI/table/card replacing a cited source figure that proves the claim.

Accept:

- a single source figure or cropped source region that remains traceable;
- one primary source figure plus compact KPI/readout text;
- a generated table or card only when it compresses supporting prose or facts that do not require the source figure itself.

## Text Compression

Visible body text should become:

- short labels;
- source-grounded interpretation;
- reading guidance;
- caveats and boundaries;
- KPI readouts;
- compact tables.

Do not paste long paragraphs from the source or brief into large cards.

## Layout Aesthetic

Huawei density is made from layers, not paragraphs. A strong page can be scanned through:

- title and title note;
- `分析总结`;
- red module headers;
- source evidence;
- KPI/readout cards;
- compact tables;
- short conclusion boxes;
- red-bold keywords inside short lines.

Use short claim lines. A normal text block should be 2-5 lines. Each line should usually be one label plus one judgment, for example:

- `长尾错配：低频请求少，却长期占用固定 GPU 预算。`
- `突发冗余：热门模型 burst 会超过 reserved capacity。`

For dense text blocks, mark 1-3 decisive terms in red bold through `emphasis` in the text block. Emphasize nouns, numbers, and decisions: `长尾错配`, `17.7% GPU`, `82% 节省`, `未观察到 SLO violation`.

A column module should not accumulate more than 6 visible prose lines across multiple text blocks. When a column needs more detail, split the information into a compact table, KPI row, or conclusion box instead of stacking another text block.

Prefer structural compression over prose compression:

- turn a list of facts into KPI cards;
- turn dimensions into `Matrix/table`;
- turn mechanism pairs into a 2x2 comparison table;
- turn a final decision into a bordered conclusion note;
- use arrows between columns when the page tells a scenario -> mechanism -> result story.

## Huawei Visual Language

- White background.
- Huawei red `C00000` for hierarchy and decisive emphasis.
- Restrained grays for content structure.
- Red module title bars, thin gray frames, compact Chinese body text, and footer source notes.
- No decorative gradients, shadows, blobs, ornamental icons, or poster-style full-bleed pages.
- Use only 10, 12, 14, 18, and 24 pt font sizes.
- Main page title is 24 pt Huawei red; title note is 18 pt Huawei red.
- Body text is 12 pt by default; use 14 pt only for larger interpretation boxes.

## QA Mindset

The first visual QA question is not "does the slide contain a visual anchor?" It is:

> Can the reader understand the claim by looking at the primary evidence and nearby explanation?

If not, redesign before accepting hard-QA success.
