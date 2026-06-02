# Loop/spiral_iteration_ladder

Generated from official visual template `Loop/spiral_iteration_ladder`.

## When To Use

Use for iterative improvement that accumulates by stages.

## Contract

- draw: `Loop/spiral_iteration_ladder`
- renderer: `rough_svg`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="spiral_iteration_ladder_1" title="CycleLoop 标题" claim="CycleLoop 支撑当前模块判断。" draw="Loop/spiral_iteration_ladder" model={model} />
```

## Model

```json
{
  "center": "闭环",
  "steps": [
    {
      "id": "a",
      "label": "输入"
    },
    {
      "id": "b",
      "label": "验证"
    },
    {
      "id": "c",
      "label": "输出"
    }
  ],
  "highlight": "b"
}
```

## Authoring Notes

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
