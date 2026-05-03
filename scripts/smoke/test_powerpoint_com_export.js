const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const JSZip = require("jszip");

const pptHelpers = require("../pptx/hw_pptx_helpers");
const visualSlide = require("../pptx/hw_visual_anchor_slide");
const diagram = require("../pptx/hw_diagram_helpers");

const {
  HW_STYLE,
  addAnalysisSummary,
  addCoverSlide,
  addFooter,
  addHuaweiTable,
  addPageTitle,
  addSectionTabs,
  addTocSlide,
  cloneOptions,
  createHuaweiDeck,
  ensureTmpPath,
  repairPptxForPowerPointCom,
  grayCard,
  redTitleCard,
  safeText,
  stripHash,
  textBox,
} = pptHelpers;

const {
  addEvidenceModule,
  addSupportingCards,
  addVisualAnchorContentSlide,
  writeVisualAnchorManifest,
} = visualSlide;

const {
  DIAGRAM_STYLE,
  TEMPLATE_LAYOUTS,
  chooseTemplateLayout,
  createVisualAnchorImage,
  createVisualAnchorSvg,
  getVisualAnchorRenderer,
  renderVisualAnchorPptNative,
  renderVisualAnchorRoughSvg,
  resolveVisualAnchorRenderPath,
  validateVisualAnchorSpec,
  writeVisualAnchorImage,
  writeVisualAnchorSvg,
} = diagram;

const OUT = ensureTmpPath(path.join(".tmp", "powerpoint_com_interface_test.pptx"));
const MANIFEST = ensureTmpPath(path.join(".tmp", "powerpoint_com_interface_test_visual_anchor_manifest.json"));
const RENDER_DIR = ensureTmpPath(path.join(".tmp", "powerpoint_com_interface_test_slides"));
const ASSET_DIR = ensureTmpPath(path.join(".tmp", "powerpoint_com_interface_test_assets"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approxEqual(a, b, epsilon = 0.02) {
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout;
}

function requirePowerPointCom() {
  if (process.platform !== "win32") {
    throw new Error("PowerPoint COM export test requires Windows.");
  }
  run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "$ErrorActionPreference='Stop'; $app = New-Object -ComObject PowerPoint.Application; $v = $app.Version; $app.Quit(); Write-Output $v",
  ]);
}

function baseSpec(kind, template, visual_spec, extra = {}) {
  return {
    id: `com_${template}`,
    title: `${kind} ${template}`,
    claim: `${kind}/${template} 应能进入 PowerPoint COM 导出链路。`,
    kind,
    template,
    visual_spec,
    ...extra,
  };
}

