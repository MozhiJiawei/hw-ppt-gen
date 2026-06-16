# Hierarchy/tree

Generated from official visual template `Hierarchy/tree`.

## When To Use

Use for branching decomposition or parent-child structure.

## Contract

- draw: `Hierarchy/tree`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="tree_1" title="TreeHierarchy 标题" claim="TreeHierarchy 支撑当前模块判断。" source={source} draw="Hierarchy/tree" model={model} />
```

## Model

```json
{
  "nodes": [
    "root",
    "a",
    "b"
  ],
  "edges": [
    [
      "root",
      "a"
    ],
    [
      "root",
      "b"
    ]
  ],
  "labels": {
    "root": "根",
    "a": "能力A",
    "b": "能力B"
  },
  "highlight": "a"
}
```

## Authoring Notes

- `<Visual>` is generated drawing, not source evidence. It may annotate or explain a source-evidence chain, but it should not replace an authored `<EvidenceFigure>` or `<EvidenceChart>` just to satisfy layout feedback.
- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
