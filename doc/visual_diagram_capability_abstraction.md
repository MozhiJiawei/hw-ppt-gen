# PPT Visual Diagram Capability Abstraction

## Goal

When a PPT lacks source figures or reference images, the generator should still create a strong visual anchor for each slide. The drawing system should not expose dozens of visual chart names directly to the AI. Instead, it should guide the AI through a small set of orthogonal visual intents, then map each intent to a limited set of implementation templates.

## Core Principle

Most diagram types are not truly orthogonal. For example, a timeline is a process diagram with time emphasis; a pyramid is a hierarchy diagram with proportion/level emphasis; an architecture diagram may be hierarchy plus network. If the skill exposes too many chart names, the AI may choose by surface appearance rather than by the information relationship.

Therefore, the skill should ask the AI to choose the information relationship first.

## Six Visual Intents

### 1. Quantity

Question: What numeric difference, trend, share, distribution, or magnitude does the slide need to prove?

Use when the source contains measurable values, benchmark scores, proportions, growth, ranking, deltas, or comparisons.

Default templates:
- Grouped bar chart
- Line chart
- Donut / proportion chart
- Heatmap when values are two-dimensional

Selection priority: highest. If numbers are central to the claim, prefer Quantity over conceptual diagrams.

### 2. Sequence

Question: What happens first, next, and last?

Use when explaining steps, workflows, pipelines, roadmaps, phases, lifecycle stages, or execution order.

Default templates:
- Horizontal process
- Vertical process
- Timeline
- Swimlane when multiple actors participate

### 3. Loop

Question: How does the system feed back into itself or improve over iterations?

Use when explaining feedback, self-improvement, optimization cycles, monitoring loops, training/evaluation loops, or continuous delivery.

Default templates:
- Four-step closed loop
- Center goal plus surrounding cycle
- Dual-loop diagram
- Spiral / iteration ladder for progressive improvement

### 4. Hierarchy

Question: Who contains, derives from, branches from, or depends structurally on whom?

Use when explaining parent-child relationships, trees, taxonomies, decomposition, layered stacks, capability levels, search branches, archive lineage, or maturity stages.

Default templates:
- Tree diagram
- Layered architecture stack
- Pyramid / capability stack
- Decision tree

### 5. Matrix

Question: How should objects be positioned by two dimensions at once?

Use when comparing trade-offs, priorities, risks, capabilities, markets, solution positioning, maturity, or coverage across two axes.

Default templates:
- 2x2 quadrant
- Capability matrix
- Risk matrix
- Heatmap when cells carry values

### 6. Network

Question: How do multiple entities connect, influence, exchange, or depend on each other?

Use when explaining module dependencies, system interactions, agent collaboration, ecosystem maps, tool relationships, knowledge graphs, or causal influence among non-hierarchical entities.

Default templates:
- Hub-and-spoke
- Small dependency graph
- Module interaction map
- Causal influence graph

Selection priority: lowest. Network diagrams are flexible but easy to make messy, so use them only when the relationship is genuinely many-to-many or non-linear.

## Intent Selection Decision Tree

For each content slide, choose exactly one primary visual intent.

1. If numeric evidence is central to the slide claim, choose Quantity.
2. Else if the slide explains feedback, iteration, or self-improvement, choose Loop.
3. Else if the slide explains ordered steps or phases, choose Sequence.
4. Else if the slide explains parent-child, branching, decomposition, layers, or lineage, choose Hierarchy.
5. Else if the slide compares items across two dimensions, choose Matrix.
6. Else choose Network only for genuine multi-entity interaction or dependency.

Priority order:

Quantity > Loop > Sequence > Hierarchy > Matrix > Network

## Visual Spec Contract

Before drawing, the AI should produce a compact visual spec for every content slide.

Example:

```json
{
  "intent": "Hierarchy",
  "reason": "The slide explains how Archive preserves branching parent-child evolution paths.",
  "template": "tree",
  "claim": "Low-scoring branches can remain useful stepping stones for later high-scoring agents.",
  "elements": {
    "nodes": ["0", "6", "12", "24", "31", "44", "56", "79"],
    "edges": [["0", "6"], ["0", "12"], ["6", "24"], ["12", "31"], ["24", "44"], ["31", "56"], ["44", "79"]],
    "highlight": "79",
    "labels": {
      "0": "20%",
      "6": "26%",
      "12": "23%",
      "24": "31%",
      "31": "28%",
      "44": "38%",
      "56": "34%",
      "79": "50%"
    }
  },
  "annotation": "All nodes keep non-zero selection probability, so old branches are not discarded too early."
}
```

