# Huawei PPT Forward Tests

Forward tests are human-orchestrated child-agent runs for checking whether the runtime Skill produces good decks on realistic paper inputs.

## Cases

Each case lives under:

```text
forward-tests/huawei-ppt-gen/<case-id>/
```

Required candidate-facing files:

- `case-manifest.json`
- `candidate/prompt.md`
- `candidate/input/`

Optional judge-facing files:

- `fixture-manifest.md`
- `judge/rubric.md`
- `judge/expected-examples/`

## Running Semantics

Forward tests do not need a Node runner. They are main-agent orchestration prompts:

- When the user asks to run forward without specifying a case, the main agent randomly chooses up to 3 case directories and starts one child agent per case.
- The max child-agent concurrency is 3.
- When the user asks to run a named case, the main agent starts exactly one child agent for that case.
- Each child agent receives only that case's `candidate/prompt.md`, `candidate/input/`, repository `SKILL.md`, `docs/architecture_design.md`, and normal runtime references/assets required by the Skill.
- Judge-only files stay in the main agent context.

Case names are the directory names under:

```text
forward-tests/huawei-ppt-gen/
```

Use `main-agent-prompt.md` for the exact orchestration wording.

## Minimal Prompt Principle

Forward tests measure whether the runtime Skill can solve a realistic case from its normal inputs. The main agent must not teach the child agent the answer in the dispatch prompt.

The child-agent prompt should contain only:

- the candidate prompt path;
- the candidate input directory;
- the instruction to follow repository `SKILL.md`;
- the required output directory under `.tmp/forward-tests/<case-id>/<run-id>/`;
- at most one short user-requested reminder sentence for that run.

Do not include strategy explanations, judging criteria, expected fixes, layout advice, evidence-selection policy, review rubric details, or summaries of previous failures in the child-agent dispatch prompt. Keep those in `fixture-manifest.md`, `judge/rubric.md`, or the main agent's judgment context only.
