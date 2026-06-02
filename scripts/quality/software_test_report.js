"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "software_test_report");
const LOG_DIR = path.join(OUT_DIR, "logs");
const PPTX_PAGE_DIR = path.join(OUT_DIR, "pptx_pages");
const HTML_OUT = path.join(OUT_DIR, "index.html");

const TEST_CASES = [
  {
    id: "brief-contract",
    category: "输入契约",
    title: "PPT Content Brief 可以稳定解析成页面计划。",
    command: ["node", ["scripts/smoke/test_ppt_content_brief_consumption.js"]],
    script: "scripts/smoke/test_ppt_content_brief_consumption.js",
    checks: [
      "有效 brief 的 Deck Metadata、Summary Page、Page Content 会映射到 slideContract 和 planContract。",
      "一页总结模式不强制目录和正文页。",
      "Markdown 图片链接和纯文本绝对路径都可以作为 source locator。",
      "无效 brief 会拦截章节不匹配、总结缺正文支撑、内部布局 token 泄露。",
      "SKILL、brief reference、package smoke 入口必须同步记录该契约。",
    ],
    artifacts: [
      artifact("有效 brief fixture", "scripts/smoke/fixtures/ppt_content_brief_valid.md"),
      artifact("无效 brief fixture", "scripts/smoke/fixtures/ppt_content_brief_invalid.md"),
    ],
  },
  {
    id: "ppt-skeleton-rendering",
    category: "内容页契约",
    title: "PPT 骨架渲染固定走 addVisualAnchorContentSlide 且正文区域留白。",
    command: ["node", ["scripts/smoke/test_ppt_skeleton_rendering.js"]],
    script: "scripts/smoke/test_ppt_skeleton_rendering.js",
    checks: [
      "deck 级骨架 helper 渲染每个总结/正文页面时必须调用 addVisualAnchorContentSlide。",
      "forward-test 真实 brief 可以先转成 skeleton plan，再渲染封面、目录、总结页和正文页骨架。",
      "plan fixture 可以直接渲染骨架 PPT。",
      "标题、标题说明、章节 tag、分析总结必须进入 PPT 文本层。",
      "分析总结以下的正文内容、参考图片说明和 source image 路径必须保持不渲染，留给动态渲染引擎。",
    ],
    artifacts: [
      artifact("Aegaeon forward-test brief", "forward-tests/huawei-ppt-gen/aegaeon-content-aware-layout/candidate/input/ppt_content_brief.md"),
      artifact("PPT skeleton plan fixture", "scripts/smoke/fixtures/ppt_skeleton_plan.json"),
      artifact("brief 转换出的 skeleton plan", ".tmp/ppt_skeleton_smoke/brief_skeleton_plan.json"),
      pptArtifact("brief-backed skeleton PPTX", ".tmp/ppt_skeleton_smoke/brief_skeleton.pptx", ".tmp/software_test_report/pptx/ppt_skeleton_from_brief"),
      pptArtifact("plan-backed skeleton PPTX", ".tmp/ppt_skeleton_smoke/plan_skeleton.pptx", ".tmp/software_test_report/pptx/ppt_skeleton_from_plan"),
    ],
  },
  {
    id: "diagram-helper-contract",
    category: "视觉模板",
    title: "所有视觉模板遵守 schema、renderer 和文本容量规则。",
    command: ["node", ["scripts/smoke/test_diagram_helpers.js"]],
    script: "scripts/smoke/test_diagram_helpers.js",
    checks: [
      "rough SVG 输出必须裁剪到内容区域、保持透明背景、长文本自动换行。",
      "tree、layered architecture、network、matrix 等模板必须由输入数据驱动，不能保留陈旧示例文本。",
      "过密或非法输入要明确失败，不能静默截断关系、节点或标签。",
      "所有基础 kind/template 至少有一个可渲染样例，renderer 由运行时固定映射决定。",
      "visual_spec 中的 caption、note、callout、业务判断等解释性字段必须被拒绝。",
    ],
    artifacts: [
      artifact("生成样例矩阵 fixture", "scripts/smoke/fixtures/visual_diagram_test_cases.js"),
    ],
  },
  {
    id: "diagram-component-smoke",
    category: "Body DSL",
    title: "所有 draw 能力都能通过 Body DSL 编译、测量并生成 review deck。",
    command: ["node", ["scripts/smoke/dsl/test_dsl_draw_matrix.js"]],
    script: "scripts/smoke/dsl/test_dsl_draw_matrix.js",
    checks: [
      "从 visual_diagram_test_cases.js 读取所有官方 draw fixture，并用 <Visual draw=\"kind/template\" model={...} /> 编译。",
      "224 个 source case × 3 档版面预算都进入 DSL 编译和 renderer preflight，并生成全量人工审阅 PPTX。",
      "编译报告记录 JSX-like Body DSL markup、render model 和反馈问题。",
      "测量报告只对每个 draw×tier 的哨兵页做一次整 deck COM 读回，避免批量逐项 COM。",
      "全量 review PPTX 和哨兵测量 review PPTX 都作为软件测试交付件进入报告，并通过 PowerPoint COM 导出成图片。",
    ],
    artifacts: [
      artifact("DSL draw 编译报告", ".tmp/dsl_draw_matrix/dsl_draw_compile_report.json"),
      pptArtifact("DSL draw 全量人工审阅 PPTX", ".tmp/dsl_draw_matrix/dsl_draw_matrix_full_review.pptx", ".tmp/software_test_report/pptx/dsl_draw_matrix_full_review"),
      artifact("DSL draw 测量报告", ".tmp/dsl_draw_matrix/dsl_draw_measurement_report.json"),
      artifact("DSL draw manifest", ".tmp/dsl_draw_matrix/dsl_draw_matrix_manifest.json"),
      pptArtifact("DSL draw 哨兵测量 review PPTX", ".tmp/dsl_draw_matrix/dsl_draw_matrix.pptx", ".tmp/software_test_report/pptx/dsl_draw_matrix"),
    ],
  },
  {
    id: "layout-taxonomy",
    category: "布局测量",
    title: "正文 block 可以被分类为可测量的布局 primitive。",
    command: ["node", ["scripts/smoke/layout/test_content_body_taxonomy.js"]],
    script: "scripts/smoke/layout/test_content_body_taxonomy.js",
    checks: [
      "Evidence/source_figure 被识别为真实视觉锚点并走 measured 支持。",
      "Quantity/data_cards、Matrix/table、Matrix/heatmap 被识别为 supporting component。",
      "Sequence/process 被识别为真实视觉锚点。",
      "text block 被识别为 StructuredText，不计入视觉锚点。",
      "未知 kind/template 不能 fallback 成可测量模板，也不能计入真实锚点。",
    ],
    artifacts: [],
  },
  {
    id: "layout-taxonomy-coverage",
    category: "布局测量",
    title: "官方 kind/template 全部纳入 taxonomy 和测量白名单。",
    command: ["node", ["scripts/smoke/layout/test_taxonomy_coverage_contract.js"]],
    script: "scripts/smoke/layout/test_taxonomy_coverage_contract.js",
    checks: [
      "contracts/visual_templates.js 中的官方模板都必须有 taxonomy 覆盖。",
      "每个官方 body primitive 都必须声明 measured 支持。",
      "supporting component 和真实 anchor 的 eligibility 必须匹配架构边界。",
      "抽样 measured fixture 必须给出正的 min/preferred/max 高度。",
    ],
    artifacts: [
      artifact("taxonomy 覆盖报告", ".tmp/layout_taxonomy_coverage_report.json"),
    ],
  },
  {
    id: "primitive-measurement",
    category: "布局测量",
    title: "Evidence、KPI 和正文 primitive 能产出可用尺寸。",
    command: ["node", ["scripts/smoke/layout/test_primitive_measurement.js"]],
    script: "scripts/smoke/layout/test_primitive_measurement.js",
    checks: [
      "Evidence 测量必须来自 PowerPoint COM，且保留源图比例策略。",
      "KPI card row 必须报告高度和宽度下限。",
      "过窄 KPI 区域必须给出 layout_kpi_row_width_too_small 诊断。",
      "正文 rich bullet block 必须有 text bounds 和 min/preferred 尺寸。",
    ],
    artifacts: [
      artifact("测量源图", ".tmp/layout_measurement_smoke/wide_source.svg"),
    ],
  },
  {
    id: "all-official-primitive-measurement",
    category: "布局测量",
    title: "所有官方 primitive 都能测出 min/preferred/max 尺寸。",
    command: ["node", ["scripts/smoke/layout/test_all_official_primitive_measurement.js"]],
    script: "scripts/smoke/layout/test_all_official_primitive_measurement.js",
    checks: [
      "Evidence、Quantity、Sequence、Loop、Hierarchy、Matrix、Network 的官方模板全部有测量 fixture。",
      "每个模板的 min width/height 必须为正。",
      "preferred 必须不小于 min，max useful 必须不小于 preferred。",
      "测量过程不能输出 error 级诊断。",
    ],
    artifacts: [
      artifact("官方 primitive 测量报告", ".tmp/layout_all_official_primitive_measurement.json"),
    ],
  },
  {
    id: "module-stack-layout",
    category: "布局测量",
    title: "模块内 Evidence、KPI、正文可以垂直排布并识别不可行布局。",
    command: ["node", ["scripts/smoke/layout/test_module_stack_layout.js"]],
    script: "scripts/smoke/layout/test_module_stack_layout.js",
    checks: [
      "正常高度下 evidence、cards、text 三块按顺序排布且不使用 legacy fallback。",
      "高度不足时返回 infeasible 并记录 layout_stack_infeasible。",
      "宽度不足时透传 KPI 宽度不足诊断。",
    ],
    artifacts: [
      artifact("stack layout 源图", ".tmp/layout_stack_smoke/source.svg"),
    ],
  },
  {
    id: "layout-diagnostics",
    category: "布局测量",
    title: "布局诊断能区分信息提示和硬错误。",
    command: ["node", ["scripts/smoke/layout/test_layout_diagnostics.js"]],
    script: "scripts/smoke/layout/test_layout_diagnostics.js",
    checks: [
      "info 级 shrink/gap shrink 诊断不算 hard diagnostics。",
      "error 级 layout_manager_fallback 会被识别为 hard diagnostics。",
    ],
    artifacts: [],
  },
  {
    id: "body-dsl-registry",
    category: "Body DSL",
    title: "Body DSL 组件注册表定义 AI 可发现组件和约束边界。",
    command: ["node", ["scripts/smoke/dsl/test_component_registry.js"]],
    script: "scripts/smoke/dsl/test_component_registry.js",
    checks: [
      "EvidenceFigure 可发现为真实锚点、measured、preserve-aspect，且 fit=stretch 被拒绝。",
      "KPI cards、Table、CapabilityStack 是 supporting component，不计入真实锚点。",
      "internal 组件 registry-valid 但不进入 AI-visible index。",
      "AI-visible 组件必须带 use/avoid、预算和修复提示、示例。",
    ],
    artifacts: [],
  },
  {
    id: "body-dsl-discovery",
    category: "Body DSL",
    title: "Body DSL discovery helper 可以生成组件索引、详情和 catalog。",
    command: ["node", ["scripts/smoke/dsl/test_component_discovery_catalog.js"]],
    script: "scripts/smoke/dsl/test_component_discovery_catalog.js",
    checks: [
      "组件 index 只列 AI-visible 组件。",
      "组件 detail 包含 schema、示例、预算提示、替代和修复建议。",
      "Visual escape hatch detail 暴露官方 draw ids。",
      "internal 组件无法通过 AI detail 查询。",
    ],
    artifacts: [
      artifact("Body DSL authoring schema", "references/slide_dsl_authoring_schema.md"),
    ],
  },
  {
    id: "body-dsl-generated-catalog",
    category: "Body DSL",
    title: "Body DSL 组件 catalog 从 registry 生成并保持同步。",
    command: ["node", ["scripts/smoke/dsl/test_generated_component_catalog.js"]],
    script: "scripts/smoke/dsl/test_generated_component_catalog.js",
    checks: [
      "generated_dsl_component_catalog.md 由 registry 生成。",
      "catalog 包含 EvidenceFigure 和 Visual escape hatch。",
      "catalog 列出官方 Visual draw ids。",
      "catalog 不泄露 internal 组件。",
    ],
    artifacts: [
      artifact("生成的 Body DSL 组件目录", "references/generated_dsl_component_catalog.md"),
    ],
  },
  {
    id: "body-dsl-skill-discovery",
    category: "Body DSL",
    title: "SKILL 只暴露稳定 discovery 入口，不手写组件清单。",
    command: ["node", ["scripts/smoke/dsl/test_skill_dsl_discovery_contract.js"]],
    script: "scripts/smoke/dsl/test_skill_dsl_discovery_contract.js",
    checks: [
      "SKILL 指向 slide_dsl_authoring_schema 和 generated component catalog。",
      "SKILL 要求运行 list_components 和 describe_component 获取组件合同。",
      "SKILL 默认要求写 bodyDsl，并且不存在旧正文 JSON 入口。",
      "AI-visible 组件 tag 不在 SKILL 中手工列举，新增组件只需更新 registry 和生成目录。",
    ],
    artifacts: [
      artifact("Runtime skill instructions", "SKILL.md"),
      artifact("Body DSL authoring schema", "references/slide_dsl_authoring_schema.md"),
      artifact("生成的 Body DSL 组件目录", "references/generated_dsl_component_catalog.md"),
    ],
  },
  {
    id: "body-dsl-feedback",
    category: "Body DSL",
    title: "Body DSL 解析和约束错误会生成 FeedbackIssue。",
    command: ["node", ["scripts/smoke/dsl/test_dsl_feedback_contract.js"]],
    script: "scripts/smoke/dsl/test_dsl_feedback_contract.js",
    checks: [
      "未知组件 tag 会产生 source-mapped compile FeedbackIssue。",
      "supporting-only 页面在 DSL tree 校验阶段失败，并提示 supporting component 不能满足真实锚点。",
      "style 等非注册布局属性会在测量前被拒绝。",
      "Feedback markdown 可以给人类可读的 phase/path/message。",
    ],
    artifacts: [],
  },
  {
    id: "runtime-qa-pipeline",
    category: "运行态 QA",
    title: "运行态 QA 按 DSL、测量、排版、最终产物分层输出可追踪诊断。",
    command: ["node", ["scripts/smoke/qa/run_runtime_qa_smoke.js"]],
    script: "scripts/smoke/qa/run_runtime_qa_smoke.js",
    checks: [
      "DSL parser 产出 selector、source span 和 code frame。",
      "compile IR 暴露可序列化 render model、visible primitives 和 DSL target。",
      "DSL input runtime checks 只覆盖 body 缺失、不可编译、真实锚点缺失和证据链缺口。",
      "measurement/layout runtime checks 使用构造 IR 覆盖每个已确认 QA code。",
      "render/export fallback 只报告 artifact/slide/deck target，不要求 DSL 映射。",
      "page runner 保证单页失败不会阻塞其他页的诊断报告。",
      "retired QA entrypoint 和旧 smoke 名称不会重新进入 scripts。",
    ],
    artifacts: [
      artifact("Runtime QA JSON 诊断报告", ".tmp/runtime_qa_pipeline/runtime_qa_report.json"),
      artifact("Runtime QA Markdown 诊断报告", ".tmp/runtime_qa_pipeline/runtime_qa_report.md"),
      artifact("Runtime QA DSL case matrix", ".tmp/runtime_qa_pipeline/dsl_runtime_case_matrix.md"),
      artifact("Runtime QA DSL IR", ".tmp/runtime_qa_pipeline/page_04.dsl-ir.json"),
      artifact("Runtime QA compile IR", ".tmp/runtime_qa_pipeline/page_04.compile-ir.json"),
      artifact("Runtime QA measurement IR", ".tmp/runtime_qa_pipeline/page_04.measurement-ir.json"),
      artifact("Runtime QA layout IR", ".tmp/runtime_qa_pipeline/page_05.layout-ir.json"),
      artifact("Runtime QA plan", "docs/plans/2026-06-02-001-refactor-runtime-qa-pipeline-plan.md"),
    ],
  },
  {
    id: "body-dsl-bad-case-feedback-matrix",
    category: "Body DSL",
    title: "典型错误 DSL 会产生可追踪、可修复的编译器式反馈。",
    command: ["node", ["scripts/smoke/dsl/test_dsl_bad_case_feedback_matrix.js"]],
    script: "scripts/smoke/dsl/test_dsl_bad_case_feedback_matrix.js",
    checks: [
      "至少 50 个错误 DSL case 覆盖未知组件、非法 style/坐标、必填字段缺失、枚举错误、数量限制、树结构错误、supporting-only 和 bad draw。",
      "每个失败 case 都必须生成 code、message、phase、selector/path、Semantic Stack 和 repair hints。",
      "supporting-only 错误必须列出 found components，说明 Table/KpiCards/InsightText 不能满足真实视觉锚点要求。",
      "错误报告同时输出 JSON 和 Markdown，供 agent 和人工审阅使用。",
    ],
    artifacts: [
      artifact("错误 DSL case 汇总", ".tmp/dsl_bad_case_feedback_matrix/summary.json"),
      artifact("supporting-only 示例反馈", ".tmp/dsl_bad_case_feedback_matrix/supporting-only-table.md"),
      artifact("Visual evidence draw 示例反馈", ".tmp/dsl_bad_case_feedback_matrix/visual-evidence-draw.md"),
      artifact("三列模块数错误示例反馈", ".tmp/dsl_bad_case_feedback_matrix/three-column-two-modules.md"),
    ],
  },
  {
    id: "body-dsl-component-matrix",
    category: "Body DSL",
    title: "每个 AI-visible DSL 原子组件都有 Agent 暴露面、fixture、编译、渲染和测量证据。",
    command: ["node", ["scripts/smoke/dsl/test_dsl_component_matrix.js"]],
    script: "scripts/smoke/dsl/test_dsl_component_matrix.js",
    checks: [
      "AI-visible component registry 与 fixture 矩阵一一对应。",
      "每个组件的 describe output 包含说明、use/avoid、预算提示、修复提示和示例。",
      "每个 fixture 都能通过 Body DSL compile/typecheck。",
      "每个可渲染原子组件都进入 review PPT、manifest 和 source-mapped block measurement。",
      "测量报告包含 min_size、preferred_size、max_useful_size、final_size、taxonomy 和 renderer 路径证据。",
    ],
    artifacts: [
      artifact("DSL component matrix fixtures", "scripts/smoke/dsl/fixtures/dsl_component_matrix_fixtures.js"),
      artifact("Agent exposure report", ".tmp/dsl_component_matrix/dsl_component_agent_exposure.json"),
      artifact("Compile report", ".tmp/dsl_component_matrix/dsl_component_compile_report.json"),
      artifact("Measurement report", ".tmp/dsl_component_matrix/dsl_component_measurement_report.json"),
      artifact("Render manifest", ".tmp/dsl_component_matrix/dsl_component_matrix_manifest.json"),
      pptArtifact("DSL component matrix PPTX", ".tmp/dsl_component_matrix/dsl_component_matrix.pptx", ".tmp/software_test_report/pptx/dsl_component_matrix"),
    ],
  },
  {
    id: "tidar-three-column-layout",
    category: "布局测量",
    title: "TiDAR 三分栏真实 fixture 可以容纳 evidence、KPI 和 bullets。",
    command: ["node", ["scripts/smoke/layout/test_tidar_three_column_primitives.js"]],
    script: "scripts/smoke/layout/test_tidar_three_column_primitives.js",
    checks: [
      "每个 TiDAR 三分栏模块都能排下 evidence、KPI、bullet 三块。",
      "三块内容保持垂直顺序，不使用 legacy fallback。",
      "Evidence 不低于可读高度下限。",
      "故意超载的模块会返回 infeasible。",
    ],
    artifacts: [
      artifact("TiDAR 三分栏 fixture", "scripts/smoke/layout/fixtures/tidar_three_column_primitives.js"),
    ],
  },
  {
    id: "powerpoint-measurement-guard",
    category: "PowerPoint 集成",
    title: "PowerPoint COM 可以读回所有测量组件的真实边界。",
    command: ["node", ["scripts/smoke/layout/test_powerpoint_measurement_harness.js"]],
    script: "scripts/smoke/layout/test_powerpoint_measurement_harness.js",
    checks: [
      "PowerPoint COM broker 必须可用。",
      "每个 measured taxonomy 组件都会进入一页真实 PPTX。",
      "measure_pptx_layout.js 必须生成 COM measurement manifest。",
      "每个组件都必须有非零可测量 shape bounds。",
      "生成 review PPTX，用绿色框展示 COM 读回的真实边界。",
    ],
    artifacts: [
      artifact("COM measurement manifest", ".tmp/com_measurement_quality_guard/com_measurement_quality_guard.json"),
      artifact("COM measurement report", ".tmp/com_measurement_quality_guard/com_measurement_quality_guard_report.json"),
      pptArtifact("COM measurement source PPTX", ".tmp/com_measurement_quality_guard/com_measurement_quality_guard_source.pptx", ".tmp/software_test_report/pptx/com_measurement_source"),
      pptArtifact("COM measurement review PPTX", ".tmp/com_measurement_quality_guard/com_measurement_quality_guard_review.pptx", ".tmp/software_test_report/pptx/com_measurement_review"),
    ],
  },
  {
    id: "powerpoint-com-export",
    category: "PowerPoint 集成",
    title: "公开 PPT 生成接口产物可以被 PowerPoint COM 打开并逐页导出。",
    command: ["node", ["scripts/smoke/test_powerpoint_com_export.js"]],
    script: "scripts/smoke/test_powerpoint_com_export.js",
    checks: [
      "覆盖页面基础 helper、直接 renderer、Evidence 和官方视觉模板。",
      "生成的 PPTX 经过 PowerPoint 兼容性修复后不能包含 negative extents。",
      "PowerPoint COM 必须能导出所有页面 PNG。",
      "image-based manifest entry 必须保留 image area、visual slot、图像尺寸和等比关系。",
    ],
    artifacts: [
      artifact("视觉锚点 manifest", ".tmp/powerpoint_com_interface_test_visual_anchor_manifest.json"),
      pptArtifact("PowerPoint COM interface PPTX", ".tmp/powerpoint_com_interface_test.pptx", ".tmp/powerpoint_com_interface_test_slides"),
    ],
  },
];

