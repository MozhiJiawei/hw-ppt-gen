# Visual Diagram Spec Schema

Use this reference after `references/visual_diagram_rules.md` has selected `visual_strategy: "self_draw"` and renderer `rough_svg`.

The renderer is deterministic. It does not infer missing relationships from prose, so the diagram spec must contain explicit nodes, edges, labels, highlights, and annotations.

## Common Fields

```json
{
  "id": "stable_file_safe_id",
  "title": "Short diagram title",
  "intent": "Hierarchy",
  "template": "tree",
  "claim": "一句中文核心观点。",
  "scenario": "Optional user-like request for review context.",
  "visual_spec": {}
}
```

Required common fields:

- `id`: stable id used for filenames.
- `title`: short title rendered inside the diagram canvas.
- `intent`: one of `Quantity`, `Sequence`, `Loop`, `Hierarchy`, `Matrix`, `Network`.
- `template`: one supported Rough SVG template.
- `claim`: one concise Chinese sentence under the title.
- `visual_spec`: template-specific structure.

Keep generated visible text mostly Chinese. Technical acronyms such as `Agent Gateway`, `API`, `Archive`, `workflow`, and model names may stay in English when they are clearer.

## Template: layered_architecture

Use for layered systems, architecture stacks, side modules, and cross-layer flows.

```json
{
  "id": "layered_architecture",
  "title": "Hand-Drawn Layered AI Agent Architecture",
  "intent": "Hierarchy",
  "template": "layered_architecture",
  "claim": "Agent 系统的稳定性来自网关、工具编排、记忆检索、模型服务和观测链路的分层协同。",
  "visual_spec": {
    "layers": [
      { "id": "entry", "label": "用户", "items": ["用户"] },
      { "id": "clients", "label": "入口层", "items": ["Web", "App", "API"] },
      { "id": "gateway", "label": "接入层", "items": ["Agent Gateway"] },
      { "id": "orchestration", "label": "编排层", "items": ["工具编排", "记忆检索"] },
      { "id": "runtime", "label": "运行层", "items": ["模型服务", "任务队列"] }
    ],
    "side_modules": ["服务发现", "链路追踪", "权限审计"],
    "edges": [["用户", "Web"], ["Web", "Agent Gateway"]]
  }
}
```

Current implementation expects the canonical item names used in the smoke cases. When adding new architecture variants, extend the layout helper rather than forcing long labels into the existing coordinates.

## Template: grouped_bar_chart

Use for small benchmark comparisons, before/after comparisons, and category comparisons where numeric evidence is the main message.

```json
{
  "id": "benchmark_grouped_bars",
  "title": "Benchmark Improvement Bars",
  "intent": "Quantity",
  "template": "grouped_bar_chart",
  "claim": "DGM agent 在不同基座模型上都显著高于 Base agent，收益不是单模型偶然现象。",
  "visual_spec": {
    "y_label": "SWE-bench (%)",
    "categories": ["o3-mini", "Claude 3.5", "Claude 3.7"],
    "series": [
      { "name": "Base agent", "values": [23.0, 20.0, 19.0], "color": "gray" },
      { "name": "DGM agent", "values": [33.0, 50.0, 59.5], "color": "red" }
    ],
    "highlight": { "category": "Claude 3.7", "series": "DGM agent" },
    "annotation": "跨模型迁移仍保留收益，说明改进落在工作流层。"
  }
}
```

Rules:

- Use 1 to 6 categories and 1 to 3 series.
- All series must have the same number of values as categories.
- Use `highlight` for the most important bar, not for every improved value.
- For dense or exact business charts, prefer native PPT charts or source charts; use this template when a small numeric comparison also needs hand-drawn visual character.

## Template: tree

Use for archive/search/evolution trees with highlighted terminal nodes.

```json
{
  "id": "archive_evolution_tree",
  "title": "Archive Evolution Tree",
  "intent": "Hierarchy",
  "template": "tree",
  "claim": "Archive 通过保留分支，让暂时低分节点也可能成为未来高分节点的踏脚石。",
  "visual_spec": {
    "nodes": ["0", "6", "12", "24", "31", "44", "56", "79"],
    "edges": [["0", "6"], ["0", "12"], ["6", "24"], ["24", "44"], ["44", "79"]],
    "labels": { "0": "20%", "6": "26%", "12": "23%", "24": "31%", "44": "38%", "79": "50%" },
    "highlight": "79",
    "annotation": "所有节点保留非零选择概率，旧分支不会被过早丢弃。"
  }
}
```

Rules:

- Every node must have a label.
- `highlight` must be one of the nodes.
- Edges should form a readable shallow tree. Avoid more than 8 nodes until the layout engine is expanded.
- Use short labels. Put explanation in `annotation`, not inside nodes.

## Template: closed_loop

