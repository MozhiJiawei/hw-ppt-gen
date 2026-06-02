const fs = require("fs");
const path = require("path");

function createTidarPrimitiveFixture(rootDir) {
  const out = path.join(rootDir, ".tmp", "tidar_three_column_primitives");
  fs.mkdirSync(out, { recursive: true });
  const evidence = path.join(out, "tidar_evidence.svg");
  const mechanism = path.join(out, "tidar_mechanism.svg");
  const boundary = path.join(out, "tidar_boundary.svg");
  writeSvg(evidence, 1000, 700, "TiDAR evidence");
  writeSvg(mechanism, 1050, 520, "pre-draft mechanism");
  writeSvg(boundary, 920, 520, "landing boundary");
  return {
    area: { x: 0.67, y: 2.65, w: 3.85, h: 3.92 },
    modules: [
      {
        title: "收益证据",
        componentPrimitives: [
          evidenceBlock("tidar_gain_evidence", evidence),
          kpiBlock("tidar_gain_kpis", [
            { label: "1.5B接收", value: "7.45" },
            { label: "8B接收", value: "8.25" },
            { label: "真实吞吐", value: "4.71/5.91x" },
          ]),
          textBlock(["收益口径：T/NFE 是平均推进长度。", "关键转化：batch=1 实测才到 4.71x/5.91x。"]),
        ],
      },
      {
        title: "关键技术",
        componentPrimitives: [
          evidenceBlock("tidar_mechanism_evidence", mechanism),
          kpiBlock("tidar_mechanism_cards", [
            { label: "AR 区域", value: "sampling" },
            { label: "diffusion 区域", value: "pre-draft" },
            { label: "工程条件", value: "exact KV" },
          ]),
          textBlock(["机制变化：当前输出和下一批草稿被压进同一次 forward。", "边界：不是外接小 drafter。"]),
        ],
      },
      {
        title: "落地边界",
        componentPrimitives: [
          evidenceBlock("tidar_boundary_evidence", boundary),
          kpiBlock("tidar_boundary_kpis", [
            { label: "1.5B训练", value: "50B" },
            { label: "8B训练", value: "150B" },
            { label: "主测", value: "H100 b=1" },
          ]),
          textBlock(["成本定性：TiDAR 不是 training-free 插件。", "决策路径：先复现 1.5B，再评估 8B 投入。"]),
        ],
      },
    ],
  };
}

function evidenceBlock(id, sourcePath) {
  return {
    type: "visual_anchor",
    visual_anchor: {
      id,
      title: id,
      claim: "source evidence",
      kind: "Evidence",
      template: "source_figure",
      source: { path: sourcePath, caption: "source evidence" },
    },
  };
}

function kpiBlock(id, cards) {
  return {
    type: "supporting_component",
    component: {
      id,
      title: id,
      claim: "supporting readout",
      kind: "Quantity",
      template: "data_cards",
      visual_spec: { cards },
    },
  };
}

function textBlock(body) {
  return { type: "text", body };
}

function writeSvg(filePath, width, height, label) {
  fs.writeFileSync(filePath, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" stroke="#C00000" stroke-width="8"/>
  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="56" font-family="Microsoft YaHei">${label}</text>
</svg>`, "utf8");
}

module.exports = {
  createTidarPrimitiveFixture,
};