## Implementation Implication

The skill should expose six intent-level capabilities to the AI, not a long menu of surface chart names. Scripts can still implement multiple templates under each intent, but the planning interface should stay small.

Implemented Rough.js base template coverage. Each base template should provide a clear visual difference, not just a semantic alias:

- Quantity: grouped bar chart, line chart, donut/proportion chart, heatmap.
- Sequence: horizontal process, vertical process, timeline, swimlane.
- Loop: closed loop, dual loop, spiral/iteration ladder.
- Hierarchy: tree diagram, layered architecture, pyramid/capability stack.
- Matrix: quadrant matrix, capability matrix.
- Network: hub-and-spoke, dependency graph, module interaction map, causal influence graph.

Semantic variants such as decision tree, center-goal cycle, risk matrix, and heatmap matrix are not kept as base templates until they have distinct visual treatment. For one-off deck needs, copy the closest base renderer in the deck-specific generation script and customize it there.

## What Counts As Real Diagram Capability

Text-only cards and bullet lists are layout components, not visual diagram capabilities. They can support a diagram, but they should not count as the slide's primary visual anchor.

A real visual anchor must include at least one of:

- Spatial relationship between entities
- Directed or undirected edges
- Axes or quantitative scale
- Hierarchical containment or branching
- Loop/cycle structure
- Matrix positioning
- Proportional or comparative encoding

## QA Questions

For each generated slide, ask:

1. Does the slide have one clear primary visual intent?
2. Does the chosen diagram answer the slide's central question?
3. Is the diagram more informative than a list of cards would be?
4. Are labels short enough to keep the visual readable?
5. Is Network used only when simpler intents do not fit?
6. If numeric evidence exists, did the slide choose Quantity unless there is a strong reason not to?

## Source Visual Priority

Original source visuals are more important than self-drawn diagrams. A self-drawn diagram is a fallback or simplification tool, not the default replacement for source evidence.

Visual strategy priority:

1. Source figure / table / screenshot
2. Data chart recreated from source numbers
3. Redrawn simplified diagram based on a source visual
4. Self-drawn concept diagram from visual intent and visual spec
5. Text/card layout

Text/card layout must not count as the primary visual anchor.

## Why Source Visuals Come First

Source visuals carry evidence value that self-drawn diagrams cannot fully replace:

- Evidence: the visual comes directly from the paper, report, product, screenshot, or experiment.
- Detail density: source figures often contain technical details that may be lost during redrawing.
- Traceability: the audience can see that the claim is grounded in source material rather than invented for the deck.

## Source Visual Treatment Ladder

When a relevant source visual exists, choose the least destructive treatment that makes it useful in the slide.

1. Direct evidence module
   - Use when the source visual is clear, focused, and readable at slide size.
   - Compose as visual + Chinese legend + source note + 1-3 interpretation lines.

2. Crop and zoom
   - Use when the source visual is relevant but too large, too dense, or contains multiple subfigures.
   - Crop to the key region and enlarge it.

3. Annotate
   - Use when the source visual is readable but the audience needs reading guidance.
   - Add highlight boxes, arrows, numbered markers, or side callouts.

4. Redraw simplified diagram based on source
   - Use when the source visual is important but unreadable at PPT size.
   - Preserve the source reference and state that the diagram is simplified from the original figure/table.

5. Self-draw concept diagram
   - Use only when no useful source visual exists, or when the source visual does not support the slide claim.

## Visual Evidence Decision Gate

For every content slide, search for source visuals before creating a self-drawn diagram.

Decision rules:

- Prefer source visuals when they directly support the slide claim and remain readable or can be made readable through cropping, zooming, or annotation.
- Prefer data charts when source numbers are central to the slide claim, even if no ready-made source chart exists.
- Prefer redrawn simplified diagrams when a source visual is important but too dense for slide-scale reading.
- Use self-drawn concept diagrams only when no relevant source visual or source numbers exist.
- Never use text-only cards as the primary visual anchor.

## Visual Anchor Contract With Source Priority

Each content slide should define a visual anchor before generation code is written.

When source visuals are available:

