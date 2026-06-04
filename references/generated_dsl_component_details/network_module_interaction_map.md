# Network/module_interaction_map

Generated from official visual template `Network/module_interaction_map`.

## When To Use

Use for module-to-module interactions in an architecture.

## Contract

- draw: `Network/module_interaction_map`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="module_interaction_map_1" title="ArchitectureMap 标题" claim="ArchitectureMap 支撑当前模块判断。" source={source} draw="Network/module_interaction_map" model={model} />
```

## Model

```json
{
  "nodes": [
    {
      "id": "a",
      "label": "节点A"
    },
    {
      "id": "b",
      "label": "节点B"
    },
    {
      "id": "c",
      "label": "节点C"
    }
  ],
  "edges": [
    [
      "a",
      "b"
    ],
    [
      "b",
      "c"
    ]
  ],
  "highlight": "b"
}
```

## Authoring Notes

- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.
- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
