# Matrix/heatmap

Generated from official visual template `Matrix/heatmap`.

## When To Use

Use as a supporting matrix when intensity values are the point.

## Contract

- draw: `Matrix/heatmap`
- renderer: `ppt_native`
- role: `supporting_component`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="heatmap_1" title="HeatmapMatrix 标题" claim="HeatmapMatrix 支撑当前模块判断。" source={source} draw="Matrix/heatmap" model={model} />
```

## Model

```json
{
  "rows": [
    "能力",
    "风险"
  ],
  "columns": [
    "A",
    "B"
  ],
  "values": [
    [
      0.9,
      0.6
    ],
    [
      0.2,
      0.5
    ]
  ],
  "highlight": "A"
}
```

## Authoring Notes

- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.
- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