```json
{
  "slide": 5,
  "claim": "DGM learned workflow-level improvements rather than one isolated trick.",
  "source_visual_search": {
    "performed": true,
    "candidates": [
      {
        "path": ".tmp/source_figures/figure3.png",
        "caption": "Figure 3: Representative self-improvements",
        "relevance": "high",
        "readability": "medium",
        "decision": "use_with_annotations"
      }
    ]
  },
  "visual_strategy": "source_visual",
  "source_treatment": "crop_zoom_annotate",
  "legend": "DGM 自我改进示例：工具与工作流层能力持续增强",
  "interpretation": [
    "多数改进不是单点 prompt 技巧，而是工具粒度和评审流程升级。",
    "能力可跨模型迁移，说明其更接近 workflow 层改进。"
  ],
  "fallback_if_unreadable": {
    "visual_strategy": "redrawn_simplified_diagram",
    "intent": "Matrix",
    "template": "capability_map"
  }
}
```

When no useful source visual exists:

```json
{
  "slide": 4,
  "claim": "Archive preserves potential stepping stones instead of discarding weak branches too early.",
  "source_visual_search": {
    "performed": true,
    "candidates": [],
    "decision": "no_relevant_source_visual"
  },
  "visual_strategy": "self_draw",
  "intent": "Hierarchy",
  "template": "tree",
  "visual_spec": {
    "nodes": ["0", "6", "12", "24", "31", "44", "79"],
    "edges": [["0", "6"], ["0", "12"], ["6", "24"], ["24", "44"], ["44", "79"]],
    "highlight": "79"
  }
}
```

## Updated QA Questions For Visual Anchors

For each generated slide, ask:

1. Did the slide search for source visuals before self-drawing?
2. If a relevant source visual existed, was it used, cropped, annotated, or simplified before falling back to a self-drawn concept diagram?
3. If source numbers existed, did the slide use a data chart unless there was a strong reason not to?
4. If the slide uses a self-drawn diagram, is the absence or rejection of source visuals recorded?
5. Does the visual anchor carry evidence or structure that text cards alone could not provide?

## Incremental Diagram Component System

The diagram capability should be developed as a separately iterated subsystem instead of being embedded entirely into the main SKILL.md. The main PPT skill should stay lean and load diagram-specific instructions only when a slide needs a real visual anchor.

## Progressive Loading Requirement

Use progressive disclosure:

1. Main SKILL.md contains only the visual decision gate:
   - Search source visuals first.
   - If no usable source visual exists, choose a visual intent.
   - Load the diagram reference only when `visual_strategy` is `self_draw`, `redrawn_simplified_diagram`, or `data_chart`.

2. Diagram reference file contains:
   - Six visual intents.
   - Intent selection rules.
   - Visual spec schema.
   - Template selection guidance.
   - Complexity limits.
   - QA rubric for diagrams.

3. Diagram helper script contains:
   - PPT-native rendering primitives.
   - Intent/template dispatchers.
   - Safe defaults and hard caps.
   - Exported helper functions used by deck-specific generation scripts.

This keeps ordinary source-figure decks from loading unnecessary diagram instructions.

## Standalone Iteration Requirement

The diagram subsystem should be testable without generating a full real deck from source material. It should have its own prompt-guided test cases that ask the AI to choose a visual intent, produce a visual spec, call the diagram component, and generate sample slides for human review.

The goal of these tests is visual quality and intent fit, not source-material understanding.

## Prompt-Guided Test Case Format

Each test case should include:

- `id`: stable test id.
- `scenario`: short user-like request.
- `expected_intent`: intended visual intent.
- `expected_template`: preferred template.
- `input_facts`: minimal facts/nodes/numbers/stages the AI should use.
- `human_review_focus`: what reviewers should inspect.

Example:

```json
{
  "id": "hierarchy_archive_tree",
  "scenario": "Create one Huawei-style slide explaining why Archive preserves promising but temporarily weak branches.",
  "expected_intent": "Hierarchy",
  "expected_template": "tree",
  "input_facts": {
    "nodes": ["0", "6", "12", "24", "31", "44", "56", "79"],
    "edges": [["0", "6"], ["0", "12"], ["6", "24"], ["12", "31"], ["24", "44"], ["31", "56"], ["44", "79"]],
    "scores": {"0": "20%", "6": "26%", "12": "23%", "24": "31%", "31": "28%", "44": "38%", "56": "34%", "79": "50%"},
    "highlight": "79"
  },
  "human_review_focus": [
    "Does the tree clearly show branching lineage?",
    "Is the highlighted node visually dominant but not overdecorated?",
    "Are labels readable at final slide size?",
    "Does the diagram feel like a technical PPT visual rather than card layout?"
  ]
}
```

## Required Test Coverage