Use for feedback cycles, self-improvement loops, operating flywheels, and iterative workflows.

```json
{
  "id": "self_improvement_loop",
  "title": "Self-Improvement Loop",
  "intent": "Loop",
  "template": "closed_loop",
  "claim": "自我改进不是单次 prompt 优化，而是可评测、可归档、可继续选择的闭环。",
  "visual_spec": {
    "steps": [
      { "id": "inspect", "label": "分析失败", "note": "读取日志与错误模式" },
      { "id": "propose", "label": "提出改进", "note": "生成工具或流程改动" },
      { "id": "edit", "label": "修改自身", "note": "改 workflow / tools / prompt" },
      { "id": "eval", "label": "基准评测", "note": "验证收益与回归" },
      { "id": "archive", "label": "归档选择", "note": "保留可继续演化版本" }
    ],
    "center": "Self-improving Agent",
    "highlight": "archive"
  }
}
```

Rules:

- Use 3 to 5 steps; 5 is the current sweet spot.
- Step labels should be 2 to 6 Chinese characters when possible.
- Step notes should be short. Long prose belongs in nearby interpretation text, not inside the loop.
- `highlight` should be a step id, usually the step that closes the mechanism.

## Template: horizontal_sequence

Use for ordered workflows, pipelines, delivery phases, and quality gates.

```json
{
  "id": "agent_workflow_sequence",
  "title": "Agent Workflow Sequence",
  "intent": "Sequence",
  "template": "horizontal_sequence",
  "claim": "稳定的 Agent 交付链路来自可观察、可评审、可回滚的阶段化流程。",
  "visual_spec": {
    "steps": [
      { "id": "request", "label": "需求输入", "note": "澄清目标与约束" },
      { "id": "plan", "label": "任务规划", "note": "拆分步骤与证据" },
      { "id": "execute", "label": "工具执行", "note": "生成代码或文档" },
      { "id": "review", "label": "规则校验", "note": "导出与视觉检查" },
      { "id": "deliver", "label": "交付归档", "note": "保留产物与结论" }
    ],
    "highlight": "review"
  }
}
```

Rules:

- Use 2 to 6 steps.
- Keep each `label` short; put one compact detail in `note`.
- Use `highlight` for the quality gate, decision point, or bottleneck.

## Template: quadrant_matrix

Use for two-axis positioning, strategy choices, risk/priority maps, and trade-off comparisons.

```json
{
  "id": "strategy_choice_matrix",
  "title": "Strategy Choice Matrix",
  "intent": "Matrix",
  "template": "quadrant_matrix",
  "claim": "渲染路径选择取决于手绘表现力与工程可控性的平衡。",
  "visual_spec": {
    "x_axis": { "left": "低可控", "right": "高可控", "label": "工程可控性" },
    "y_axis": { "bottom": "弱手绘", "top": "强手绘", "label": "视觉灵魂" },
    "items": [
      { "label": "原图", "x": 0.34, "y": 0.84, "note": "证据最强" },
      { "label": "Rough SVG", "x": 0.76, "y": 0.78, "note": "自绘主路径" },
      { "label": "文本卡片", "x": 0.42, "y": 0.30, "note": "仅作辅助" }
    ],
    "highlight": "Rough.js"
  }
}
```

Rules:

- `x` and `y` are normalized numbers from `0` to `1`.
- Use 2 to 8 items.
- Keep quadrant labels short. The matrix should communicate position, not prose.

## Template: hub_spoke_network

Use only when the relationship is genuinely many-to-many or collaborative. Prefer hierarchy or sequence if those simpler intents fit.

```json
{
  "id": "agent_tool_network",
  "title": "Agent Tool Network",
  "intent": "Network",
  "template": "hub_spoke_network",
  "claim": "Agent 能力不是单点工具，而是模型、记忆、代码、浏览器和评审环节的协同网络。",
  "visual_spec": {
    "hub": { "id": "agent", "label": "Agent" },
    "nodes": [
      { "id": "model", "label": "模型推理", "note": "生成与判断" },
      { "id": "memory", "label": "记忆检索", "note": "上下文复用" }
    ],
    "edges": [["agent", "model"], ["agent", "memory"], ["memory", "model"]],
    "highlight": "memory"
  }
}
```

Rules:

- Use 2 to 7 outer nodes.
- Keep cross-links sparse. More than two non-hub links usually becomes messy.
- The hub should remain the dominant visual anchor.

## Validation

Run:

```powershell
node scripts\verify_diagram_components.js
```

Then export and inspect:

```powershell
node scripts\export_pptx_images.js .tmp\diagram_component_smoke\diagram_component_smoke.pptx --out .tmp\diagram_component_smoke\exported_png --renderer auto
```

The smoke script validates required fields before rendering and writes generated SVGs, a PPTX deck, and a manifest under `.tmp/diagram_component_smoke`.
