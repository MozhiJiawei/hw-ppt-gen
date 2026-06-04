# Matrix/table

Generated from official visual template `Matrix/table`.

## When To Use

Use as a supporting readout when row and column intersection carries meaning.

## Contract

- draw: `Matrix/table`
- renderer: `ppt_native`
- role: `supporting_component`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="table_1" title="NativeTable 标题" claim="NativeTable 支撑当前模块判断。" source={source} draw="Matrix/table" model={model} />
```

## Model

```json
{
  "rows": [
    [
      "维度",
      "判断"
    ],
    [
      "A",
      "成立"
    ],
    [
      "B",
      "待验证"
    ]
  ]
}
```

## Authoring Notes

- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.
- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