Maintain at least one prompt-guided test case for each supported visual base template. The maintained regression matrix in `references/visual_diagram_test_cases.js` should cover every base template with at least 10 variants, not just one representative template per intent. The matrix should vary element count and scene context inside the chosen template layout instead of stretching the same scene across multiple aspect ratios.

Also keep at least one source-visual treatment test:

- Evidence module with source image + Chinese legend + source note + interpretation.
- Redrawn simplified diagram from a dense source figure.

## Human Review Loop

Diagram components should be improved through a small visual review loop:

1. Run a prompt-guided test case.
2. Generate SVG image anchors under `.tmp/diagram_component_smoke/`.
3. Review the SVG at its requested canvas ratio, or embed it into a standard content slide and export the full deck when checking PPT composition.
4. Record findings in `.tmp/<test_id>_diagram_review.json` or `.tmp/<test_id>_diagram_review.md`.
5. Patch the diagram helper or reference guidance.
6. Re-run the same test case.

Limit each test to two regeneration iterations unless the issue is a hard rendering failure.

## Review Rubric For Diagram Tests

A diagram test passes only if:

- The selected visual intent matches the scenario.
- The generated visual spec is explicit enough for deterministic rendering.
- The diagram is the primary visual anchor, not a text-card layout disguised as a diagram.
- Labels fit and remain readable.
- Edges, axes, loops, or spatial positioning communicate the intended relationship.
- The output is an image anchor that can be embedded into a normal Huawei content page.
- If embedded into a deck, the slide still passes hard QA and render export.

Record non-blocking visual concerns separately from hard failures.

## Suggested File Split

When implementing this subsystem, prefer this structure:

- `references/visual_diagram_rules.md`: progressive-loaded diagram guidance.
- `references/visual_diagram_test_cases.js`: prompt-guided test case matrix with generated variants.
- `scripts/hw_diagram_helpers.js`: diagram rendering primitives and intent/template dispatch.
- `scripts/verify_diagram_components.js`: validates selected test cases and writes SVG image anchors plus a manifest.

The main `scripts/hw_pptx_helpers.js` may import `hw_diagram_helpers.js`, but diagram-specific code should live separately so it can evolve without making the core helper file too large.

## Main Skill Integration Point

Main SKILL.md should instruct the AI:

- Load `references/visual_diagram_rules.md` only after `visual_strategy` requires self-drawing, simplified redrawing, or source-number charting.
- For diagram-heavy decks, run at least one relevant diagram test case before relying on a new or modified diagram helper.
- For ordinary decks that only use source visuals and standard tables/cards, do not load or use the diagram subsystem.

## Rough.js Image Contract

The selected implementation is Rough.js custom SVG. The diagram subsystem exports an image, not a PPT page:

```text
visual_anchor -> visual_spec -> deterministic layout -> Rough.js SVG image -> standard PPT content module embeds image
```

Deck-specific code is responsible for placing the SVG inside a normal Huawei content page, with analysis summary, section indicator, footer, source note, and other page-level rules. The diagram helper must not create or deliver a full PPT slide.

The helper accepts a canvas ratio because the downstream PPT layout tool owns final placement:

```js
createHandDrawnDiagramImage(spec, { aspectRatio: "16:9", width: 1600 })
writeHandDrawnDiagramImage(spec, ".tmp/diagram_component_smoke", { aspectRatio: "4:3", width: 1200 })
```

The high-level input contract is:

```json
{
  "visual_strategy": "self_draw",
  "intent": "Hierarchy",
  "template": "tree",
  "renderer": "rough_svg",
  "claim": "...",
  "visual_spec": {}
}
```

For every deck content slide, the `visual_anchor` must also record the source-visual decision before a generated diagram is used:

```json
{
  "slide": 4,
  "claim": "Archive preserves useful weak branches.",
  "source_visual_search": {
    "performed": true,
    "candidates": [],
    "decision": "no_relevant_source_visual"
  },
  "visual_strategy": "self_draw",
  "renderer": "rough_svg",
  "intent": "Hierarchy",
  "template": "tree",
  "visual_spec": {}
}
```

This makes "source visual first" a checkable contract instead of a prose preference.

## First Three Representative Test Cases

Choose three cases that stress different information relationships and visual styles.

### Case 1: Hand-Drawn Layered Architecture

Purpose: validate the desired Keynote/whiteboard sketch-note style from the user's reference image.

Expected intent: `Hierarchy` plus architecture/data-flow elements.

Scenario:

```text
Create one Huawei-style slide showing a hand-drawn layered AI agent architecture. The user enters from the top, calls three client surfaces, flows through an agent gateway, branches into tool orchestration and memory/retrieval, then reaches model/runtime services and observability on the side.
```

