const fs = require("fs");
const path = require("path");
const rough = require("roughjs");

const DIAGRAM_STYLE = Object.freeze({
  width: 1600,
  height: 900,
  pptW: 13.333,
  pptH: 7.5,
  font: "'Microsoft YaHei', 'Noto Sans CJK SC', Arial, sans-serif",
  color: {
    red: "#C7000B",
    ink: "#1f2328",
    muted: "#59636e",
    paper: "#fffdf7",
    warm: "#fff0d6",
    blue: "#e5f0ff",
    green: "#e4f5e7",
    pink: "#ffe8ec",
    yellow: "#fff6bf",
    gray: "#f4f1ea",
  },
});

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeText(value) {
  return String(value ?? "")
    .replace(/[\u2022\u25CF\u25CB\u25A0\u25AA]/g, "-")
    .trim();
}

function svgText(x, y, text, opts = {}) {
  const size = opts.size || 28;
  const weight = opts.weight || 500;
  const anchor = opts.anchor || "middle";
  const fill = opts.fill || DIAGRAM_STYLE.color.ink;
  const family = opts.family || DIAGRAM_STYLE.font;
  const lines = Array.isArray(text) ? text : String(text ?? "").split("\n");
  const lineHeight = opts.lineHeight || size * 1.25;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${tspans}</text>`;
}

function wrapCjk(text, chars = 12) {
  const value = safeText(text);
  if (!value) return [""];
  if (value.includes("workflow")) return ["改 workflow / tools", "/ prompt"];
  if (value.length <= chars) return [value];
  return value.match(new RegExp(`.{1,${chars}}`, "g")) || [value];
}

function createCanvas() {
  return {
    chunks: [],
    add(value) {
      this.chunks.push(value);
    },
  };
}

function roughSvg(seed) {
  const svg = {
    ownerDocument: {
      createElementNS(ns, tagName) {
        return {
          tagName,
          attrs: {},
          children: [],
          setAttribute(name, value) {
            this.attrs[name] = value;
          },
          appendChild(child) {
            this.children.push(child);
            return child;
          },
        };
      },
    },
  };
  return { rc: rough.svg(svg, { options: { seed } }) };
}

function serializeNode(node) {
  if (typeof node === "string") return node;
  const attrs = Object.entries(node.attrs || {})
    .map(([key, value]) => `${key}="${escapeXml(value)}"`)
    .join(" ");
  const children = (node.children || []).map(serializeNode).join("");
  return `<${node.tagName}${attrs ? ` ${attrs}` : ""}>${children}</${node.tagName}>`;
}

function addRough(canvas, node) {
  canvas.add(serializeNode(node));
}

function rect(canvas, rc, x, y, w, h, opts = {}) {
  addRough(canvas, rc.rectangle(x, y, w, h, {
    stroke: opts.stroke || DIAGRAM_STYLE.color.ink,
    strokeWidth: opts.strokeWidth || 2.2,
    fill: opts.fill,
    fillStyle: opts.fillStyle || "hachure",
    hachureGap: opts.hachureGap || 10,
    hachureAngle: opts.hachureAngle || -35,
    roughness: opts.roughness || 1.8,
    bowing: opts.bowing || 1.4,
    seed: opts.seed,
  }));
}

function ellipse(canvas, rc, cx, cy, w, h, opts = {}) {
  addRough(canvas, rc.ellipse(cx, cy, w, h, {
    stroke: opts.stroke || DIAGRAM_STYLE.color.ink,
    strokeWidth: opts.strokeWidth || 2.4,
    fill: opts.fill,
    fillStyle: opts.fillStyle || "hachure",
    hachureGap: opts.hachureGap || 8,
    hachureAngle: opts.hachureAngle || -30,
    roughness: opts.roughness || 1.7,
    seed: opts.seed,
  }));
}

function pathRough(canvas, rc, d, opts = {}) {
  addRough(canvas, rc.path(d, {
    stroke: opts.stroke || DIAGRAM_STYLE.color.ink,
    strokeWidth: opts.strokeWidth || 2.2,
    fill: opts.fill,
    fillStyle: opts.fillStyle || "hachure",
    hachureGap: opts.hachureGap || 9,
    hachureAngle: opts.hachureAngle || -30,
    roughness: opts.roughness || 1.5,
    bowing: opts.bowing || 1.3,
    seed: opts.seed,
  }));
}

function arrowHead(canvas, x1, y1, x2, y2, stroke, strokeWidth) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 15;
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  const p1 = [x2 + Math.cos(a1) * len, y2 + Math.sin(a1) * len];
  const p2 = [x2 + Math.cos(a2) * len, y2 + Math.sin(a2) * len];
  canvas.add(`<path d="M ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)} L ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
}

