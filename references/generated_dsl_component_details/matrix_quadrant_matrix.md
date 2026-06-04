# Matrix/quadrant_matrix

Generated from official visual template `Matrix/quadrant_matrix`.

## When To Use

Use for two-axis positioning with a small number of items.

## Contract

- draw: `Matrix/quadrant_matrix`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="quadrant_matrix_1" title="QuadrantMatrix 标题" claim="QuadrantMatrix 支撑当前模块判断。" source={source} draw="Matrix/quadrant_matrix" model={model} />
```

## Model

```json
{
  "x_axis": {
    "left": "低",
    "right": "高",
    "label": "收益"
  },
  "y_axis": {
    "bottom": "低",
    "top": "高",
    "label": "风险"
  },
  "items": [
    {
      "label": "A",
      "x": 0.7,
      "y": 0.3
    },
    {
      "label": "B",
      "x": 0.35,
      "y": 0.65
    }
  ],
  "highlight": "A"
}
```

## Authoring Notes

- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.
- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