function artifact(label, relativePath) {
  return { type: "file", label, relativePath };
}

function pptArtifact(label, relativePath, exportDir) {
  return { type: "pptx", label, relativePath, exportDir };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rel(fileName) {
  return path.relative(ROOT, fileName).replace(/\\/g, "/");
}

function abs(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function run(command, args, logName) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300000,
  });
  const output = [
    `$ ${command} ${args.join(" ")}`,
    "",
    "## STDOUT",
    result.stdout || "",
    "## STDERR",
    result.stderr || "",
    result.error ? `## ERROR\n${result.error.stack || result.error.message}` : "",
  ].join("\n");
  const logPath = path.join(LOG_DIR, `${logName}.txt`);
  fs.writeFileSync(logPath, output, "utf8");
  return {
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status,
    durationMs: Date.now() - started,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error.message || result.error) : "",
    logPath,
  };
}

function exportPptxArtifacts(testCase) {
  for (const item of testCase.artifacts.filter((entry) => entry.type === "pptx")) {
    const input = abs(item.relativePath);
    const outDir = abs(item.exportDir);
    if (!fs.existsSync(input)) {
      item.exportStatus = "missing";
      item.exportMessage = "PPTX 文件不存在，无法导出图片。";
      continue;
    }
    const result = run("node", [
      "scripts/pptx/export_pptx_images.js",
      item.relativePath,
      "--out",
      item.exportDir,
      "--renderer",
      "powerpoint",
    ], `${testCase.id}-${path.basename(item.exportDir)}-export`);
    item.exportStatus = result.status;
    item.exportLog = rel(result.logPath);
    item.exportMessage = result.status === "passed" ? "PowerPoint COM 导出成功。" : "PowerPoint COM 导出失败。";
    item.images = [];
    const manifestPath = path.join(outDir, "render_manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        item.renderManifest = rel(manifestPath);
        item.images = (manifest.slides || [])
          .map((slidePath) => path.resolve(slidePath))
          .filter((slidePath) => fs.existsSync(slidePath))
          .map((slidePath) => rel(slidePath));
      } catch (error) {
        item.exportMessage = `导出 manifest 解析失败：${error.message}`;
      }
    } else if (fs.existsSync(outDir)) {
      item.images = fs.readdirSync(outDir)
        .filter((name) => /^slide_\d+\.png$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((name) => rel(path.join(outDir, name)));
    }
  }
}