function line(canvas, rc, x1, y1, x2, y2, opts = {}) {
  const stroke = opts.stroke || DIAGRAM_STYLE.color.ink;
  const strokeWidth = opts.strokeWidth || 2.2;
  addRough(canvas, rc.line(x1, y1, x2, y2, {
    stroke,
    strokeWidth,
    roughness: opts.roughness || 1.6,
    bowing: opts.bowing || 1.2,
    seed: opts.seed,
  }));
  if (opts.arrow) arrowHead(canvas, x1, y1, x2, y2, stroke, strokeWidth);
}

function curve(canvas, rc, x1, y1, x2, y2, bend = 0, opts = {}) {
  const stroke = opts.stroke || DIAGRAM_STYLE.color.ink;
  const strokeWidth = opts.strokeWidth || 2.2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + bend;
  pathRough(canvas, rc, `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`, {
    stroke,
    strokeWidth,
    roughness: opts.roughness || 1.7,
    seed: opts.seed,
  });
  if (opts.arrow) arrowHead(canvas, x1, y1, x2, y2, stroke, strokeWidth);
}

function baseSvg(title, claim, body, options = {}) {
  const width = options.width || DIAGRAM_STYLE.width;
  const height = options.height || DIAGRAM_STYLE.height;
  const colors = DIAGRAM_STYLE.color;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${colors.paper}"/>
<g opacity="0.48">
  <path d="M80 120 C310 86 518 111 742 89 S1205 116 1510 82" fill="none" stroke="#e8dcc9" stroke-width="2"/>
  <path d="M88 812 C358 790 606 830 894 802 S1266 788 1514 816" fill="none" stroke="#e8dcc9" stroke-width="2"/>
</g>
${svgText(90, 66, safeText(title), { size: 36, weight: 800, anchor: "start", fill: colors.red })}
${svgText(90, 112, safeText(claim), { size: 24, weight: 500, anchor: "start", fill: colors.muted })}
${body}
</svg>`;
}

function drawLayeredArchitecture(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(101);
  const canvas = createCanvas();
  const centers = {
    "用户": [420, 185],
    Web: [250, 295],
    App: [420, 295],
    API: [590, 295],
    "Agent Gateway": [420, 425],
    "工具编排": [300, 565],
    "记忆检索": [540, 565],
    "模型服务": [360, 705],
    "任务队列": [600, 705],
  };
  [
    ["入口层", 155, 250, 540, 92, colors.blue],
    ["接入层", 155, 378, 540, 92, colors.warm],
    ["编排层", 155, 516, 540, 104, colors.green],
    ["运行层", 155, 656, 620, 104, colors.pink],
  ].forEach(([label, x, y, w, h, fill], i) => {
    rect(canvas, rc, x, y, w, h, { fill, hachureGap: 14, stroke: "#364149", roughness: 2.1, seed: 20 + i });
    canvas.add(svgText(x - 40, y + h / 2 + 8, label, { size: 24, fill: colors.red, weight: 700 }));
  });

  ellipse(canvas, rc, 420, 185, 112, 70, { fill: colors.yellow, seed: 10 });
  canvas.add(svgText(420, 193, "用户", { size: 28, weight: 700 }));
  ["Web", "App", "API"].forEach((label, i) => {
    const [x, y] = centers[label];
    rect(canvas, rc, x - 56, y - 31, 112, 62, { fill: "#ffffff", fillStyle: "zigzag", seed: 30 + i });
    canvas.add(svgText(x, y + 8, label, { size: 26, weight: 700 }));
  });
  rect(canvas, rc, 265, 386, 310, 78, { fill: "#fff7e8", hachureAngle: -20, hachureGap: 8, strokeWidth: 3, seed: 40 });
  canvas.add(svgText(420, 434, "Agent Gateway", { size: 28, weight: 800 }));
  ["工具编排", "记忆检索", "模型服务", "任务队列"].forEach((label, i) => {
    const [x, y] = centers[label];
    rect(canvas, rc, x - 82, y - 34, 164, 68, { fill: i < 2 ? "#fafff4" : "#fff2f5", seed: 50 + i });
    canvas.add(svgText(x, y + 8, label, { size: 25, weight: 700 }));
  });

  (spec.visual_spec?.edges || []).forEach(([from, to], i) => {
    const a = centers[from];
    const b = centers[to];
    if (!a || !b) return;
    curve(canvas, rc, a[0], a[1] + 36, b[0], b[1] - 38, (i % 3 - 1) * 8, {
      arrow: true,
      stroke: i > 5 ? colors.red : colors.ink,
      strokeWidth: i > 5 ? 2.7 : 2.1,
      seed: 90 + i,
    });
  });

  rect(canvas, rc, 965, 228, 330, 444, { fill: "#f8f8f8", fillStyle: "cross-hatch", hachureGap: 18, stroke: "#444", roughness: 2.2, seed: 130 });
  canvas.add(svgText(1130, 190, "观测与治理侧栏", { size: 28, weight: 800, fill: colors.red }));
  (spec.visual_spec?.side_modules || ["服务发现", "链路追踪", "权限审计"]).slice(0, 3).forEach((label, i) => {
    const y = 325 + i * 110;
    ellipse(canvas, rc, 1130, y, 210, 70, { fill: [colors.blue, colors.yellow, colors.green][i], hachureAngle: -45 + i * 20, seed: 140 + i });
    canvas.add(svgText(1130, y + 8, label, { size: 26, weight: 700 }));
    line(canvas, rc, 780, 425 + i * 58, 1018, y, { arrow: true, stroke: colors.muted, strokeWidth: 1.9, seed: 160 + i });
  });
  canvas.add(`<path d="M830 190 C780 315 804 600 860 734" fill="none" stroke="${colors.red}" stroke-width="4" stroke-linecap="round" stroke-dasharray="14 12" opacity="0.8"/>`);
  canvas.add(svgText(875, 748, "分层协同", { size: 24, weight: 800, fill: colors.red, anchor: "start" }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"));
}

function drawGroupedBarChart(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(707);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const categories = (visual.categories || []).slice(0, 6);
  const series = (visual.series || []).slice(0, 3);
  const values = series.flatMap((item) => item.values || []).map(Number).filter(Number.isFinite);
  const maxValue = Math.max(10, Math.ceil(Math.max(...values, 1) / 10) * 10);
  const chart = { x: 190, y: 220, w: 950, h: 520 };
  const baseline = chart.y + chart.h;
  const groupW = chart.w / Math.max(categories.length, 1);
  const barGap = 12;
  const barW = Math.min(62, (groupW - 70 - barGap * Math.max(series.length - 1, 0)) / Math.max(series.length, 1));

  rect(canvas, rc, chart.x - 18, chart.y - 12, chart.w + 44, chart.h + 48, {
    fill: "#ffffff",
    fillStyle: "hachure",
    hachureGap: 32,
    stroke: "#d7d2c8",
    strokeWidth: 1.6,
    roughness: 1.5,
    seed: 710,
  });
  line(canvas, rc, chart.x, chart.y, chart.x, baseline, { stroke: colors.ink, strokeWidth: 2.5, seed: 711 });
  line(canvas, rc, chart.x, baseline, chart.x + chart.w, baseline, { stroke: colors.ink, strokeWidth: 2.5, seed: 712 });
  for (let tick = 0; tick <= maxValue; tick += Math.max(10, maxValue / 6)) {
    const y = baseline - (tick / maxValue) * chart.h;
    line(canvas, rc, chart.x - 8, y, chart.x + chart.w, y, { stroke: tick === 0 ? colors.ink : "#d7dde3", strokeWidth: tick === 0 ? 2 : 1.2, roughness: 0.8, seed: 720 + tick });
    canvas.add(svgText(chart.x - 22, y + 7, String(Math.round(tick)), { size: 18, weight: 500, anchor: "end", fill: colors.muted }));
  }
  canvas.add(svgText(chart.x + 4, chart.y - 36, visual.y_label || "Value", { size: 22, weight: 800, anchor: "start", fill: colors.red }));

  const seriesColor = (entry, idx, highlighted) => {
    if (highlighted) return colors.red;
    if (entry.color === "red") return "#4e7ac7";
    if (entry.color === "gray") return "#cbd3df";
    return [colors.blue, colors.green, colors.warm][idx % 3];
  };

  categories.forEach((category, categoryIdx) => {
    const groupX = chart.x + categoryIdx * groupW + groupW / 2;
    const totalBarsW = series.length * barW + Math.max(0, series.length - 1) * barGap;
    series.forEach((entry, seriesIdx) => {
      const value = Number(entry.values?.[categoryIdx]) || 0;
      const h = (value / maxValue) * chart.h;
      const x = groupX - totalBarsW / 2 + seriesIdx * (barW + barGap);
      const y = baseline - h;
      const highlighted = visual.highlight?.category === category && visual.highlight?.series === entry.name;
      const fill = seriesColor(entry, seriesIdx, highlighted);
      rect(canvas, rc, x, y, barW, h, {
        fill,
        stroke: highlighted ? colors.red : "#39434d",
        strokeWidth: highlighted ? 3.4 : 2,
        fillStyle: highlighted ? "cross-hatch" : "hachure",
        hachureGap: highlighted ? 7 : 10,
        seed: 760 + categoryIdx * 10 + seriesIdx,
      });
      canvas.add(svgText(x + barW / 2, y - 18, value.toFixed(value % 1 ? 1 : 0), { size: 18, weight: highlighted ? 900 : 700, fill: highlighted ? colors.red : colors.ink }));
    });
    canvas.add(svgText(groupX, baseline + 42, category, { size: 21, weight: 650, fill: colors.ink }));
  });

  series.forEach((entry, idx) => {
    const x = 1220;
    const y = 295 + idx * 54;
    rect(canvas, rc, x, y - 18, 46, 28, { fill: seriesColor(entry, idx, false), stroke: "#39434d", seed: 820 + idx });
    canvas.add(svgText(x + 62, y + 4, entry.name, { size: 22, weight: 700, anchor: "start", fill: colors.ink }));
  });
  pathRough(canvas, rc, "M 1188 470 C 1320 420 1435 462 1450 566 C 1462 666 1328 724 1205 666 C 1098 614 1100 514 1188 470 Z", {
    fill: "#fff8df",
    stroke: colors.red,
    strokeWidth: 2.5,
    fillStyle: "zigzag",
    hachureGap: 13,
    seed: 840,
  });
  canvas.add(svgText(1320, 532, "跨模型收益", { size: 29, weight: 900, fill: colors.red }));
  canvas.add(svgText(1320, 594, wrapCjk(visual.annotation || "", 10), { size: 21, weight: 600, fill: colors.ink, lineHeight: 26 }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"));
}

function drawArchiveEvolutionTree(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(202);
  const canvas = createCanvas();
  const pos = {
    0: [270, 260],
    6: [185, 410],
    12: [425, 405],
    24: [250, 560],
    31: [560, 548],
    44: [405, 675],
    56: [730, 650],
    79: [600, 765],
  };
  const visual = spec.visual_spec || {};
  const mainPath = findPathToHighlight(visual.edges || [], visual.highlight || "79");
  (visual.edges || []).forEach(([from, to], i) => {
    const a = pos[from];
    const b = pos[to];
    if (!a || !b) return;
    curve(canvas, rc, a[0], a[1] + 42, b[0], b[1] - 46, (i % 2 ? 20 : -16), {
      arrow: true,
      stroke: to === visual.highlight ? colors.red : "#39434d",
      strokeWidth: to === visual.highlight ? 3.2 : 2.4,
      seed: 210 + i,
    });
  });
  Object.entries(pos).forEach(([id, [x, y]], i) => {
    const isHighlight = id === visual.highlight;
    ellipse(canvas, rc, x, y, isHighlight ? 132 : 104, isHighlight ? 86 : 70, {
      fill: isHighlight ? colors.pink : (i % 2 ? colors.blue : colors.gray),
      stroke: isHighlight ? colors.red : colors.ink,
      strokeWidth: isHighlight ? 3.5 : 2.3,
      fillStyle: isHighlight ? "cross-hatch" : "hachure",
      hachureGap: isHighlight ? 7 : 9,
      seed: 240 + i,
    });
    canvas.add(svgText(x, y - 4, `#${id}`, { size: isHighlight ? 26 : 22, weight: 800 }));
    canvas.add(svgText(x, y + 25, visual.labels?.[id] || "", { size: isHighlight ? 28 : 23, weight: 800, fill: isHighlight ? colors.red : colors.muted }));
  });
  pathRough(canvas, rc, "M 852 282 C 1008 230 1218 264 1330 348 C 1434 426 1415 568 1290 654 C 1148 750 925 724 810 640 C 690 552 710 332 852 282 Z", {
    fill: "#fff8df",
    stroke: colors.red,
    strokeWidth: 2.6,
    fillStyle: "zigzag",
    hachureGap: 14,
    roughness: 2,
    seed: 301,
  });
  canvas.add(svgText(1080, 365, "Archive 不是 cache", { size: 32, weight: 900, fill: colors.red }));
  canvas.add(svgText(1080, 420, "它让低分旧分支\n仍有机会被选中", { size: 30, weight: 700 }));
  const scorePath = mainPath.length
    ? mainPath.map((id) => visual.labels?.[id]).filter(Boolean).join(" → ")
    : Object.values(visual.labels || {}).slice(0, 5).join(" → ");
  canvas.add(svgText(1080, 510, scorePath, { size: 27, weight: 800 }));
  canvas.add(svgText(910, 602, wrapCjk(visual.annotation || "", 22).slice(0, 2), { size: 24, fill: colors.muted, weight: 500, anchor: "start" }));
  line(canvas, rc, 830, 655, 645, 745, { arrow: true, stroke: colors.red, strokeWidth: 3, seed: 330 });
  canvas.add(`<path d="M544 724 C593 702 645 707 682 740" fill="none" stroke="${colors.red}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`);
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"));
}

