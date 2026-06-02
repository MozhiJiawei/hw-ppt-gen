# Network/dependency_graph

Generated from official visual template `Network/dependency_graph`.

## When To Use

Use for dependency, constraint, or prerequisite relationships.

## Contract

- draw: `Network/dependency_graph`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="dependency_graph_1" title="ConstraintMap 标题" claim="ConstraintMap 支撑当前模块判断。" draw="Network/dependency_graph" model={model} />
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

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
