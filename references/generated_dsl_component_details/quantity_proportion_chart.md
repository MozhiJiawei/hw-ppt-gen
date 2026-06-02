# Quantity/proportion_chart

Generated from official visual template `Quantity/proportion_chart`.

## When To Use

Use for part-to-whole proportions with a small number of segments.

## Contract

- draw: `Quantity/proportion_chart`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="proportion_chart_1" title="DonutReadout 标题" claim="DonutReadout 支撑当前模块判断。" draw="Quantity/proportion_chart" model={model} />
```

## Model

```json
{
  "segments": [
    {
      "label": "A",
      "value": 60
    },
    {
      "label": "B",
      "value": 40
    }
  ],
  "total_label": "100%"
}
```

## Authoring Notes

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
