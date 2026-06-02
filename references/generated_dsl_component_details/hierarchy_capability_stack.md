# Hierarchy/capability_stack

Generated from official visual template `Hierarchy/capability_stack`.

## When To Use

Use as a supporting readout for layered capabilities.

## Contract

- draw: `Hierarchy/capability_stack`
- renderer: `ppt_native`
- role: `supporting_component`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="capability_stack_1" title="LayerStack 标题" claim="LayerStack 支撑当前模块判断。" draw="Hierarchy/capability_stack" model={model} />
```

## Model

```json
{
  "levels": [
    {
      "label": "基础",
      "value": "输入"
    },
    {
      "label": "增强",
      "value": "处理"
    },
    {
      "label": "输出",
      "value": "验证"
    }
  ],
  "highlight": "增强"
}
```

## Authoring Notes

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
