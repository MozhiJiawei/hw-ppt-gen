# Slide Body DSL Authoring Schema

Use this reference when writing the creative body region of a Huawei content slide.

The Body DSL is a tree-shaped authoring surface for agents. It sits below the fixed skeleton/frame data and is the native body component model.

```text
skeleton/frame data -> fixed frame/chrome
Body DSL -> registry parse/check/resolve -> DSL-native measure/render -> LayoutIR/render review
```

New creative body authoring uses `bodyDsl`.

## Scope

Body DSL owns only the creative body below the title, section tag, analysis summary, and footer chrome.

It does not own:

- cover, TOC, title, title note, page number, section tag, footer source, or analysis summary;
- evidence inventory extraction;
- page coordinates or manual slot sizing;
- visual renderer implementation choices.

## Authoring Shape

Author `bodyDsl` as JSX-like markup, the same mental model an agent uses for HTML/React:

```jsx
<Slide title="页面标题">
  <TwoColumn>
    <Module title="模块标题">
      <EvidenceFigure
        id="source_fig_1"
        title="来源图"
        claim="一句中文核心观点。"
        source={sourceFigure}
        fit="contain"
      />
      <InsightText body={insightLines} emphasis={emphasisTerms} />
    </Module>
    <Module title="机制模块">
      <Visual id="process_1" title="流程" claim="流程说明闭环。" draw="Sequence/process" model={processModel} />
      <KpiCards id="kpi_1" title="关键读数" claim="读数压缩结论。" cards={cards} maxCards={3} />
    </Module>
  </TwoColumn>
</Slide>
```

In generation code, parse that markup into the runtime AST:

```js
const { parseSlideBodyDsl } = require("./scripts/pptx/dsl/jsx_dsl");

const { bodyDsl } = parseSlideBodyDsl(markup, {
  sourceFigure: { path: ".tmp/deck/source.png", caption: "Figure 1" },
  insightLines: ["判断：证据支撑该模块结论。"],
  emphasisTerms: ["证据"],
  processModel: { steps: [{ id: "input", label: "输入" }, { id: "verify", label: "验证" }], highlight: "verify" },
  cards: [{ label: "收益", value: "4.7x" }],
});
```

Treat the returned object as compiler-owned AST. The authoring surface is the tag tree.

## Layout Intent

Allowed layout intent is constrained by each registered component:

- `align`: `left`, `center`, `right`
- `valign`: `top`, `mid`, `bottom`
- `fit`: `contain`, `fill`, `cover`, `stretch`, only when the component contract allows it
- `density`: `compact`, `normal`, `spacious`
- `priority`: `primary`, `secondary`, `supporting`
- `maxLines`, `maxItems`, `maxCards`

Rejected body DSL props:

- `style`
- `x`, `y`, `w`, `h`, `width`, `height`
- `left`, `top`, `right`, `bottom`
- `margin`, `padding`
- `zIndex`, `z-index`
- raw percentages and page coordinates

`fit=stretch` is rejected for source evidence. Evidence must preserve aspect ratio.

## Official Components

The AI-facing component set is generated from the component registry into `references/generated_dsl_component_catalog.md`.

Use the discovery helpers for precise choices:

- `scripts/pptx/dsl/list_components.js`
- `scripts/pptx/dsl/describe_component.js`

The registry must expose the complete official surface, not just a few hand-written examples:

- layout containers: `<TwoColumn>`, `<BiasedColumn>`, `<ThreeColumn>`, `<FourColumn>`, `<Module>`
- source evidence: `<EvidenceFigure>`, `<EvidenceChart>`
- supporting readouts and text: `<KpiCards>`, `<Table>`, `<CapabilityStack>`, `<InsightText>`
- generated drawing: `<Visual draw="Kind/template" model={...} />`

The visual proof hierarchy is semantic, not cosmetic:

- `source_evidence`: `<EvidenceFigure>`, `<EvidenceChart>` preserve original source proof and have the highest priority.
- `generated_drawing`: `<Visual>` calls an official renderer. It can explain a mechanism or annotate source evidence, but it is secondary to source evidence.
- `supporting_readout`: KPI, table, and capability components support an already-proven claim.
- `text`: editable conclusions and boundaries.

When the first authored DSL uses source evidence for a module, keep that evidence component through QA repair. Improve layout by reallocating body slot, reducing neighboring prose/readouts, or adding source-grounded text; use generated drawing only when it preserves or explains the same evidence chain.

As of this contract, generated drawing is discovered as draw capabilities, not as one JSX tag per drawing. If a new official draw template is added to `scripts/pptx/contracts/visual_templates.js`, it should automatically appear in the first-level draw index and receive a second-level detail file unless explicitly hidden as internal.

Examples of generated drawing:

```jsx
<Visual id="bar_1" title="柱状图" claim="柱状图压缩指标变化。" draw="Quantity/bar_chart" model={barModel} />
<Visual id="loop_1" title="闭环" claim="闭环说明反馈机制。" draw="Loop/closed_loop" model={loopModel} />
<Visual id="arch_1" title="分层架构" claim="架构图说明模块分工。" draw="Hierarchy/layered_architecture" model={architectureModel} />
<Visual id="network_1" title="中心网络" claim="网络图说明中心节点约束。" draw="Network/hub_spoke_network" model={networkModel} />
```

## Generated Drawing Entry

`Visual` is the generated-drawing entry. It calls an official draw function without inventing a new component tag:

```jsx
<Visual
  id="process_1"
  title="流程"
  claim="流程显示从输入到验证的闭环。"
  draw="Sequence/process"
  model={processModel}
/>
```

The first-level generated catalog lists native draw capabilities and links to second-level detail files. Open the detail file for the selected draw before writing `model`.

The compiler converts this into the same `kind/template/visual_spec` form used by the current renderer. Step 3 can later add dynamic draw functions behind the same registry boundary.

## Runtime Resolution

Before rendering, the runtime resolves the DSL tree against the component registry:

- every `tag` must be a registered component;
- required props and constrained layout intent are validated;
- source paths are preserved for FeedbackIssue targets;
- registry facts such as real-anchor eligibility, measurement support, resize policy, renderer, and repair hints are attached to nodes.

This resolved tree is an internal parser/typechecker output, not a new authoring schema and not a planning layer.

The runtime must still satisfy core body rules: every content page needs at least one real proof component, and supporting components cannot satisfy that requirement.