function findPathToHighlight(edges, highlight) {
  if (!edges.length || !highlight) return [];
  const childrenByParent = new Map();
  const children = new Set();
  for (const [from, to] of edges) {
    if (!childrenByParent.has(from)) childrenByParent.set(from, []);
    childrenByParent.get(from).push(to);
    children.add(to);
  }
  const roots = [...childrenByParent.keys()].filter((node) => !children.has(node));
  for (const root of roots) {
    const found = dfsPath(root, highlight, childrenByParent, new Set());
    if (found.length) return found;
  }
  return [];
}

function dfsPath(node, highlight, childrenByParent, seen) {
  if (node === highlight) return [node];
  if (seen.has(node)) return [];
  seen.add(node);
  for (const child of childrenByParent.get(node) || []) {
    const childPath = dfsPath(child, highlight, childrenByParent, seen);
    if (childPath.length) return [node, ...childPath];
  }
  return [];
}

function drawSelfImprovementLoop(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(303);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const center = [800, 480];
  const angles = [-92, -20, 55, 128, 205].map((deg) => (deg * Math.PI) / 180);
  const steps = (visual.steps || []).slice(0, 5).map((step, i) => ({
    ...step,
    x: center[0] + Math.cos(angles[i]) * 430,
    y: center[1] + Math.sin(angles[i]) * 250,
  }));
  for (let i = 0; i < steps.length; i += 1) {
    const a = steps[i];
    const b = steps[(i + 1) % steps.length];
    curve(canvas, rc, a.x, a.y, b.x, b.y, i === steps.length - 1 ? -70 : 18, {
      arrow: true,
      stroke: b.id === visual.highlight ? colors.red : "#333d47",
      strokeWidth: b.id === visual.highlight ? 3.1 : 2.4,
      seed: 350 + i,
    });
  }
  ellipse(canvas, rc, center[0], center[1], 300, 150, { fill: colors.yellow, stroke: colors.red, strokeWidth: 3.4, fillStyle: "cross-hatch", hachureGap: 12, seed: 370 });
  canvas.add(svgText(center[0], center[1] - 8, "Self-improving", { size: 31, weight: 900, fill: colors.red }));
  canvas.add(svgText(center[0], center[1] + 32, "Agent", { size: 34, weight: 900 }));
  steps.forEach((step, i) => {
    const highlighted = step.id === visual.highlight;
    rect(canvas, rc, step.x - 132, step.y - 52, 264, 104, {
      fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray, colors.pink][i],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.3 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      hachureGap: highlighted ? 8 : 11,
      roughness: 2,
      seed: 380 + i,
    });
    canvas.add(svgText(step.x, step.y - 10, step.label, { size: 27, weight: 850, fill: highlighted ? colors.red : colors.ink }));
    canvas.add(svgText(step.x, step.y + 28, wrapCjk(step.note, 10), { size: 19, weight: 500, fill: colors.muted, lineHeight: 22 }));
  });
  canvas.add(`<path d="M438 729 C612 835 938 842 1158 710" fill="none" stroke="${colors.red}" stroke-width="5" stroke-linecap="round" stroke-dasharray="18 13" opacity="0.78"/>`);
  canvas.add(svgText(800, 825, "评测结果回到 Archive，再选择下一代 parent", { size: 26, weight: 800, fill: colors.red }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"));
}

function drawHorizontalSequence(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(404);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const steps = (visual.steps || []).slice(0, 6);
  const startX = 150;
  const y = 455;
  const gap = 32;
  const stepW = Math.min(220, (1300 - gap * Math.max(steps.length - 1, 0)) / Math.max(steps.length, 1));
  const palette = [colors.blue, colors.warm, colors.green, colors.yellow, colors.pink, colors.gray];

  canvas.add(`<path d="M120 454 C390 421 665 487 913 445 S1280 428 1460 470" fill="none" stroke="${colors.red}" stroke-width="5" stroke-linecap="round" stroke-dasharray="18 13" opacity="0.35"/>`);
  steps.forEach((step, i) => {
    const x = startX + i * (stepW + gap);
    const highlighted = step.id === visual.highlight;
    rect(canvas, rc, x, y - 86, stepW, 172, {
      fill: highlighted ? colors.pink : palette[i % palette.length],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.4 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      hachureGap: highlighted ? 8 : 11,
      seed: 430 + i,
    });
    ellipse(canvas, rc, x + 24, y - 70, 44, 34, { fill: highlighted ? colors.red : "#ffffff", stroke: highlighted ? colors.red : colors.ink, seed: 450 + i });
    canvas.add(svgText(x + 24, y - 61, String(i + 1), { size: 18, weight: 900, fill: highlighted ? "#ffffff" : colors.ink }));
    canvas.add(svgText(x + stepW / 2, y - 16, step.label, { size: 26, weight: 850, fill: highlighted ? colors.red : colors.ink }));
    canvas.add(svgText(x + stepW / 2, y + 28, wrapCjk(step.note, 9), { size: 19, weight: 500, fill: colors.muted, lineHeight: 23 }));
    if (i < steps.length - 1) {
      curve(canvas, rc, x + stepW + 8, y, x + stepW + gap - 8, y, i % 2 ? -18 : 18, {
        arrow: true,
        stroke: highlighted ? colors.red : colors.ink,
        strokeWidth: highlighted ? 3 : 2.1,
        seed: 470 + i,
      });
    }
  });
  canvas.add(svgText(800, 725, "每一步都留下可检查证据，质量门槛前置到交付之前", { size: 25, weight: 800, fill: colors.red }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"));
}

function drawQuadrantMatrix(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(505);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const x0 = 300;
  const y0 = 200;
  const w = 900;
  const h = 560;
  const midX = x0 + w / 2;
  const midY = y0 + h / 2;
  rect(canvas, rc, x0, y0, w, h, { fill: "#ffffff", fillStyle: "hachure", hachureGap: 28, stroke: colors.ink, strokeWidth: 2.5, seed: 510 });
  line(canvas, rc, midX, y0 + 12, midX, y0 + h - 12, { stroke: "#9aa4ad", strokeWidth: 2, seed: 511 });
  line(canvas, rc, x0 + 12, midY, x0 + w - 12, midY, { stroke: "#9aa4ad", strokeWidth: 2, seed: 512 });
  line(canvas, rc, x0, y0 + h + 36, x0 + w, y0 + h + 36, { arrow: true, stroke: colors.red, strokeWidth: 2.4, seed: 513 });
  line(canvas, rc, x0 - 42, y0 + h, x0 - 42, y0, { arrow: true, stroke: colors.red, strokeWidth: 2.4, seed: 514 });

  canvas.add(svgText(x0 + w / 2, y0 + h + 76, visual.x_axis?.label || "横轴", { size: 24, weight: 800, fill: colors.red }));
  canvas.add(svgText(x0 - 94, y0 + h / 2, visual.y_axis?.label || "纵轴", { size: 24, weight: 800, fill: colors.red }));
  canvas.add(svgText(x0, y0 + h + 22, visual.x_axis?.left || "低", { size: 20, anchor: "start", fill: colors.muted }));
  canvas.add(svgText(x0 + w, y0 + h + 22, visual.x_axis?.right || "高", { size: 20, anchor: "end", fill: colors.muted }));
  canvas.add(svgText(x0 - 58, y0 + h, visual.y_axis?.bottom || "低", { size: 20, anchor: "end", fill: colors.muted }));
  canvas.add(svgText(x0 - 58, y0, visual.y_axis?.top || "高", { size: 20, anchor: "end", fill: colors.muted }));

  (visual.items || []).slice(0, 8).forEach((item, i) => {
    const px = x0 + Math.max(0.06, Math.min(0.94, Number(item.x) || 0.5)) * w;
    const py = y0 + (1 - Math.max(0.06, Math.min(0.94, Number(item.y) || 0.5))) * h;
    const highlighted = item.label === visual.highlight || item.id === visual.highlight;
    ellipse(canvas, rc, px, py, highlighted ? 190 : 170, highlighted ? 96 : 84, {
      fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray][i % 4],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.5 : 2.3,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 530 + i,
    });
    canvas.add(svgText(px, py - 8, item.label, { size: 25, weight: 850, fill: highlighted ? colors.red : colors.ink }));
    canvas.add(svgText(px, py + 25, wrapCjk(item.note || "", 8), { size: 17, fill: colors.muted, lineHeight: 20 }));
  });
  canvas.add(svgText(1130, 170, "先定位关系，再选渲染器", { size: 24, weight: 800, fill: colors.red, anchor: "end" }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"));
}

function drawHubSpokeNetwork(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(606);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const hub = visual.hub || { id: "hub", label: "中心" };
  const nodes = (visual.nodes || []).slice(0, 7);
  const center = [800, 475];
  const radiusX = 455;
  const radiusY = 245;
  const positions = new Map([[hub.id, center]]);
  nodes.forEach((node, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(nodes.length, 1);
    positions.set(node.id, [center[0] + Math.cos(angle) * radiusX, center[1] + Math.sin(angle) * radiusY]);
  });

  (visual.edges || []).forEach(([from, to], i) => {
    const a = positions.get(from);
    const b = positions.get(to);
    if (!a || !b) return;
    const isCross = from !== hub.id && to !== hub.id;
    curve(canvas, rc, a[0], a[1], b[0], b[1], isCross ? 38 : 0, {
      arrow: true,
      stroke: to === visual.highlight || from === visual.highlight ? colors.red : (isCross ? colors.muted : colors.ink),
      strokeWidth: isCross ? 1.8 : 2.4,
      seed: 620 + i,
    });
  });

  ellipse(canvas, rc, center[0], center[1], 250, 142, { fill: colors.yellow, stroke: colors.red, strokeWidth: 3.5, fillStyle: "cross-hatch", seed: 650 });
  canvas.add(svgText(center[0], center[1] + 8, hub.label, { size: 36, weight: 900, fill: colors.red }));

  nodes.forEach((node, i) => {
    const [x, y] = positions.get(node.id);
    const highlighted = node.id === visual.highlight || node.label === visual.highlight;
    rect(canvas, rc, x - 115, y - 55, 230, 110, {
      fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray, colors.yellow][i % 5],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.3 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 660 + i,
    });
    canvas.add(svgText(x, y - 10, node.label, { size: 24, weight: 850, fill: highlighted ? colors.red : colors.ink }));
    canvas.add(svgText(x, y + 25, wrapCjk(node.note || "", 8), { size: 17, fill: colors.muted, lineHeight: 20 }));
  });
  canvas.add(`<path d="M250 720 C505 795 1040 800 1345 708" fill="none" stroke="${colors.red}" stroke-width="4" stroke-linecap="round" stroke-dasharray="16 12" opacity="0.45"/>`);
  canvas.add(svgText(800, 785, "网络图只用于真正的多实体协同，不替代层级或流程", { size: 24, weight: 800, fill: colors.red }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"));
}

function createHandDrawnDiagramSvg(spec, options = {}) {
  validateHandDrawnDiagramSpec(spec);
  const template = spec.template || spec.intent;
  if (template === "grouped_bar_chart") return drawGroupedBarChart(spec, options);
  if (template === "layered_architecture") return drawLayeredArchitecture(spec, options);
  if (template === "tree") return drawArchiveEvolutionTree(spec, options);
  if (template === "closed_loop") return drawSelfImprovementLoop(spec, options);
  if (template === "horizontal_sequence") return drawHorizontalSequence(spec, options);
  if (template === "quadrant_matrix") return drawQuadrantMatrix(spec, options);
  if (template === "hub_spoke_network") return drawHubSpokeNetwork(spec, options);
  throw new Error(`Unsupported hand-drawn diagram template: ${template}`);
}

function validateHandDrawnDiagramSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") {
    throw new Error("Diagram spec must be an object.");
  }
  for (const field of ["id", "title", "claim", "intent", "template"]) {
    if (!safeText(spec[field])) errors.push(`Missing required field: ${field}`);
  }
  const validIntents = new Set(["Quantity", "Sequence", "Loop", "Hierarchy", "Matrix", "Network"]);
  if (spec.intent && !validIntents.has(spec.intent)) errors.push(`Unsupported intent: ${spec.intent}`);
  const visual = spec.visual_spec;
  if (!visual || typeof visual !== "object") errors.push("Missing required object: visual_spec");

  if (visual && spec.template === "layered_architecture") {
    if (!Array.isArray(visual.layers) || visual.layers.length < 3) errors.push("layered_architecture requires at least three visual_spec.layers.");
    if (!Array.isArray(visual.edges) || !visual.edges.length) errors.push("layered_architecture requires visual_spec.edges.");
    if (!Array.isArray(visual.side_modules)) errors.push("layered_architecture requires visual_spec.side_modules.");
  }

  if (visual && spec.template === "grouped_bar_chart") {
    if (!Array.isArray(visual.categories) || visual.categories.length < 1) errors.push("grouped_bar_chart requires visual_spec.categories.");
    if (!Array.isArray(visual.series) || visual.series.length < 1) errors.push("grouped_bar_chart requires visual_spec.series.");
    if (Array.isArray(visual.series)) {
      visual.series.forEach((entry, idx) => {
        if (!safeText(entry.name)) errors.push(`grouped_bar_chart series ${idx + 1} missing name.`);
        if (!Array.isArray(entry.values)) errors.push(`grouped_bar_chart series ${idx + 1} missing values.`);
        if (Array.isArray(entry.values) && Array.isArray(visual.categories) && entry.values.length !== visual.categories.length) {
          errors.push(`grouped_bar_chart series ${idx + 1} values must match category count.`);
        }
      });
    }
  }

  if (visual && spec.template === "tree") {
    if (!Array.isArray(visual.nodes) || visual.nodes.length < 2) errors.push("tree requires at least two visual_spec.nodes.");
    if (!Array.isArray(visual.edges) || !visual.edges.length) errors.push("tree requires visual_spec.edges.");
    if (!visual.labels || typeof visual.labels !== "object") errors.push("tree requires visual_spec.labels.");
    if (!safeText(visual.highlight)) errors.push("tree requires visual_spec.highlight.");
    if (Array.isArray(visual.nodes) && visual.labels) {
      const unlabeled = visual.nodes.filter((node) => !safeText(visual.labels[node]));
      if (unlabeled.length) errors.push(`tree labels missing for nodes: ${unlabeled.join(", ")}`);
    }
  }

  if (visual && spec.template === "closed_loop") {
    if (!Array.isArray(visual.steps) || visual.steps.length < 3) errors.push("closed_loop requires at least three visual_spec.steps.");
    if (!safeText(visual.center)) errors.push("closed_loop requires visual_spec.center.");
    if (Array.isArray(visual.steps)) {
      visual.steps.forEach((step, idx) => {
        if (!safeText(step.id)) errors.push(`closed_loop step ${idx + 1} missing id.`);
        if (!safeText(step.label)) errors.push(`closed_loop step ${idx + 1} missing label.`);
      });
    }
  }

  if (visual && spec.template === "horizontal_sequence") {
    if (!Array.isArray(visual.steps) || visual.steps.length < 2) errors.push("horizontal_sequence requires at least two visual_spec.steps.");
    if (Array.isArray(visual.steps)) {
      visual.steps.forEach((step, idx) => {
        if (!safeText(step.id)) errors.push(`horizontal_sequence step ${idx + 1} missing id.`);
        if (!safeText(step.label)) errors.push(`horizontal_sequence step ${idx + 1} missing label.`);
      });
    }
  }

  if (visual && spec.template === "quadrant_matrix") {
    if (!visual.x_axis || typeof visual.x_axis !== "object") errors.push("quadrant_matrix requires visual_spec.x_axis.");
    if (!visual.y_axis || typeof visual.y_axis !== "object") errors.push("quadrant_matrix requires visual_spec.y_axis.");
    if (!Array.isArray(visual.items) || visual.items.length < 2) errors.push("quadrant_matrix requires at least two visual_spec.items.");
    if (Array.isArray(visual.items)) {
      visual.items.forEach((item, idx) => {
        if (!safeText(item.label)) errors.push(`quadrant_matrix item ${idx + 1} missing label.`);
        if (typeof item.x !== "number" || typeof item.y !== "number") errors.push(`quadrant_matrix item ${idx + 1} requires numeric x and y.`);
      });
    }
  }

  if (visual && spec.template === "hub_spoke_network") {
    if (!visual.hub || typeof visual.hub !== "object" || !safeText(visual.hub.id) || !safeText(visual.hub.label)) errors.push("hub_spoke_network requires visual_spec.hub with id and label.");
    if (!Array.isArray(visual.nodes) || visual.nodes.length < 2) errors.push("hub_spoke_network requires at least two visual_spec.nodes.");
    if (!Array.isArray(visual.edges) || !visual.edges.length) errors.push("hub_spoke_network requires visual_spec.edges.");
    if (Array.isArray(visual.nodes)) {
      visual.nodes.forEach((node, idx) => {
        if (!safeText(node.id)) errors.push(`hub_spoke_network node ${idx + 1} missing id.`);
        if (!safeText(node.label)) errors.push(`hub_spoke_network node ${idx + 1} missing label.`);
      });
    }
  }

  if (errors.length) {
    throw new Error(`Invalid hand-drawn diagram spec "${spec.id || "(unknown)"}":\n- ${errors.join("\n- ")}`);
  }
  return true;
}

function writeHandDrawnDiagramSvg(spec, outDir, options = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = options.fileName || `${spec.id || spec.template || "diagram"}.svg`;
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, createHandDrawnDiagramSvg(spec, options), "utf8");
  return filePath;
}

function addHandDrawnDiagramSlide(pptx, spec, options = {}) {
  const outDir = options.outDir || path.join(".tmp", "hand_drawn_diagrams");
  const svgPath = writeHandDrawnDiagramSvg(spec, outDir, options);
  const slide = pptx.addSlide();
  slide.background = { color: "FFFDF7" };
  slide.addImage({
    path: svgPath,
    x: options.x ?? 0,
    y: options.y ?? 0,
    w: options.w ?? DIAGRAM_STYLE.pptW,
    h: options.h ?? DIAGRAM_STYLE.pptH,
  });
  return { slide, svgPath };
}

module.exports = {
  DIAGRAM_STYLE,
  addHandDrawnDiagramSlide,
  createHandDrawnDiagramSvg,
  validateHandDrawnDiagramSpec,
  writeHandDrawnDiagramSvg,
};
