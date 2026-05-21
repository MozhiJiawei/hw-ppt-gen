---
date: 2026-05-19
fixture: aegaeon-content-aware-layout
---

# Aegaeon Content-Aware Layout Forward Test

This fixture tests whether `hw-ppt-gen` can turn an already-approved upstream brief into a high-quality Huawei-style PPT without seeing the expected answer.

## Goal

Validate the Skill's layout-realization ability after the upstream human-in-the-loop process has already decided:

- deck topic and audience;
- page titles and title notes;
- analysis-summary viewpoints;
- TOC / section structure;
- parser-derived `contentLayout.type`.

The candidate-facing prompt is intentionally minimal. It should only point the candidate at the brief and output location; all behavior about brief consumption, layout realization, evidence readability, text compression, module density, Huawei visual consistency, QA, and artifact shape must come from the repository Skill and normal runtime references.

## Candidate-Facing Assets

Pass only this directory to the candidate agent:

- `candidate/prompt.md`
- `candidate/input/ppt_content_brief.md`
- `candidate/input/source_image_map.md`
- `candidate/input/source_images/*.png`

`ppt_content_brief.md` is the only semantic input. The copied `source_images/` files cover every Markdown image reference in the brief, and the fixture copy of the brief points to those local relative files. `source_image_map.md` records the figure-label to local-file relationship for portability, but the candidate prompt should not teach layout or compression tactics from the fixture.

The candidate may also read the repository Skill and normal references/assets required by `SKILL.md`, especially `SKILL.md`, `docs/architecture_design.md`, `references/*`, and `assets/slides_ref/*`.

## Judge-Facing Assets

Use after the candidate finishes:

- `judge/rubric.md`
- `judge/expected-examples/`

Do not pass `judge/` to the candidate agent. The expected examples are archived for judge-side comparison, debugging, and future Skill improvement only; they are not candidate input.

## Contamination Rules

- Do not pass any screenshot or HTML prototype from `docs/brainstorms/aegaeon-summary-layout/` to the candidate.
- Do not pass `judge/expected-examples/` to the candidate.
- Do not summarize the desired answer to the candidate.
- Do not mention the exact fixes discovered during the brainstorm, except through the public Skill and normal repository references.
- The main agent may inspect candidate outputs and then judge with `judge/rubric.md`.

## Expected Candidate Output Shape

The candidate should produce a complete deck under a run-specific workspace such as:

```text
.tmp/forward-tests/aegaeon-content-aware-layout/<run-id>/
```

Expected artifacts are judged after the run, but should be required by the Skill rather than taught in the candidate prompt:

- generated `.pptx`;
- deck plan JSON;
- visual-anchor manifest JSON;
- exported slide PNGs;
- hard-QA report;
- visual-QA notes.

The fixture does not include runtime automation. It only fixes the input, candidate prompt, and judging criteria.
