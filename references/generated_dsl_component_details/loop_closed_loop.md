# Loop/closed_loop

Generated from official visual template `Loop/closed_loop`.

## When To Use

Use for one feedback loop with clear input, action, feedback, and correction.

## Contract

- draw: `Loop/closed_loop`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="closed_loop_1" title="CycleLoop 标题" claim="CycleLoop 支撑当前模块判断。" source={source} draw="Loop/closed_loop" model={model} />
```

## Model

```json
{
  "center": "闭环",
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
