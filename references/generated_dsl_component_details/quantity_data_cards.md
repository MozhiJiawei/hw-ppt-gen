# Quantity/data_cards

Generated from official visual template `Quantity/data_cards`.

## When To Use

Use for a few numeric readouts after the module already has real evidence or drawing proof.

## Contract

- draw: `Quantity/data_cards`
- renderer: `ppt_native`
- role: `supporting_component`
- measure support: `measured`
- resize policy: `fixed`

## DSL

```jsx
<Visual id="data_cards_1" title="KpiCardRow 标题" claim="KpiCardRow 支撑当前模块判断。" draw="Quantity/data_cards" model={model} />
```

## Model

```json
{}
```

## Authoring Notes

- Keep `title` and `claim` as metadata on `<Visual>`; they are not a place for long prose.
- Keep explanatory text, captions, source notes, and conclusions in nearby `<InsightText>` or supporting readouts.
- If measurement feedback reports crowding, simplify the model first, then reduce neighboring prose or split the claim.
