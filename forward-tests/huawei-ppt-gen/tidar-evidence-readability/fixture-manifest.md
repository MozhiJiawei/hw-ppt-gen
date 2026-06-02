---
date: 2026-05-25
fixture: tidar-evidence-readability
source_issue: https://github.com/MozhiJiawei/hw-ppt-gen/issues/19
---

# TiDAR Evidence Readability Forward Test

This fixture preserves the issue #19 reproduction input for the TiDAR technical-evaluation deck.

## Goal

Validate whether `hw-ppt-gen` can generate a 9-page Huawei-style PPT from the already-approved TiDAR `ppt_content_brief.md` while keeping source evidence readable after export.

The regression exposed by the issue is not missing files or export failure. The generated deck exported successfully, but several evidence images, tables, and generated visuals were compressed into fixed brief columns until the exported PNGs were visually hard to read.

## Candidate-Facing Assets

Pass only this directory to the candidate agent:

- `candidate/prompt.md`
- `candidate/input/ppt_content_brief.md`
- `candidate/input/research_audit.md`
- `candidate/input/tidar.txt`
- `candidate/input/pdf_xml/`
- `candidate/input/supplemental_images/`
- `candidate/input/supplemental_sources/`

The copied brief rewrites upstream absolute paths to case-local relative paths so the fixture can run from this repository checkout.

The candidate may also read the repository Skill and normal references/assets required by `SKILL.md`, especially `SKILL.md`, `docs/architecture_design.md`, `references/*`, and `assets/slides_ref/*`.

## Judge-Facing Assets

Use after the candidate finishes:

- `judge/rubric.md`

Do not pass `judge/` to the candidate agent.

## Contamination Rules

- Do not pass the issue's previously generated `tidar.pptx` or slide screenshots to the candidate.
- Do not summarize the prior deck's visual failures beyond the candidate prompt.
- Do not pass `judge/` to the candidate.
- The main agent may inspect candidate outputs and then judge with `judge/rubric.md`.

## Expected Candidate Output Shape

The candidate should produce a complete deck under a run-specific workspace such as:

```text
.tmp/forward-tests/tidar-evidence-readability/<run-id>/
```

Expected artifacts:

- generated `.pptx`;
- deck plan JSON;
- visual-anchor manifest JSON;
- exported slide PNGs;
- exported slide PNG directory and visual-review notes;
- visual-review notes;
- notes on any evidence-first relayout, density reduction, source-image replacement, data/native visual choice, or AI-image decision.