function statusLabel(status) {
  return { passed: "通过", failed: "失败", missing: "缺失" }[status] || status;
}

function fileStatus(relativePath) {
  return fs.existsSync(abs(relativePath)) ? "passed" : "missing";
}

function summarizeOutput(result) {
  const text = `${result.stdout}\n${result.stderr}`.trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(-8).join("\n") || "无输出。";
}

function enhanceArtifacts(artifacts) {
  return artifacts.map((item) => ({
    ...item,
    status: item.type === "pptx" ? (item.exportStatus || fileStatus(item.relativePath)) : fileStatus(item.relativePath),
    exists: fs.existsSync(abs(item.relativePath)),
  }));
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkHref(relativePath) {
  return path.relative(OUT_DIR, abs(relativePath)).replace(/\\/g, "/");
}

function renderArtifact(item) {
  const href = linkHref(item.relativePath);
  const status = item.status || fileStatus(item.relativePath);
  let html = `<div class="artifact-card">
    <div class="row"><span class="pill status-${status}">${statusLabel(status)}</span><strong>${htmlEscape(item.label)}</strong></div>
    <p><a href="${htmlEscape(href)}">${htmlEscape(item.relativePath)}</a></p>`;
  if (item.type === "pptx") {
    html += `<p class="muted">${htmlEscape(item.exportMessage || "PPTX 产物会通过 PowerPoint COM 导出为图片。")}</p>`;
    if (item.exportLog) html += `<p><a href="${htmlEscape(linkHref(item.exportLog))}">查看 COM 导出日志</a></p>`;
    if (item.renderManifest) html += `<p><a href="${htmlEscape(linkHref(item.renderManifest))}">查看 render_manifest.json</a></p>`;
    if (item.images && item.images.length) {
      if (item.galleryIndex) {
        html += `<p><a href="${htmlEscape(linkHref(item.galleryIndex))}">打开 ${item.images.length} 页逐页大图审阅</a></p>`;
      }
      const previewPages = item.slidePages?.slice(0, Math.min(4, item.slidePages.length)) || [];
      if (previewPages.length) {
        html += `<div class="slide-grid compact">`;
        previewPages.forEach((page) => {
          html += `<figure><a href="${htmlEscape(linkHref(page.page))}"><img src="${htmlEscape(linkHref(page.image))}" alt="${htmlEscape(item.label)} 第 ${page.number} 页"></a><figcaption>第 ${page.number} 页</figcaption></figure>`;
        });
        html += `</div>`;
      }
    }
  }
  html += `</div>`;
  return html;
}

function renderReport(results) {
  const passed = results.filter((item) => item.result.status === "passed").length;
  const failed = results.length - passed;
  const artifactCount = results.reduce((sum, item) => sum + item.artifacts.length, 0);
  const pptImageCount = results.reduce((sum, item) => sum + item.artifacts.reduce((inner, artifactItem) => inner + ((artifactItem.images || []).length), 0), 0);
  const categories = [...new Set(results.map((item) => item.category))];
  const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>hw-ppt-gen 软件测试报告</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --panel: #ffffff;
      --ink: #17212b;
      --muted: #66717e;
      --line: #d9e0e8;
      --soft: #eef2f6;
      --red: #c00000;
      --green: #147a45;
      --fail: #b42318;
      --missing: #8a5a00;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Microsoft YaHei", Arial, sans-serif; line-height: 1.55; }
    main { max-width: 1280px; margin: 0 auto; padding: 28px 22px 56px; }
    header, section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 22px; }
    section { margin-top: 18px; }
    h1, h2, h3 { margin: 0 0 10px; letter-spacing: 0; }
    h1 { font-size: 30px; }
    h2 { color: var(--red); font-size: 22px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
    h3 { font-size: 18px; }
    p { margin: 7px 0; }
    a, code { overflow-wrap: anywhere; word-break: break-word; }
    a { color: #8b1e13; text-decoration: none; border-bottom: 1px dashed currentColor; }
    .muted { color: var(--muted); }
    .kpis, .row, .meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .kpis { margin-top: 14px; }
    .kpis span, .tag, .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      min-width: max-content;
      border-radius: 999px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      background: var(--soft);
      font-weight: 700;
      font-size: 13px;
      line-height: 1.2;
    }
    .pill.status-passed { color: var(--green); border-color: rgba(20,122,69,.35); background: #eaf7ef; }
    .pill.status-failed { color: var(--fail); border-color: rgba(180,35,24,.35); background: #fdeceb; }
    .pill.status-missing { color: var(--missing); border-color: rgba(138,90,0,.35); background: #fff5d6; }
    .case { border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-top: 14px; background: #fbfcfd; }
    .case.failed { border-left: 5px solid var(--fail); }
    .case.passed { border-left: 5px solid var(--green); }
    .case-grid { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(360px, 1.2fr); gap: 18px; }
    .case-grid > div { min-width: 0; }
    .artifact-card { border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin-top: 10px; background: #fff; }
    ul { margin: 8px 0 0; padding-left: 20px; }
    li + li { margin-top: 4px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #111827; color: #f9fafb; border-radius: 8px; padding: 12px; overflow-x: auto; max-height: 360px; }
    details { margin-top: 10px; }
    summary { cursor: pointer; font-weight: 700; }
    .slide-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 12px; }
    .slide-grid.compact { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    figure { margin: 0; border: 1px solid var(--line); border-radius: 8px; background: #f8fafc; overflow: hidden; }
    img { display: block; width: 100%; height: auto; }
    figcaption { padding: 6px 9px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th:first-child, td:first-child { width: 64px; min-width: 64px; }
    @media (max-width: 900px) { .case-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <header>
    <h1>hw-ppt-gen 软件测试报告</h1>
    <p class="muted">只统计仓库自身的软件测试，不统计 Agent 交付审阅。PPTX 交付件均通过 PowerPoint COM 导出为 PNG 后在页面内展示。</p>
    <div class="kpis">
      <span>生成时间：${htmlEscape(generatedAt)}</span>
      <span>测试用例：${results.length}</span>
      <span>通过：${passed}</span>
      <span>失败：${failed}</span>
      <span>交付件：${artifactCount}</span>
      <span>PPT 导出图片：${pptImageCount}</span>
    </div>
  </header>

  <section>
    <h2>用例总览</h2>
    <table>
      <thead><tr><th>状态</th><th>分类</th><th>用例</th><th>脚本</th><th>交付件</th></tr></thead>
      <tbody>
        ${results.map((item) => `<tr>
          <td><span class="pill status-${item.result.status}">${statusLabel(item.result.status)}</span></td>
          <td>${htmlEscape(item.category)}</td>
          <td><a href="#${htmlEscape(item.id)}">${htmlEscape(item.title)}</a></td>
          <td>${htmlEscape(item.script)}</td>
          <td>${item.artifacts.length}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </section>

  ${categories.map((category) => `<section>
    <h2>${htmlEscape(category)}</h2>
    ${results.filter((item) => item.category === category).map((item) => `<article id="${htmlEscape(item.id)}" class="case ${item.result.status}">
      <div class="meta">
        <span class="pill status-${item.result.status}">${statusLabel(item.result.status)}</span>
        <span class="tag">${htmlEscape(item.category)}</span>
        <span class="tag">${Math.round(item.result.durationMs / 100) / 10}s</span>
      </div>
      <h3>${htmlEscape(item.title)}</h3>
      <div class="case-grid">
        <div>
          <p><strong>测试脚本：</strong><a href="${htmlEscape(linkHref(item.script))}">${htmlEscape(item.script)}</a></p>
          <p><strong>执行命令：</strong><code>${htmlEscape(item.command[0])} ${htmlEscape(item.command[1].join(" "))}</code></p>
          <p><strong>退出码：</strong>${htmlEscape(item.result.exitCode)}</p>
          <p><strong>这个用例在测：</strong></p>
          <ul>${item.checks.map((check) => `<li>${htmlEscape(check)}</li>`).join("")}</ul>
        </div>
        <div>
          <p><strong>交付件：</strong></p>
          ${item.artifacts.length ? item.artifacts.map(renderArtifact).join("") : `<p class="muted">该用例只产生执行日志，没有额外文件交付件。</p>`}
        </div>
      </div>
      <details>
        <summary>查看测试输出摘要</summary>
        <pre>${htmlEscape(summarizeOutput(item.result))}</pre>
      </details>
      <details>
        <summary>查看完整日志</summary>
        <p><a href="${htmlEscape(linkHref(rel(item.result.logPath)))}">${htmlEscape(rel(item.result.logPath))}</a></p>
      </details>
    </article>`).join("")}
  </section>`).join("")}
</main>
</body>
</html>`;
}

function writePptxGalleryPages(results) {
  for (const testCase of results) {
    for (const artifactItem of testCase.artifacts) {
      if (artifactItem.type !== "pptx" || !Array.isArray(artifactItem.images) || artifactItem.images.length === 0) continue;
      const slug = safeSlug(`${testCase.id}-${artifactItem.label}`);
      const galleryDir = path.join(PPTX_PAGE_DIR, slug);
      ensureDir(galleryDir);
      const slidePages = artifactItem.images.map((imagePath, index) => {
        const pagePath = path.join(galleryDir, `slide_${String(index + 1).padStart(3, "0")}.html`);
        return {
          number: index + 1,
          image: imagePath,
          page: rel(pagePath),
          pagePath,
        };
      });
      slidePages.forEach((page, index) => {
        fs.writeFileSync(page.pagePath, renderSlidePage({
          artifactItem,
          page,
          previous: slidePages[index - 1],
          next: slidePages[index + 1],
          galleryIndexPath: path.join(galleryDir, "index.html"),
          total: slidePages.length,
        }), "utf8");
      });
      const galleryIndexPath = path.join(galleryDir, "index.html");
      fs.writeFileSync(galleryIndexPath, renderPptxGalleryPage({
        testCase,
        artifactItem,
        slidePages,
      }), "utf8");
      artifactItem.galleryIndex = rel(galleryIndexPath);
      artifactItem.slidePages = slidePages.map((page) => ({
        number: page.number,
        image: page.image,
        page: page.page,
      }));
    }
  }
}

function renderPptxGalleryPage({ testCase, artifactItem, slidePages }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${htmlEscape(artifactItem.label)} 逐页审阅</title>
  ${galleryStyle()}
</head>
<body>
  <main>
    <header>
      <p><a href="${htmlEscape(path.relative(path.dirname(path.join(PPTX_PAGE_DIR, safeSlug(`${testCase.id}-${artifactItem.label}`), "index.html")), HTML_OUT).replace(/\\/g, "/"))}">返回软件测试报告</a></p>
      <h1>${htmlEscape(artifactItem.label)}</h1>
      <p class="muted">${htmlEscape(testCase.title)} · ${slidePages.length} 页 · ${htmlEscape(artifactItem.relativePath)}</p>
    </header>
    <section class="thumb-grid">
      ${slidePages.map((page) => `<a class="thumb" href="${htmlEscape(path.basename(page.page))}">
        <img src="${htmlEscape(relativeFrom(path.join(PPTX_PAGE_DIR, safeSlug(`${testCase.id}-${artifactItem.label}`), "index.html"), page.image))}" alt="第 ${page.number} 页">
        <span>第 ${page.number} 页</span>
      </a>`).join("")}
    </section>
  </main>
</body>
</html>`;
}

function renderSlidePage({ artifactItem, page, previous, next, galleryIndexPath, total }) {
  const pagePath = page.pagePath;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${htmlEscape(artifactItem.label)} 第 ${page.number} 页</title>
  ${galleryStyle()}
</head>
<body class="slide-page">
  <nav>
    <a href="${htmlEscape(path.relative(path.dirname(pagePath), galleryIndexPath).replace(/\\/g, "/"))}">全部页面</a>
    ${previous ? `<a href="${htmlEscape(path.basename(previous.page))}">上一页</a>` : `<span>上一页</span>`}
    <strong>第 ${page.number} / ${total} 页</strong>
    ${next ? `<a href="${htmlEscape(path.basename(next.page))}">下一页</a>` : `<span>下一页</span>`}
  </nav>
  <main>
    <img class="slide-full" src="${htmlEscape(relativeFrom(pagePath, page.image))}" alt="${htmlEscape(artifactItem.label)} 第 ${page.number} 页">
  </main>
</body>
</html>`;
}

function galleryStyle() {
  return `<style>
    body { margin: 0; background: #f4f6f8; color: #17212b; font-family: "Microsoft YaHei", Arial, sans-serif; }
    main { max-width: 1800px; margin: 0 auto; padding: 22px; }
    header { margin-bottom: 18px; }
    h1 { margin: 0 0 8px; color: #c00000; font-size: 28px; }
    a { color: #8b1e13; text-decoration: none; border-bottom: 1px dashed currentColor; }
    .muted { color: #66717e; }
    .thumb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .thumb { display: block; background: #fff; border: 1px solid #d9e0e8; border-radius: 8px; overflow: hidden; }
    .thumb img { display: block; width: 100%; height: auto; }
    .thumb span { display: block; padding: 8px 10px; color: #66717e; font-size: 13px; }
    nav { position: sticky; top: 0; z-index: 2; display: flex; gap: 16px; align-items: center; padding: 12px 18px; background: rgba(255,255,255,.96); border-bottom: 1px solid #d9e0e8; }
    nav span { color: #9aa3ad; }
    .slide-page main { max-width: none; padding: 18px; }
    .slide-full { display: block; width: min(100%, 1800px); margin: 0 auto; background: #fff; border: 1px solid #d9e0e8; box-shadow: 0 12px 36px rgba(23,33,43,.16); }
  </style>`;
}

function relativeFrom(fromFile, targetRelativePath) {
  return path.relative(path.dirname(fromFile), abs(targetRelativePath)).replace(/\\/g, "/");
}

function safeSlug(value) {
  return String(value || "pptx")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "pptx";
}

function main() {
  ensureDir(OUT_DIR);
  ensureDir(LOG_DIR);
  ensureDir(PPTX_PAGE_DIR);
  const results = [];

  for (const testCase of TEST_CASES) {
    console.log(`[software-test-report] run ${testCase.id}`);
    const result = run(testCase.command[0], testCase.command[1], testCase.id);
    if (typeof testCase.collectArtifacts === "function") {
      testCase.artifacts.push(...testCase.collectArtifacts());
    }
    exportPptxArtifacts(testCase);
    results.push({
      ...testCase,
      result,
      artifacts: enhanceArtifacts(testCase.artifacts),
    });
  }

  writePptxGalleryPages(results);

  const payload = {
    generated_at: new Date().toISOString(),
    results: results.map((item) => ({
      id: item.id,
      category: item.category,
      title: item.title,
      script: item.script,
      command: item.command,
      status: item.result.status,
      exit_code: item.result.exitCode,
      duration_ms: item.result.durationMs,
      checks: item.checks,
      artifacts: item.artifacts,
      log: rel(item.result.logPath),
    })),
  };
  fs.writeFileSync(path.join(OUT_DIR, "software-test-results.json"), JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(HTML_OUT, renderReport(results), "utf8");
  console.log(`Software test report: ${HTML_OUT}`);
  return results.some((item) => item.result.status !== "passed") ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main();
}
