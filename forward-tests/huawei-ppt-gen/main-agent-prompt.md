# Main Agent Prompt: Run Huawei PPT Forward Tests

Your job is to orchestrate forward tests, not to solve PPT generation tasks yourself.

## Case Discovery

Cases are immediate child directories under:

```text
forward-tests/huawei-ppt-gen/
```

A valid case has:

```text
case-manifest.json
candidate/prompt.md
candidate/input/
```

Ignore files at the suite root and ignore directories without `candidate/prompt.md`.

## Default Run

When the user asks to run forward tests without specifying a case:

- randomly select up to 3 valid case directories;
- spawn one child agent per selected case;
- run at most 3 child agents concurrently.

## Specific Case

When the user asks to run a named case, match the name against the case directory name or `case-manifest.json` id.

Run only that one case.

## Orchestration Rules

- Spawn one child agent per selected case.
- Do not run candidate work in the main agent context.
- Give each child agent only the original case input: its case `candidate/prompt.md`, `candidate/input/`, repository `SKILL.md`, `docs/architecture_design.md`, and normal runtime references/assets required by the Skill.
- Keep the child-agent dispatch prompt minimal. Do not restate strategy, judging criteria, visual policy, or expected fixes. If the user asks for a focused variation, add at most one short reminder sentence after the original input.
- Do not reveal judge-only files, expected examples, prior generated outputs, or other case directories to a child agent.
- Judge each completed case with its case rubric when present.
- Write judgments under `.tmp/forward-tests/<case-id>/<run-id>/judgment.md`.

## Minimal Prompt Principle

Forward tests measure the Skill, not the main agent's ability to coach a candidate. The dispatch prompt must not teach the child agent how to pass the case.

Allowed dispatch content:

- candidate prompt path;
- candidate input directory;
- instruction to follow repository `SKILL.md`;
- output directory constraint;
- at most one short user-requested reminder sentence for this run.

Forbidden dispatch content:

- strategy explanations;
- judging criteria or rubric details;
- expected fixes;
- layout advice;
- evidence-selection policy;
- summaries of previous failures or prior generated outputs.

## Minimal Dispatch Shape

Use this shape when spawning a child agent:

```text
请根据以下 forward-test 输入生成完整 PPT：

- Candidate Prompt: forward-tests/huawei-ppt-gen/<case-id>/candidate/prompt.md
- Candidate Input: forward-tests/huawei-ppt-gen/<case-id>/candidate/input/

请自行读取并遵循仓库 `SKILL.md` 的完整流程。

请将所有生成产物写入：

`.tmp/forward-tests/<case-id>/<run-id>/`

[可选，一句话必要提醒。]
```

If child agents are unavailable in the current runtime, stop and report that forward tests require child-agent isolation to preserve validation integrity.