function visualSpecs() {
  return [
    baseSpec("Quantity", "data_cards", {
      cards: [
        { id: "pass", label: "正例", value: "1", unit: "套" },
        { id: "fail", label: "阻塞", value: "0", unit: "项" },
        { id: "cover", label: "覆盖", value: "7", unit: "类" },
      ],
      highlight: "fail",
    }),
    baseSpec("Quantity", "bar_chart", {
      y_label: "覆盖数",
      categories: ["契约", "生成", "导出"],
      series: [{ name: "覆盖", values: [1, 1, 1] }],
      highlight: { category: "导出", series: "覆盖" },
    }),
    baseSpec("Quantity", "line_chart", {
      y_label: "稳定性",
      categories: ["T1", "T2", "T3", "T4"],
      series: [{ name: "稳定性", values: [1, 2, 3, 4] }],
      highlight: { category: "T4", series: "稳定性" },
    }),
    baseSpec("Quantity", "proportion_chart", {
      total_label: "接口覆盖",
      segments: [{ label: "页面", value: 30 }, { label: "图形", value: 50 }, { label: "QA", value: 20 }],
      highlight: "图形",
    }),
    baseSpec("Quantity", "heatmap", {
      rows: ["Prompt", "脚本", "QA"],
      columns: ["计划", "渲染", "导出"],
      values: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
      highlight: { row: "脚本", column: "导出" },
    }),
    baseSpec("Sequence", "process", {
      steps: [
        { id: "build", label: "生成" },
        { id: "open", label: "打开" },
        { id: "export", label: "导出" },
      ],
      highlight: "export",
    }),
    baseSpec("Sequence", "timeline", {
      steps: [
        { id: "t1", time: "T1", label: "写入" },
        { id: "t2", time: "T2", label: "保存" },
        { id: "t3", time: "T3", label: "导出" },
      ],
      highlight: "t3",
    }),
    baseSpec("Sequence", "swimlane", {
      lanes: [
        { id: "skill", label: "SKILL", steps: [{ id: "s1", label: "规划" }] },
        { id: "script", label: "脚本", steps: [{ id: "s2", label: "生成" }] },
        { id: "ppt", label: "PowerPoint", steps: [{ id: "s3", label: "导出" }] },
      ],
      highlight: "s3",
    }),
    baseSpec("Loop", "closed_loop", {
      center: "COM 导出闭环",
      steps: [
        { id: "make", label: "生成" },
        { id: "render", label: "导出" },
        { id: "inspect", label: "检查" },
        { id: "fix", label: "修复" },
      ],
      highlight: "render",
    }),
    baseSpec("Loop", "dual_loop", {
      loops: [
        { id: "dev", label: "开发测试", steps: [{ id: "d1", label: "生成" }, { id: "d2", label: "导出" }, { id: "d3", label: "检查" }] },
        { id: "qa", label: "交付 QA", steps: [{ id: "q1", label: "验证" }, { id: "q2", label: "记录" }, { id: "q3", label: "回归" }] },
      ],
      highlight: "qa",
    }),
    baseSpec("Loop", "spiral_iteration_ladder", {
      center: "兼容性提升",
      steps: [
        { id: "find", label: "发现" },
        { id: "patch", label: "修复" },
        { id: "test", label: "测试" },
        { id: "guard", label: "守护" },
      ],
      highlight: "guard",
    }),
    baseSpec("Hierarchy", "tree", {
      nodes: ["接口", "页面", "图形", "导出"],
      edges: [["接口", "页面"], ["接口", "图形"], ["图形", "导出"]],
      labels: { "接口": "入口", "页面": "骨架", "图形": "锚点", "导出": "COM" },
      highlight: "导出",
    }),
    baseSpec("Hierarchy", "layered_architecture", {
      layers: [
        { id: "prompt", label: "Prompt 层", items: ["visual_anchor"] },
        { id: "script", label: "脚本层", items: ["content entry", "diagram renderer"] },
        { id: "export", label: "导出层", items: ["PowerPoint COM"] },
      ],
      side_label: "检查",
      side_modules: ["QA"],
      edges: [["visual_anchor", "content entry"], ["diagram renderer", "PowerPoint COM"], ["QA", "content entry"]],
    }),
    baseSpec("Hierarchy", "capability_stack", {
      levels: [
        { label: "开发测试" },
        { label: "生成 PPT" },
        { label: "COM 导出" },
      ],
      highlight: "COM 导出",
    }),
    baseSpec("Matrix", "table", {
      rows: [
        ["接口组", "覆盖方式", "导出要求"],
        ["页面", "原生形状", "可打开"],
        ["图形", "视觉锚点", "可导出"],
      ],
    }),
    baseSpec("Matrix", "quadrant_matrix", {
      x_axis: { left: "低", right: "高", label: "覆盖度" },
      y_axis: { bottom: "低", top: "高", label: "风险" },
      items: [{ label: "COM", x: 0.8, y: 0.8 }, { label: "单测", x: 0.6, y: 0.3 }],
      highlight: "COM",
    }),
    baseSpec("Matrix", "capability_matrix", {
      rows: ["页面", "图形", "导出"],
      columns: ["调用", "生成", "检查"],
      values: [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
      highlight: { row: "导出", column: "检查" },
    }),
    baseSpec("Network", "hub_spoke_network", {
      hub: { id: "contract", label: "接口契约" },
      nodes: [
        { id: "page", label: "页面" },
        { id: "diagram", label: "图形" },
        { id: "qa", label: "QA" },
        { id: "com", label: "COM" },
      ],
      edges: [["contract", "page"], ["contract", "diagram"], ["contract", "qa"], ["diagram", "com"]],
      highlight: "com",
    }),
    baseSpec("Network", "dependency_graph", {
      nodes: [{ id: "skill", label: "SKILL" }, { id: "script", label: "脚本" }, { id: "pptx", label: "PPTX" }, { id: "com", label: "COM" }],
      edges: [["skill", "script"], ["script", "pptx"], ["pptx", "com"]],
      highlight: "com",
    }),
    baseSpec("Network", "module_interaction_map", {
      nodes: [{ id: "helper", label: "helper" }, { id: "anchor", label: "anchor" }, { id: "diagram", label: "diagram" }, { id: "export", label: "export" }],
      edges: [["helper", "anchor"], ["anchor", "diagram"], ["diagram", "export"], ["export", "helper"]],
      highlight: "export",
    }),
    baseSpec("Network", "causal_influence_graph", {
      nodes: [{ id: "bug", label: "负 ext" }, { id: "ppt", label: "打开失败" }, { id: "test", label: "COM 测试" }, { id: "fix", label: "修复" }],
      edges: [["bug", "ppt"], ["test", "bug"], ["fix", "ppt"]],
      highlight: "fix",
    }),
    {
      id: "com_evidence",
      title: "Evidence source placeholder",
      claim: "Evidence 也必须能进入 COM 导出链路。",
      kind: "Evidence",
      template: "source_figure",
      source: { id: "synthetic_source", caption: "合成证据占位", relevance: "high" },
    },
  ];
}

function exerciseDiagramInterfaces(specs) {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const roughSpec = specs.find((spec) => spec.kind === "Sequence" && spec.template === "process");
  validateVisualAnchorSpec(roughSpec);
  assert(DIAGRAM_STYLE.color.red === "#C00000", "DIAGRAM_STYLE should expose Huawei red");
  assert(TEMPLATE_LAYOUTS.bar_chart === "16:9", "TEMPLATE_LAYOUTS should expose fixed layouts");
  assert(chooseTemplateLayout(roughSpec) === "16:9", "chooseTemplateLayout should return 16:9");
  assert(getVisualAnchorRenderer({ HW_VISUAL_ANCHOR_RENDERER: "ppt_native" }) === "ppt_native", "getVisualAnchorRenderer should read runtime policy");
  assert(resolveVisualAnchorRenderPath(roughSpec, { HW_VISUAL_ANCHOR_RENDERER: "rough_svg" }) === "rough_svg", "resolveVisualAnchorRenderPath should resolve rough SVG");
  assert(renderVisualAnchorRoughSvg(roughSpec).svg.includes("<svg"), "renderVisualAnchorRoughSvg should return SVG");
  assert(createVisualAnchorSvg(roughSpec).includes("<svg"), "createVisualAnchorSvg should return SVG markup");
  assert(createVisualAnchorImage(roughSpec, { width: 720 }).format === "svg", "createVisualAnchorImage should return SVG image metadata");
  assert(fs.existsSync(writeVisualAnchorSvg(roughSpec, ASSET_DIR)), "writeVisualAnchorSvg should write an SVG file");
  assert(fs.existsSync(writeVisualAnchorImage(roughSpec, ASSET_DIR, { width: 720 })), "writeVisualAnchorImage should write an SVG image file");
}

function addPrimitiveSlide(pptx) {
  const slide = pptx.addSlide();
  const sample = cloneOptions({ value: "#C00000" });
  assert(sample.value === "#C00000", "cloneOptions should clone data");
  assert(safeText(null) === "", "safeText should normalize null");
  assert(stripHash("#C00000") === "C00000", "stripHash should remove leading hash from colors");

  addPageTitle(slide, "基础接口调用", {
    subtitle: "页面 primitives 也必须能进入同一个 PPTX",
    sections: ["接口覆盖"],
    currentSection: "接口覆盖",
  });
  addSectionTabs(slide, ["页面", "图形", "导出"], "图形", { x: 8.3, y: 0.58, totalW: 4.2 });
  addAnalysisSummary(slide, {
    body: [
      { label: "接口覆盖", text: "本页直接调用页面基础接口。" },
      { label: "导出验证", text: "最终由 PowerPoint COM 渲染确认。" },
    ],
  });
  redTitleCard(slide, "primitive 区域", 0.7, 2.05, 3.6);
  grayCard(slide, { x: 0.7, y: 2.39, w: 3.6, h: 1.3, title: "灰卡", body: ["redTitleCard", "grayCard", "textBox"] });
  textBox(slide, `主题色 ${HW_STYLE.color.red}`, { x: 4.6, y: 2.28, w: 3.2, h: 0.35, fontSize: 14, bold: true, color: HW_STYLE.color.red });
  addHuaweiTable(slide, [["接口", "状态"], ["addHuaweiTable", "已调用"], ["addFooter", "已调用"]], { x: 4.6, y: 2.8, w: 3.6, h: 1.2 });
  addSupportingCards(slide, [{ title: "辅卡接口", body: ["addSupportingCards 已调用", "不作为主视觉"] }], { x: 8.5, y: 2.05, w: 3.7, h: 1.8 });
  addFooter(slide, { source: "开发测试", page: "03" });
}

function addDirectRendererSlides(pptx, specs) {
  const slide = pptx.addSlide();
  addPageTitle(slide, "直接渲染接口", {
    subtitle: "renderVisualAnchorPptNative 与 addEvidenceModule",
    sections: ["接口覆盖"],
    currentSection: "接口覆盖",
  });
  addAnalysisSummary(slide, { body: [{ label: "直接调用", text: "本页绕过正文页入口，专门验证底层渲染接口。" }] });
  renderVisualAnchorPptNative(slide, specs.find((spec) => spec.template === "process"), { x: 0.7, y: 2.05, w: 5.7, h: 3.2 });
  addEvidenceModule(slide, specs.find((spec) => spec.kind === "Evidence"), { x: 6.75, y: 2.05, w: 5.7, h: 3.2 });
  addFooter(slide, { source: "开发测试", page: "04" });
}

async function assertNoNegativeExtents(fileName) {
  const zip = await JSZip.loadAsync(fs.readFileSync(fileName));
  const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const offenders = [];
  for (const file of slideFiles) {
    const xml = await zip.files[file].async("string");
    const negative = [...xml.matchAll(/<a:ext cx="(-?\d+)" cy="(-?\d+)"/g)]
      .filter((match) => Number(match[1]) < 0 || Number(match[2]) < 0);
    if (negative.length) offenders.push({ file, count: negative.length });
  }
  assert(offenders.length === 0, `PPTX contains PowerPoint-unsafe negative extents: ${JSON.stringify(offenders)}`);
}

async function buildDeck() {
  const specs = visualSpecs();
  exerciseDiagramInterfaces(specs);

  const pptx = createHuaweiDeck({ title: "PowerPoint COM interface coverage" });
  const sections = ["接口覆盖", "锚点覆盖", "导出验证"];
  addCoverSlide(pptx, {
    title: "PowerPoint COM 接口覆盖测试",
    subtitle: "调用所有公开接口并强制导出 PNG",
    department: "Agent Skills / PPT 能力建设",
    date: "2026.05.02",
  });
  addTocSlide(pptx, {
    title: "目录 CONTENTS",
    items: [
      { title: "接口覆盖", note: "页面 primitives 与底层渲染接口" },
      { title: "锚点覆盖", note: "Evidence + 六大能力全部进入 PPTX" },
      { title: "导出验证", note: "PowerPoint COM 打开并逐页导出" },
    ],
    source: "开发测试",
    page: "02",
  });
  addPrimitiveSlide(pptx);
  addDirectRendererSlides(pptx, specs);

  specs.forEach((spec, idx) => {
    addVisualAnchorContentSlide(pptx, {
      title: `锚点模板 ${idx + 1}`,
      titleNote: `${spec.kind} / ${spec.template}`,
      sections,
      currentSection: "锚点覆盖",
      summary: {
        body: [
          { label: "接口调用", text: "通过统一正文页入口渲染主视觉。" },
          { label: "导出目标", text: "该页必须能被 PowerPoint COM 打开并导出。" },
        ],
      },
      visual_anchor: spec,
      source: "开发测试",
      page: String(idx + 5).padStart(2, "0"),
    });
  });

  writeVisualAnchorManifest(pptx, MANIFEST);
  await pptx.writeFile({ fileName: OUT });
  await repairPptxForPowerPointCom(OUT);
  await assertNoNegativeExtents(OUT);
}

async function main() {
  requirePowerPointCom();
  await buildDeck();
  run("node", [
    "scripts/pptx/export_pptx_images.js",
    OUT,
    "--out",
    RENDER_DIR,
    "--renderer",
    "powerpoint",
  ], { timeout: 180000 });

  const manifestPath = path.join(RENDER_DIR, "render_manifest.json");
  assert(fs.existsSync(manifestPath), "PowerPoint export should write render_manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert(manifest.renderer === "powerpoint", "render manifest should confirm PowerPoint renderer");
  assert(manifest.slide_count === 4 + visualSpecs().length, `expected ${4 + visualSpecs().length} rendered slides`);

   const visualManifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
   const roughEntries = visualManifest.slides.filter((entry) => entry.renderer === "rough_svg");
   assert(roughEntries.length > 0, "interface test should include rough_svg content slides");
   roughEntries.forEach((entry) => {
     assert(entry.image_area && entry.anchor_area, "rough_svg entries should record image_area and anchor_area");
     assert(entry.image_width > 0 && entry.image_height > 0, "rough_svg entries should record image dimensions");
     const imageRatio = entry.image_width / entry.image_height;
     const placedRatio = entry.image_area.w / entry.image_area.h;
     assert(approxEqual(imageRatio, placedRatio), `rough_svg entry ${entry.visual_anchor_id} should preserve image aspect ratio`);
   });

  console.log(`PowerPoint COM interface export test passed: ${OUT}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
