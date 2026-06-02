# Judge Rubric: Aegaeon Content-Aware Layout Forward Test

Use this rubric after the candidate agent generates a deck. The judge may inspect the candidate's PPTX, plan, manifest, visual-review notes, exported PNGs, and generation script.

Do not judge by whether the candidate reproduced a hidden answer exactly. Judge whether the output demonstrates the intended Skill capability under the upstream-brief division of labor.

## Pass / Fail Gate

The run fails immediately if any of these are true:

- The deck does not preserve brief-fixed fields: page count, titles, title notes, analysis-summary points, TOC order, content-slide section assignments, or parser-derived `bodyLayout.type`.
- A content slide lacks a visual anchor where the brief requires source figure/chart/table evidence.
- A primary source figure is visibly too small to act as evidence.
- Visible generated text is mostly copied long-form prose from the brief instead of compressed page text.
- A slide has obvious text overflow, overlap, clipped title, broken image, or missing exported render evidence.
- The candidate appears to have read hidden answer artifacts such as `docs/brainstorms/aegaeon-summary-layout/`.

## Scoring

Score each category from 0 to 3.

- 0: failed or absent
- 1: weak / mostly mechanical
- 2: acceptable with minor issues
- 3: strong, production-quality

### 1. Brief Contract Fidelity

Checks:

- Uses `ppt_content_brief.md` through the Skill's brief-consumption flow.
- Preserves fixed brief fields exactly: titles, title notes, analysis-summary labels/text, TOC, page order, current section, and bodyLayout type.
- Uses `正文内容`, `参考图片`, and `备注` as layout material rather than as a second story line.

### 2. Huawei Visual Language

Checks:

- Matches Huawei reference language: white background, Huawei red hierarchy, top-right tabs, title rule, analysis-summary band, red module title bars, thin gray outlines, compact body text, and footer.
- Avoids web-dashboard or poster styling.
- Uses red for hierarchy and decisive emphasis, not decoration.

### 3. Given-Layout Realization

Checks:

- For `two_column`, both columns carry complete information modules; images, comparison blocks, KPI cards, and notes are balanced inside the given two-column family.
- For `biased_column`, the left visual region keeps the main evidence readable, while right cards are dense and useful instead of sparse.
- For `three_column`, columns may use different internal weights/heights while preserving the three-module family; bottom space becomes structured information rather than emptiness.
- Does not silently change the upstream layout family to solve a design problem.

### 4. Evidence Readability

Checks:

- Source figures are large enough to support the slide claim.
- Figure placement preserves aspect ratio without making the evidence tiny.
- Captions, legends, reading guidance, or nearby interpretation clarify why the evidence is present.
- If a source figure is too dense, the candidate uses appropriate cropping, derived evidence, KPI cards, or structured summaries while preserving source-traceability.

### 5. Text Compression

Checks:

- Visible text becomes short labels, judgments, reading guidance, compact notes, KPI labels, or table cells.
- Long paragraphs from the brief are not pasted into cards.
- The slide can be scanned through title, analysis summary, module titles, red labels, and KPI values.
- Notes/caveats preserve important nuance without overloading visible text.

### 6. Information Density

Checks:

- Slides feel high-density but ordered.
- Large cards or module bottoms are not half-empty unless dominated by a readable visual anchor.
- Empty space is filled, when appropriate, with source-grounded structure such as compact comparison tables, KPI rows, dense notes, or readout blocks.
- Added density does not become clutter or duplicate the same claim.

### 7. Review Discipline

Checks:

- Exported slide PNGs and visual-review notes were produced.
- Exported slide PNGs were inspected.
- Visual-review notes identify actual issues rather than only claiming success.
- Remaining caveats are concrete and bounded.

## Recommended Verdict Labels

- **Strong pass:** No fail gates; average score >= 2.6; no category below 2.
- **Pass with issues:** No fail gates; average score >= 2.0; at most two categories score 1.
- **Needs rerun:** No fail gates, but average score < 2.0 or more than two categories score 1.
- **Fail:** Any fail gate is triggered.

## Judge Output Template

```markdown
# Forward Test Judgment

## Verdict

[Strong pass / Pass with issues / Needs rerun / Fail]

## Scores

- Brief Contract Fidelity: [0-3]
- Huawei Visual Language: [0-3]
- Given-Layout Realization: [0-3]
- Evidence Readability: [0-3]
- Text Compression: [0-3]
- Information Density: [0-3]
- Review Discipline: [0-3]

## Blocking Findings

- [Finding or "None"]

## Notable Strengths

- [Strength]

## Improvement Targets

- [Target]

## Evidence Reviewed

- [PPTX path]
- [Plan path]
- [Manifest path]
- [Visual-review notes path]
- [Slide PNG directory]
```
