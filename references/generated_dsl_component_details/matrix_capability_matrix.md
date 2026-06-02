# Matrix/capability_matrix

Generated from official visual template `Matrix/capability_matrix`.

## When To Use

Use as a supporting matrix for capability coverage or maturity.

## Contract

- draw: `Matrix/capability_matrix`
- renderer: `ppt_native`
- role: `supporting_component`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="capability_matrix_1" title="CapabilityMatrix 标题" claim="CapabilityMatrix 支撑当前模块判断。" draw="Matrix/capability_matrix" model={model} />
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

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
