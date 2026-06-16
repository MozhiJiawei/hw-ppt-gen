# Loop/dual_loop

Generated from official visual template `Loop/dual_loop`.

## When To Use

Use for two interacting loops or inner/outer feedback systems.

## Contract

- draw: `Loop/dual_loop`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="dual_loop_1" title="CycleLoop 标题" claim="CycleLoop 支撑当前模块判断。" source={source} draw="Loop/dual_loop" model={model} />
```

## Model

```json
{
  "loops": [
    {
      "id": "outer",
      "label": "外环",
      "steps": [
        {
          "id": "o1",
          "label": "输入"
        },
        {
          "id": "o2",
          "label": "验证"
        }
      ]
    },
    {
      "id": "inner",
      "label": "内环",
      "steps": [
        {
          "id": "i1",
          "label": "生成"
        },
        {
          "id": "i2",
          "label": "修正"
        }
      ]
    }
  ],
  "highlight": "inner",
  "bridge_label": "反馈"
}
```

## Authoring Notes

- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.
- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
