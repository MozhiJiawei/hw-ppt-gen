# Sequence/process

Generated from official visual template `Sequence/process`.

## When To Use

Use for ordered mechanisms, workflows, or execution paths.

## Contract

- draw: `Sequence/process`
- renderer: `ppt_native`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="process_1" title="ProcessFlow 标题" claim="ProcessFlow 支撑当前模块判断。" source={source} draw="Sequence/process" model={model} />
```

## Model

```json
{
  "steps": [
    {
      "id": "a",
      "label": "输入"
    },
    {
      "id": "b",
      "label": "验证"
    },
    {
      "id": "c",
      "label": "输出"
    }
  ],
  "highlight": "b"
}
```

## Authoring Notes

- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.
- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
