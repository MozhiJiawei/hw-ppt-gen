# Huawei PPTX Generator

用于生成华为风格 PPTX 的 Codex skill 资源包。`SKILL.md` 描述面向使用者的生成流程；本 README 记录仓库结构、维护入口和开发态检查命令。

## 目录结构

- `scripts/pptx/`: PPTX 生成与导出辅助脚本。包含页面框架、视觉锚点/画图 helper、参考图审阅模板、PPT 导出图片工具和渲染工具 PATH 设置脚本。
- `scripts/qa/`: 交付前硬规则校验脚本。
- `scripts/smoke/`: 开发态冒烟测试、契约测试和样例 deck 生成脚本。这里的脚本不写入 `SKILL.md`，避免使用者把内部维护检查当成交付流程。
- `forward-tests/`: 面向 Skill 能力演进的前向验证夹具。用于让独立候选 agent 只基于输入 brief 和当前 Skill 生成 deck，再由主 agent 按 rubric 判题。
- `docs/`: 维护态文档和设计归档。`docs/architecture_design.md` 是维护者和 coding agent 的架构契约，`docs/brainstorms/` 保存阶段性探索产物。
- `references/`: 视觉规则、schema、测试用例和风格参考说明。
- `assets/`: 参考图片和可复用静态资源。
- `.tmp/`: 本地生成产物、QA 报告、导出图片和临时脚本。不要把交付过程中的生成产物写到其他目录。

## 常用命令

生成参考图审阅模板：

```bash
npm run reference-review-template
```

生成样例 deck：

```bash
npm run sample
```

校验样例 deck：

```bash
npm run check-sample
```

导出样例 deck 图片：

```bash
npm run export-sample
```

## 开发态冒烟测试

这些命令用于维护 skill 自身，不属于 `SKILL.md` 的用户交付流程。

```bash
npm run test:visual-anchor-contract
npm run test:diagram
npm run diagram-smoke
npm run test:powerpoint-com
npm run smoke
```

`test:powerpoint-com` 需要 Windows PowerPoint COM 可用；不可用时应视为环境限制，而不是跨平台基础测试失败。

## 前向测试

`forward-tests/` 下的测试用于验证阶段性 Skill 修改是否真的提升了端到端 PPT 生成能力。每次完成 `SKILL.md`、`references/`、PPT 生成 helper、QA 规则或 layout 相关能力的阶段性修改后，Codex 应在最终回复中建议人类触发相关 forward test。

当前可用夹具：

```text
forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/main-agent-prompt.md
```

运行时由人类把 `main-agent-prompt.md` 的内容交给主 agent。主 agent 负责派发独立候选 agent、隔离 judge-only 资料，并把判题结果写回对应 `.tmp/forward-tests/.../<run-id>/judgment.md`。
