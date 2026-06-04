# Hierarchy/layered_architecture

Generated from official visual template `Hierarchy/layered_architecture`.

## When To Use

Use for architecture layers, module boundaries, and cross-layer edges.

## Contract

- draw: `Hierarchy/layered_architecture`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="layered_architecture_1" title="ArchitectureMap 标题" claim="ArchitectureMap 支撑当前模块判断。" source={source} draw="Hierarchy/layered_architecture" model={model} />
```

## Model

```json
{
  "layers": [
    {
      "label": "接入层",
      "items": [
        "input"
      ]
    },
    {
      "label": "处理层",
      "items": [
        "engine"
      ]
    },
    {
      "label": "验证层",
      "items": [
        "review"
      ]
    }
  ],
  "side_label": "治理",
  "side_modules": [
    "policy"
  ],
  "edges": [
    [
      "input",
      "engine"
    ],
    [
      "engine",
      "review"
    ],
    [
      "policy",
      "engine"
    ]
  ]
}
```

## Authoring Notes

- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.
- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
