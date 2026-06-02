# Quantity/bar_chart

Generated from official visual template `Quantity/bar_chart`.

## When To Use

Use for categorical numeric comparison with a small number of categories.

## Contract

- draw: `Quantity/bar_chart`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="bar_chart_1" title="MiniBarChart 标题" claim="MiniBarChart 支撑当前模块判断。" draw="Quantity/bar_chart" model={model} />
```

## Model

```json
{
  "y_label": "指标",
  "categories": [
    "Q1",
    "Q2",
    "Q3"
  ],
  "series": [
    {
      "name": "A",
      "values": [
        30,
        48,
        62
      ]
    }
  ],
  "highlight": "Q3"
}
```

## Authoring Notes

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
