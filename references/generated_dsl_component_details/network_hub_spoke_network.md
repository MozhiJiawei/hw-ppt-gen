# Network/hub_spoke_network

Generated from official visual template `Network/hub_spoke_network`.

## When To Use

Use for one central node connected to several surrounding nodes.

## Contract

- draw: `Network/hub_spoke_network`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="hub_spoke_network_1" title="NetworkGraph 标题" claim="NetworkGraph 支撑当前模块判断。" draw="Network/hub_spoke_network" model={model} />
```

## Model

```json
{
  "hub": {
    "id": "hub",
    "label": "中心"
  },
  "nodes": [
    {
      "id": "a",
      "label": "节点A"
    },
    {
      "id": "b",
      "label": "节点B"
    }
  ],
  "edges": [
    [
      "hub",
      "a"
    ],
    [
      "hub",
      "b"
    ]
  ],
  "highlight": "a"
}
```

## Authoring Notes

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
