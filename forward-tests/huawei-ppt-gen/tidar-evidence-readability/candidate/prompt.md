# Candidate Prompt: TiDAR Evidence Readability Forward Test

请根据以下材料生成完整 PPT：

```text
- PPT Content Brief: candidate/input/ppt_content_brief.md
- TiDAR 材料路径: candidate/input/pdf_xml/
- 补充图片路径: candidate/input/supplemental_images/
- 补充材料路径: candidate/input/supplemental_sources/
- 研究审计文件: candidate/input/research_audit.md
- 论文文本: candidate/input/tidar.txt
```

请自行读取并遵循仓库 `SKILL.md` 的完整流程。

Summary 页第三栏“落地边界”必须表达 brief 中的实际判断：TiDAR 不是 training-free 插件，落地前要评估 50B/150B 继续训练成本、single H100 batch=1 复现条件，以及 H100 kernel / KV cache / serving 改造约束。不要把它画成泛泛的企业部署流程或 AI 兜底说明；如果没有能支撑该判断的源图，优先用结构化手绘/决策门槛图，只有在它比手绘更能表达该判断时才使用文生图。

Write all generated artifacts under:

```text
.tmp/forward-tests/tidar-evidence-readability/<run-id>/
```

Use a clear, new, non-existing run id, for example `candidate-YYYYMMDD-HHMMSS`. Do not overwrite or reuse any prior run directory.

When finished, report the output directory, PPTX path, exported slide PNG directory, visual-review status, and caveats.
