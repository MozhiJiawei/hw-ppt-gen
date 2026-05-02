# Huawei PPTX Generator

用于生成华为风格 PPTX 的 Codex skill 资源包。`SKILL.md` 描述面向使用者的生成流程；本 README 记录仓库结构、维护入口和开发态检查命令。

## 目录结构

- `scripts/pptx/`: PPTX 生成与导出辅助脚本。包含页面框架、视觉锚点/画图 helper、参考图审阅模板、PPT 导出图片工具和渲染工具 PATH 设置脚本。
- `scripts/qa/`: 交付前硬规则校验脚本。
- `scripts/smoke/`: 开发态冒烟测试、契约测试和样例 deck 生成脚本。这里的脚本不写入 `SKILL.md`，避免使用者把内部维护检查当成交付流程。
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
