# Main Agent Prompt: Run Aegaeon Content-Aware Layout Forward Test

Run the forward test at:

```text
forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout
```

Your job is to orchestrate the test, not to solve the PPT generation task yourself.

## Objective

Evaluate whether the repository's Huawei PPT generation Skill can turn an upstream human-in-the-loop brief into a high-quality Huawei-style PPT when the title, conclusions, sections, and layout family are already fixed by the brief.

The candidate agent must not see any hidden expected answer. The main agent judges after the candidate finishes.

## Files To Read First

Read these files:

- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/fixture-manifest.md`
- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/judge/rubric.md`

Confirm the candidate-facing input exists:

- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/prompt.md`
- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/input/ppt_content_brief.md`
- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/input/source_image_map.md`
- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/input/source_images/`

## Contamination Rules

Do not reveal any judge-only or expected-answer material to the candidate agent.

The candidate may read:

- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/prompt.md`
- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/input/`
- repository `SKILL.md`
- `docs/architecture_design.md`
- normal repository references/assets that `SKILL.md` instructs it to use, including `references/*` and `assets/slides_ref/*`

The candidate must not read:

- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/judge/`
- `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/judge/expected-examples/`
- `docs/brainstorms/aegaeon-summary-layout/`
- any hidden expected-answer screenshots, HTML prototypes, or previous solution notes
- this `main-agent-prompt.md`

## Candidate Dispatch

Spawn a child agent with a prompt equivalent to:

```text
Use the repository Huawei PPT generation Skill to complete the task in:

forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/prompt.md

You may read the candidate prompt, the candidate input directory, and the repository Skill/references/assets required by the Skill.

Do not read:
- forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/judge/
- forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/judge/expected-examples/
- docs/brainstorms/aegaeon-summary-layout/
- any expected-answer screenshots, HTML prototypes, or previous solution notes.
```

If subagents are unavailable in the current runtime, stop and report that this forward test requires a child-agent run to preserve validation integrity. Do not run the candidate task yourself in the same context.

## Main Agent Work While Candidate Runs

Do not inspect the expected-answer brainstorm examples while the candidate is running unless needed after judgment. You may inspect `judge/rubric.md` and prepare the judgment structure.

Do not implement fixes to the Skill during the same run.

## After Candidate Finishes

Collect the candidate's output directory and inspect:

- generated `.pptx`
- deck plan JSON
- visual-anchor manifest JSON
- reference-review JSON
- hard-QA report
- exported slide PNGs
- visual-QA notes
- generation script, only as supporting evidence

Use `forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/judge/rubric.md` to judge the output.

You may inspect the exported slide PNGs visually. Use browser/image viewing tools when available.

## Judgment Output

Write judgment to:

```text
.tmp/forward-tests/aegaeon-content-aware-layout/<run-id>/judgment.md
```

Use this template:

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

## Final Response To User

Report:

- run id and output directory;
- verdict;
- score table;
- top 3 findings;
- judgment file path;
- whether any contamination risk occurred.

Do not hide failures. The goal is to improve the Skill, not to make the candidate pass.
