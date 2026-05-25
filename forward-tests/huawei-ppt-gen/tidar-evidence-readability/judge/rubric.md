# Judge Rubric: TiDAR Evidence Readability Forward Test

Use this rubric after the candidate agent generates a deck. The judge may inspect the candidate's PPTX, plan, manifest, QA reports, exported PNGs, and generation script.

## Scoring

Score each dimension from 0 to 3.

- Brief Contract Fidelity: keeps the 9-page TiDAR brief intent, page sequence, title notes, and conclusion hierarchy.
- Evidence Priority: uses source evidence first, then native/data hand-drawn visuals, then AI-generated concept images only as fallback.
- Evidence Readability: exported slide PNGs keep primary figures, tables, and generated visuals readable at their final displayed size.
- Density Conflict Handling: resolves fixed-column versus evidence-size conflict through relayout, density reduction, or evidence movement instead of shrinking everything.
- Summary Boundary Fidelity: the Summary page third column explains TiDAR's real landing boundary: 50B/150B continued pretraining, single-H100 batch=1 evidence scope, and H100 kernel / KV cache / serving adaptation constraints.
- AI-Image Discipline: uses AI images only when they communicate the target claim better than source evidence or structured native diagrams; any AI image must support the module claim, not merely decorate or disclaim.
- Huawei Visual Language: follows the repository Huawei-style visual system without decorative clutter.
- QA Discipline: runs hard QA, exports slides, and records visual-QA notes that specifically discuss evidence size/readability.

## Blocking Findings

Treat any of the following as a likely fail:

- Hard QA fails.
- A primary source figure or table is present but visibly unreadable in exported PNGs.
- The deck replaces available source evidence with AI-generated imagery without a documented reason.
- Summary page "落地边界" is shown as generic deployment, server, shield, validation, or AI-fallback imagery without the training-cost / batch=1 / kernel-KV-serving boundary claim.
- The deck adds visible body/footer copy whose main purpose is to explain that an image is AI-generated or a fallback instead of explaining the TiDAR landing decision.
- The candidate reads judge-only files, prior issue screenshots, or previous generated outputs.
- The output lacks exported slide PNGs, making readability impossible to judge.

## Judgment Template

```markdown
# Forward Test Judgment

## Verdict

[Strong pass / Pass with issues / Needs rerun / Fail]

## Scores

- Brief Contract Fidelity: [0-3]
- Evidence Priority: [0-3]
- Evidence Readability: [0-3]
- Density Conflict Handling: [0-3]
- Summary Boundary Fidelity: [0-3]
- AI-Image Discipline: [0-3]
- Huawei Visual Language: [0-3]
- QA Discipline: [0-3]

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
- [QA report path]
- [Slide PNG directory]
```