Visual spec seed:

```json
{
  "intent": "Hierarchy",
  "template": "layered_architecture",
  "claim": "Agent 系统的稳定性来自网关、工具编排、记忆检索、模型服务和观测链路的分层协同。",
  "layers": [
    {"id": "entry", "label": "用户", "items": ["用户"]},
    {"id": "clients", "label": "入口层", "items": ["Web", "App", "API"]},
    {"id": "gateway", "label": "接入层", "items": ["Agent Gateway"]},
    {"id": "orchestration", "label": "编排层", "items": ["工具编排", "记忆检索"]},
    {"id": "runtime", "label": "运行层", "items": ["模型服务", "任务队列"]}
  ],
  "side_modules": ["服务发现", "链路追踪", "权限审计"],
  "edges": [
    ["用户", "Web"], ["用户", "App"], ["用户", "API"],
    ["Web", "Agent Gateway"], ["App", "Agent Gateway"], ["API", "Agent Gateway"],
    ["Agent Gateway", "工具编排"], ["Agent Gateway", "记忆检索"],
    ["工具编排", "模型服务"], ["记忆检索", "模型服务"],
    ["模型服务", "任务队列"]
  ]
}
```

Human review focus:

- Does it feel like a real hand-drawn architecture sketch?
- Are layer relationships clear without becoming rigid business boxes?
- Are arrows and side modules readable?
- Does the diagram add visual soul beyond cards/text?

### Case 2: Archive Evolution Tree

Purpose: validate branching hierarchy and highlight path, inspired by the DGM example from the reference repo.

Expected intent: `Hierarchy`.

Scenario:

```text
Create one slide explaining why Archive is not cache but a search strategy. Show an agent evolution tree where low-scoring branches remain selectable and one branch eventually reaches 50%.
```

Visual spec seed:

```json
{
  "intent": "Hierarchy",
  "template": "tree",
  "claim": "Archive 通过保留分支，让暂时低分节点也可能成为未来高分节点的踏脚石。",
  "nodes": ["0", "6", "12", "24", "31", "44", "56", "79"],
  "edges": [["0", "6"], ["0", "12"], ["6", "24"], ["12", "31"], ["24", "44"], ["31", "56"], ["44", "79"]],
  "labels": {"0": "20%", "6": "26%", "12": "23%", "24": "31%", "31": "28%", "44": "38%", "56": "34%", "79": "50%"},
  "highlight": "79",
  "annotation": "所有节点保留非零选择概率，旧分支不会被过早丢弃。"
}
```

Human review focus:

- Is the branching lineage immediately understandable?
- Is the final high-score node visually emphasized?
- Does the visual avoid looking like a generic card list?
- Are scores readable and spatially attached to nodes?

### Case 3: Self-Improvement Loop

Purpose: validate feedback/cycle diagrams that explain agent iteration mechanisms.

Expected intent: `Loop`.

Scenario:

```text
Create one slide explaining an agent self-improvement loop: inspect failures, propose improvement, edit its own workflow/tools, evaluate on benchmark, archive successful variants, then select the next parent.
```

Visual spec seed:

```json
{
  "intent": "Loop",
  "template": "closed_loop",
  "claim": "自我改进不是单次 prompt 优化，而是可评测、可归档、可继续选择的闭环。",
  "steps": [
    {"id": "inspect", "label": "分析失败", "note": "读取日志与错误模式"},
    {"id": "propose", "label": "提出改进", "note": "生成工具或流程改动"},
    {"id": "edit", "label": "修改自身", "note": "改 workflow / tools / prompt"},
    {"id": "eval", "label": "基准评测", "note": "验证收益与回归"},
    {"id": "archive", "label": "归档选择", "note": "保留可继续演化版本"}
  ],
  "center": "Self-improving Agent",
  "highlight": "archive"
}
```

Human review focus:

- Does the loop read as a cycle rather than a linear list?
- Is the center concept clear?
- Are step labels short and legible?
- Does the style remain professional enough for a technical deck?

## Evaluation Plan For Representative Cases

For each case:

1. Run `npm run test:diagram` for the data contract and no-truncation checks.
2. Run `npm run diagram-smoke` to generate SVG anchors under `.tmp/diagram_component_smoke/`.
3. Review the SVG output at the requested aspect ratio.
4. When validating full PPT composition, embed the SVG into a standard content page and export that deck with `scripts/export_pptx_images.js`.
5. Record findings in `.tmp/diagram_tests/<case_id>_review.md`.
