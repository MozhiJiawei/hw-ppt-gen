# Sequence/swimlane

Generated from official visual template `Sequence/swimlane`.

## When To Use

Use for a process split across roles, systems, or responsibilities.

## Contract

- draw: `Sequence/swimlane`
- renderer: `ppt_native`
- role: `real_anchor`
- measure support: `measured`
- resize policy: `flexible`

## DSL

```jsx
<Visual id="swimlane_1" title="ProcessFlow 标题" claim="ProcessFlow 支撑当前模块判断。" draw="Sequence/swimlane" model={model} />
```

## Model

```json
{
  "lanes": [
    {
      "id": "l1",
      "label": "角色A",
      "steps": [
        {
          "id": "a",
          "label": "输入"
        },
        {
          "id": "b",
          "label": "验证"
        }
      ]
    }
  ],
  "highlight": "b"
}
```

## Authoring Notes

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
