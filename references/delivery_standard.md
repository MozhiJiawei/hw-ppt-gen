# Delivery Standard

This is the standard for a finished Huawei-style deck. Use it before planning or coding.

## Non-Negotiables

- The deck is evidence-first and fact-presenting.
- Source figures, charts, screenshots, and tables that establish a claim must appear as readable evidence.
- One page has one primary evidence object. Do not merge several source figures into one unreadable evidence collage.
- Generated visuals are secondary. Use them only when the source has no usable evidence image or when they replace long prose with one clear visual explanation.
- Text serves evidence. It states the conclusion the evidence proves and the boundary that prevents overclaiming.
- High density means readable evidence plus compact conclusions, not long paragraphs or empty cards.

## Evidence Readability

A source evidence object is acceptable only when a reader can inspect the relevant labels, trend, comparison, table values, or diagram relationships at final slide size.

Reject:

- a source figure reduced to a thumbnail;
- a collage where subfigures cannot be read;
- a chart whose axes or decisive trend are too small to support the claim;
- a source image floating without nearby Chinese conclusion or boundary text;
- a generated KPI/table/card replacing a cited source figure that proves the claim.

Accept:

- a single source figure or complete source subfigure that remains traceable;
- one primary source figure plus compact KPI/readout text;
- a generated table or card only when it compresses supporting prose or facts that do not require the source figure itself.

## Text Compression

Visible body text should become:

- short labels;
- source-grounded judgments;
- conclusion lines;
- caveats and boundaries;
- KPI readouts;
- compact tables only when the table adds a real relationship.

Do not paste long paragraphs from the source or brief into large cards.
Do not write meta commentary such as `读法：`, `含义：`, `说明：`, or `可见：` as the main body rhythm. Those labels describe the authoring process, not the business conclusion. Replace them with claim handles that carry the point:

- `资源错配：非关键环节仍占用固定投入。`
- `机制变化：释放点从末端等待前移到过程窗口。`
- `业务收益：资源投入下降，但只按观测样本表述。`
- `边界条件：未覆盖的场景不写成绝对保证。`

If the brief itself uses words such as `含义`, `说明`, `读法`, or `建议`, translate them into a business claim handle before rendering. The slide should show the conclusion, not the brief author's scaffolding.

## Layout Aesthetic

Huawei density is made from layers, not paragraphs. A strong page can be scanned through:

- title and title note;
- `分析总结`;
- red module headers;
- source evidence;
- KPI/readout cards as supporting components;
- compact supporting tables;
- short conclusion boxes;
- red-bold keywords inside short lines.

Use short conclusion lines. A normal text block should be 2-5 lines. Each line should usually be one claim handle plus one judgment, for example:

- `资源错配：非关键环节仍占用固定投入。`
- `弹性不足：异常波动会抬高安全垫。`

For dense text blocks, mark 1-3 decisive terms in red bold through `emphasis` in the text block. The claim handle before `：` is a structural label and should stay bold black. Emphasize the core assertion after the handle: numbers, bottlenecks, decisions, and boundaries such as `50% retention`, `关键瓶颈`, `质量保持`, `不外推为保证`.

Red emphasis should form a reading path. If a reader scans only the red terms, they should recover the page's conclusion, not a random list of tidy labels. Do not red-bold structural labels such as `资源下降`, `机制变化`, or `边界条件` when they merely name the line's role.

A column module should not accumulate more than 6 visible prose lines across multiple text blocks. When a column needs more detail, first split the information into KPI rows or a conclusion box. Use a compact table only when the point depends on row/column comparison. These are supporting components; they cannot replace the module's evidence image or generated diagram/chart.

Prefer structural compression over prose compression:

- turn a list of facts into KPI cards;
- turn mechanism pairs into a 2x2 comparison table;
- turn a final decision into a bordered conclusion note;
- use arrows between columns when the page tells a scenario -> mechanism -> result story.

Use those structures only after the page/module has a true visual anchor. A slide made only of KPI cards, table fragments, capability grids, stacks, or heatmaps is structured text, not evidence-first 图文并茂.

Do not use a two-column table as a prettier version of `标签：正文`. If every row reads as `字段 -> 一句话`, keep it as short claim lines or a conclusion box. Use `Matrix/table` only when rows and columns jointly create meaning: comparison, trade-off, stage split, risk/action mapping, or metric/evidence/decision trace.

On a three-column summary page, do not put a generated table in every column. The default rhythm is source evidence plus short conclusion lines. A single table is acceptable when one column needs a real comparison such as `基线 vs 改进` or `阶段A vs 阶段B`.

## Portable Writing Examples

These examples illustrate the writing pattern only. Do not copy their domain terms unless the current brief and evidence contain the same terms.

Prefer conclusion lines over reading instructions:

- Weak: `读法：Figure 2 展示不同 retention 下的 F1。`
- Strong: `性能韧性：低 retention 下仍保持可用精度。`
- Weak: `含义：训练时随机选择 KV 来源。`
- Strong: `训练扰动：随机来源让部署时固定共享不再脆弱。`
- Weak: `说明：Table 4 有 TTFT 和 throughput。`
- Strong: `推理收益：更小 KV cache 释放 batch 空间，吞吐才有上升入口。`

Prefer one claim handle plus one judgment:

- `瓶颈定性：缓存开销来自层深扩张，不只是序列长度。`
- `机制变化：训练阶段注入不确定性，部署阶段才能固定策略。`
- `边界条件：收益依赖训练介入，不能当作纯后处理技巧。`

Use a generated table only when the axes matter:

- Good table axes: `训练阶段 / 部署阶段`, `基线 / 改进`, `收益 / 代价 / 边界`.
- Weak table axes: `维度 / 说明`, `字段 / 含义`, `口径 / 判断`, `现象 / 一句话`.

## Huawei Visual Language

- White background.
- Huawei red `C00000` for hierarchy and decisive emphasis.
- Restrained grays for content structure.
- Red module title bars, thin gray frames, compact Chinese body text, and footer source notes.
- No decorative gradients, shadows, blobs, ornamental icons, or poster-style full-bleed pages.
- Use only 10, 12, 14, 18, and 24 pt font sizes.
- Main page title is 24 pt Huawei red; title note is 18 pt Huawei red.
- Body text is 12 pt by default; use 14 pt only for larger conclusion boxes.

## QA Mindset

The first visual QA question is not "does the slide contain a visual anchor?" It is:

> Can the reader understand the claim by looking at the primary evidence and nearby explanation?

The next visual QA question is:

> Is the source evidence still intact?

Do not accept crops that cut off chart axes, tick labels, legends, titles, borders, diagram nodes, arrows, or table boundaries. Evidence readability is not just size; it is size plus source integrity.

If not, redesign before accepting hard-QA success.
