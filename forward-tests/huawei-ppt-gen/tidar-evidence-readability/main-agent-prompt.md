# Main Agent Prompt: Run TiDAR Evidence Readability Forward Test

Run the forward test at:

```text
forward-tests/huawei-ppt-gen/tidar-evidence-readability
```

Your job is to orchestrate the test, not to solve the PPT generation task yourself.

## Objective

Evaluate whether the repository's Huawei PPT generation Skill can turn the TiDAR issue #19 input into a high-quality Huawei-style PPT while preserving exported evidence readability.

The candidate agent must not see any prior generated PPT, issue screenshots, judge-only rubric, or expected-answer material. The main agent judges after the candidate finishes.

## Files To Read First

Read these files:

- `forward-tests/huawei-ppt-gen/tidar-evidence-readability/fixture-manifest.md`
- `forward-tests/huawei-ppt-gen/tidar-evidence-readability/judge/rubric.md`

Confirm the candidate-facing input exists:

- `forward-tests/huawei-ppt-gen/tidar-evidence-readability/candidate/prompt.md`
- `forward-tests/huawei-ppt-gen/tidar-evidence-readability/candidate/input/ppt_content_brief.md`
- `forward-tests/huawei-ppt-gen/tidar-evidence-readability/candidate/input/pdf_xml/`
- `forward-tests/huawei-ppt-gen/tidar-evidence-readability/candidate/input/supplemental_images/`

## Candidate Dispatch

Spawn a child agent with a prompt equivalent to:

```text
请根据以下材料生成完整 PPT：

- Candidate Prompt: forward-tests/huawei-ppt-gen/tidar-evidence-readability/candidate/prompt.md
- Candidate Input: forward-tests/huawei-ppt-gen/tidar-evidence-readability/candidate/input/

请自行读取并遵循仓库 `SKILL.md` 的完整流程。

请将所有生成产物写入：

`.tmp/forward-tests/tidar-evidence-readability/<run-id>/`

`<run-id>` 必须是新的、未存在的目录，不能覆盖或复用历史 forward 结果。
```

If subagents are unavailable in the current runtime, stop and report that this forward test requires a child-agent run to preserve validation integrity. Do not run the candidate task yourself in the same context.

## After Candidate Finishes

Collect the candidate's output directory and inspect:

- generated `.pptx`;
- deck plan JSON;
- visual-anchor manifest JSON;
- hard-QA report;
- exported slide PNGs;
- visual-QA notes;
- generation script, only as supporting evidence.

Use `forward-tests/huawei-ppt-gen/tidar-evidence-readability/judge/rubric.md` to judge the output.

Write judgment to:

```text
.tmp/forward-tests/tidar-evidence-readability/<run-id>/judgment.md
```
