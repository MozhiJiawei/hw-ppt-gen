"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "software_test_report");
const LOG_DIR = path.join(OUT_DIR, "logs");
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
    id: "visual-anchor-content-contract",
    category: "内容页契约",
    title: "内容页统一入口会记录视觉锚点、布局和图注证据。",
    command: ["node", ["scripts/smoke/test_visual_anchor_content_contract.js"]],
    script: "scripts/smoke/test_visual_anchor_content_contract.js",
    checks: [
      "内容页模块只暴露 addVisualAnchorContentSlide、premeasureVisualAnchorContentSlides、writeVisualAnchorManifest。",
      "图片型视觉锚点必须在 manifest 中记录 renderer、image format、slot、image area，并保持等比放置。",
      "图注和来源说明留在 PPT 文本层，不进入 visual_spec。",
      "瘦高 evidence 自动选择左右排布，Evidence、KPI、正文混排时 KPI 高度不能被压扁。",
      "direct table block、supporting-only 页面、手工 body layout 都必须失败。",
    ],
    artifacts: [
      artifact("输出证据 manifest", ".tmp/visual_anchor_contract_output_manifest.json"),
      artifact("图片等比 manifest", ".tmp/visual_anchor_contract_image_placement_manifest.json"),
      artifact("图注 manifest", ".tmp/visual_anchor_contract_caption_manifest.json"),
      artifact("自动流向 manifest", ".tmp/visual_anchor_contract_auto_flow_manifest.json"),
      artifact("KPI 高度 manifest", ".tmp/visual_anchor_contract_data_card_height_manifest.json"),
      artifact("二/三分栏图注 manifest", ".tmp/visual_anchor_contract_column_caption_manifest.json"),
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
    category: "视觉模板",
    title: "所有绘图组件都能生成可人工审阅的 review deck。",
    command: ["node", ["scripts/smoke/verify_diagram_components.js"]],
    script: "scripts/smoke/verify_diagram_components.js",
    checks: [
      "从 visual_diagram_test_cases.js 读取所有绘图组件样例。",
      "每个 kind/template 都生成一个 review PPTX，覆盖大图、中图、小图尺寸。",
      "rough_svg 组件同时落出 SVG/PNG 资产，ppt_native 组件直接进入 PPT review slide。",
      "超过文本容量的用例不静默通过，而是生成 rejection review slide。",
      "所有 review PPTX 都作为软件测试交付件进入报告，并通过 PowerPoint COM 导出成图片。",
    ],
    artifacts: [
      artifact("绘图组件 smoke manifest", ".tmp/diagram_component_smoke/manifest.json"),
    ],
    collectArtifacts: collectDiagramComponentArtifacts,
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
    id: "feedback-issue-contract",
    category: "反馈诊断",
    title: "布局诊断和 QA 问题可以统一为 FeedbackIssue。",
    command: ["node", ["scripts/smoke/test_feedback_issue_contract.js"]],
    script: "scripts/smoke/test_feedback_issue_contract.js",
    checks: [
      "layout diagnostic 保持原有字段，同时携带 layout phase 的 FeedbackIssue。",
      "QA issue 可以规范化为 code、severity、phase、target、details、repairs。",
      "Markdown/JSON reporter 可以按 slide/module/block 分组输出修复建议。",
    ],
    artifacts: [
      artifact("FeedbackIssue JSON 示例", ".tmp/feedback_issue_contract/feedback_issues.json"),
      artifact("FeedbackIssue Markdown 报告", ".tmp/feedback_issue_contract/feedback_issues.md"),
      artifact("真实 QA 失败 JSON 报告", ".tmp/feedback_issue_contract/qa_failure_report.json"),
      artifact("真实 QA 失败 Feedback Markdown", ".tmp/feedback_issue_contract/qa_failure_report.feedback.md"),
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

function collectDiagramComponentArtifacts() {
  const manifestPath = abs(".tmp/diagram_component_smoke/manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return (manifest.review_decks || []).map((deck) => {
    const kind = String(deck.kind || "unknown").toLowerCase();
    const template = String(deck.template || "unknown").toLowerCase();
    return pptArtifact(
      `${deck.kind}/${deck.template} review PPTX`,
      deck.pptx,
      `.tmp/software_test_report/pptx/diagram_component_smoke/${kind}/${template}`
    );
  });
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
      html += `<div class="slide-grid">`;
      item.images.forEach((imagePath, index) => {
        html += `<figure><img src="${htmlEscape(linkHref(imagePath))}" alt="${htmlEscape(item.label)} 第 ${index + 1} 页"><figcaption>第 ${index + 1} 页</figcaption></figure>`;
      });
      html += `</div>`;
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
    <p class="muted">只统计仓库自身的软件测试，不统计 Agent 交付 QA。PPTX 交付件均通过 PowerPoint COM 导出为 PNG 后在页面内展示。</p>
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

function main() {
  ensureDir(OUT_DIR);
  ensureDir(LOG_DIR);
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
