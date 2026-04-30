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

function parseAspectRatio(value) {
  if (!value) return DIAGRAM_STYLE.width / DIAGRAM_STYLE.height;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const match = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (match) return Number(match[1]) / Number(match[2]);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  if (typeof value === "object" && value.width && value.height) return Number(value.width) / Number(value.height);
  throw new Error(`Invalid diagram aspectRatio: ${value}`);
}

function resolveCanvasOptions(options = {}) {
  const ratio = parseAspectRatio(options.aspectRatio);
  const width = Number(options.width || options.canvas?.width || DIAGRAM_STYLE.width);
  const height = Number(options.height || options.canvas?.height || Math.round(width / ratio));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Diagram canvas width and height must be positive numbers.");
  }
  return { width: Math.round(width), height: Math.round(height), ratio };
}

function scaledCanvas(options = {}) {
  const canvas = resolveCanvasOptions(options);
  return {
    ...canvas,
    sx: canvas.width / DIAGRAM_STYLE.width,
    sy: canvas.height / DIAGRAM_STYLE.height,
    x(value) {
      return value * this.sx;
    },
    y(value) {
      return value * this.sy;
    },
  };
}

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
  if (/^[\x00-\x7F]+$/.test(value)) return [value];
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
  const { width, height } = resolveCanvasOptions(options);
  const colors = DIAGRAM_STYLE.color;
  const sx = width / DIAGRAM_STYLE.width;
  const sy = height / DIAGRAM_STYLE.height;
  const scale = `transform="scale(${sx} ${sy})"`;
  const header = options.renderHeader
    ? `${svgText(90, 66, safeText(title), { size: 36, weight: 800, anchor: "start", fill: colors.red })}
${svgText(90, 112, safeText(claim), { size: 24, weight: 500, anchor: "start", fill: colors.muted })}`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${colors.paper}"/>
<g ${scale}>
<g opacity="0.48">
  <path d="M80 120 C310 86 518 111 742 89 S1205 116 1510 82" fill="none" stroke="#e8dcc9" stroke-width="2"/>
  <path d="M88 812 C358 790 606 830 894 802 S1266 788 1514 816" fill="none" stroke="#e8dcc9" stroke-width="2"/>
</g>
${header}
${body}
</g>
</svg>`;
}

function drawLayeredArchitecture(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(101);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const layers = visual.layers || [];
  const centers = new Map();
  const left = 145;
  const top = 190;
  const stackW = 890;
  const stackH = 590;
  const rowGap = 18;
  const layerH = Math.max(78, (stackH - rowGap * Math.max(0, layers.length - 1)) / Math.max(1, layers.length));
  const palette = [colors.blue, colors.warm, colors.green, colors.pink, colors.yellow, colors.gray];

  layers.forEach((layer, layerIdx) => {
    const y = top + layerIdx * (layerH + rowGap);
    rect(canvas, rc, left, y, stackW, layerH, {
      fill: palette[layerIdx % palette.length],
      hachureGap: 14,
      stroke: "#364149",
      roughness: 2.1,
      seed: 20 + layerIdx,
    });
    canvas.add(svgText(left - 34, y + layerH / 2 + 8, layer.label || layer.id, {
      size: 22,
      fill: colors.red,
      weight: 750,
    }));

    const items = layer.items || [];
    const itemGap = 24;
    const itemW = Math.min(210, (stackW - 80 - itemGap * Math.max(0, items.length - 1)) / Math.max(1, items.length));
    const itemH = Math.min(66, layerH - 28);
    const totalW = items.length * itemW + itemGap * Math.max(0, items.length - 1);
    const startX = left + stackW / 2 - totalW / 2;
    items.forEach((label, itemIdx) => {
      const x = startX + itemIdx * (itemW + itemGap);
      const cx = x + itemW / 2;
      const cy = y + layerH / 2;
      centers.set(label, [cx, cy]);
      rect(canvas, rc, x, cy - itemH / 2, itemW, itemH, {
        fill: "#ffffff",
        fillStyle: itemIdx % 2 ? "hachure" : "zigzag",
        seed: 40 + layerIdx * 10 + itemIdx,
      });
      canvas.add(svgText(cx, cy + 7, wrapCjk(label, Math.max(7, Math.floor(itemW / 18))).slice(0, 2), {
        size: itemW < 140 ? 20 : 23,
        weight: 750,
        lineHeight: 24,
      }));
    });
  });

  const sideModules = visual.side_modules || [];
  if (sideModules.length) {
    const sideX = 1120;
    const sideY = 210;
    const sideW = 340;
    const sideH = 540;
    rect(canvas, rc, sideX - 30, sideY - 30, sideW + 60, sideH + 60, {
      fill: "#f8f8f8",
      fillStyle: "cross-hatch",
      hachureGap: 18,
      stroke: "#444",
      roughness: 2.2,
      seed: 130,
    });
    canvas.add(svgText(sideX + sideW / 2, sideY - 58, visual.side_label || "侧向能力", { size: 27, weight: 800, fill: colors.red }));
    const gap = Math.max(18, (sideH - sideModules.length * 72) / Math.max(1, sideModules.length - 1));
    sideModules.forEach((label, i) => {
      const y = sideY + 36 + i * (72 + gap);
      centers.set(label, [sideX + sideW / 2, y]);
      ellipse(canvas, rc, sideX + sideW / 2, y, 230, 70, {
        fill: palette[(i + 1) % palette.length],
        hachureAngle: -45 + i * 15,
        seed: 140 + i,
      });
      canvas.add(svgText(sideX + sideW / 2, y + 8, wrapCjk(label, 10).slice(0, 2), { size: 22, weight: 700, lineHeight: 25 }));
      const target = [...centers.values()][Math.min(i, Math.max(0, centers.size - 1))];
      if (target) line(canvas, rc, target[0] + 86, target[1], sideX + 36, y, { arrow: true, stroke: colors.muted, strokeWidth: 1.8, seed: 160 + i });
    });
  }

  (visual.edges || []).forEach(([from, to], i) => {
    const a = centers.get(from);
    const b = centers.get(to);
    if (!a || !b) return;
    const vertical = Math.abs(a[0] - b[0]) < 12;
    const fromSide = sideModules.includes(from);
    const toSide = sideModules.includes(to);
    curve(canvas, rc, a[0], a[1] + (fromSide ? 0 : 32), b[0], b[1] - (toSide ? 0 : 32), vertical ? 0 : (i % 3 - 1) * 12, {
      arrow: true,
      stroke: i >= Math.floor((visual.edges || []).length * 0.55) ? colors.red : colors.ink,
      strokeWidth: i >= Math.floor((visual.edges || []).length * 0.55) ? 2.7 : 2.1,
      seed: 90 + i,
    });
  });

  canvas.add(`<path d="M1060 180 C1035 320 1040 594 1072 770" fill="none" stroke="${colors.red}" stroke-width="4" stroke-linecap="round" stroke-dasharray="14 12" opacity="0.55"/>`);
  canvas.add(svgText(1088, 792, visual.summary || "分层协同", { size: 24, weight: 800, fill: colors.red, anchor: "start" }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawGroupedBarChart(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(707);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const categories = visual.categories || [];
  const series = visual.series || [];
  const values = series.flatMap((item) => item.values || []).map(Number).filter(Number.isFinite);
  const maxValue = Math.max(10, Math.ceil(Math.max(...values, 1) / 10) * 10);
  const chart = { x: 170, y: 220, w: series.length > 3 ? 880 : 950, h: 520 };
  const baseline = chart.y + chart.h;
  const groupW = chart.w / Math.max(categories.length, 1);
  const barGap = Math.max(5, Math.min(12, 42 / Math.max(1, series.length)));
  const barW = Math.max(12, Math.min(62, (groupW - 34 - barGap * Math.max(series.length - 1, 0)) / Math.max(series.length, 1)));

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
    canvas.add(svgText(groupX, baseline + 42, wrapCjk(category, 6).slice(0, 2), { size: categories.length > 6 ? 18 : 21, weight: 650, fill: colors.ink, lineHeight: 21 }));
  });

  series.forEach((entry, idx) => {
    const x = series.length > 3 ? 1130 : 1220;
    const y = 252 + idx * Math.max(40, Math.min(54, 260 / Math.max(1, series.length)));
    rect(canvas, rc, x, y - 18, 46, 28, { fill: seriesColor(entry, idx, false), stroke: "#39434d", seed: 820 + idx });
    canvas.add(svgText(x + 62, y + 4, wrapCjk(entry.name, 10).slice(0, 2), { size: series.length > 4 ? 18 : 22, weight: 700, anchor: "start", fill: colors.ink, lineHeight: 22 }));
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
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawLineChart(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(708);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const categories = visual.categories || [];
  const series = visual.series || [];
  const values = series.flatMap((item) => item.values || []).map(Number).filter(Number.isFinite);
  const maxValue = Math.max(10, Math.ceil(Math.max(...values, 1) / 10) * 10);
  const chart = { x: 190, y: 220, w: 980, h: 510 };
  const baseline = chart.y + chart.h;
  rect(canvas, rc, chart.x - 18, chart.y - 12, chart.w + 44, chart.h + 48, { fill: "#ffffff", fillStyle: "hachure", hachureGap: 32, stroke: "#d7d2c8", strokeWidth: 1.6, seed: 910 });
  line(canvas, rc, chart.x, chart.y, chart.x, baseline, { stroke: colors.ink, strokeWidth: 2.5, seed: 911 });
  line(canvas, rc, chart.x, baseline, chart.x + chart.w, baseline, { stroke: colors.ink, strokeWidth: 2.5, seed: 912 });
  const xFor = (idx) => chart.x + (idx / Math.max(1, categories.length - 1)) * chart.w;
  const yFor = (value) => baseline - (Number(value || 0) / maxValue) * chart.h;
  categories.forEach((category, idx) => {
    const x = xFor(idx);
    line(canvas, rc, x, baseline, x, baseline + 8, { stroke: colors.ink, strokeWidth: 1.6, seed: 920 + idx });
    canvas.add(svgText(x, baseline + 42, wrapCjk(category, 6).slice(0, 2), { size: categories.length > 6 ? 18 : 21, weight: 650, fill: colors.ink, lineHeight: 21 }));
  });
  canvas.add(svgText(chart.x + 4, chart.y - 36, visual.y_label || "Value", { size: 22, weight: 800, anchor: "start", fill: colors.red }));
  series.forEach((entry, seriesIdx) => {
    const points = (entry.values || []).map((value, idx) => [xFor(idx), yFor(value)]);
    for (let i = 0; i < points.length - 1; i += 1) {
      line(canvas, rc, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], {
        stroke: seriesIdx === 0 ? colors.red : colors.ink,
        strokeWidth: seriesIdx === 0 ? 3 : 2.3,
        seed: 940 + seriesIdx * 20 + i,
      });
    }
    points.forEach(([x, y], idx) => {
      const highlighted = visual.highlight?.category === categories[idx] && visual.highlight?.series === entry.name;
      ellipse(canvas, rc, x, y, highlighted ? 44 : 32, highlighted ? 34 : 26, {
        fill: highlighted ? colors.pink : "#ffffff",
        stroke: highlighted ? colors.red : (seriesIdx === 0 ? colors.red : colors.ink),
        strokeWidth: highlighted ? 3.2 : 2,
        seed: 980 + seriesIdx * 20 + idx,
      });
      canvas.add(svgText(x, y - 24, String(entry.values[idx]), { size: 16, weight: 700, fill: highlighted ? colors.red : colors.muted }));
    });
    const legendX = 1230;
    const legendY = 282 + seriesIdx * 52;
    line(canvas, rc, legendX, legendY, legendX + 46, legendY, { stroke: seriesIdx === 0 ? colors.red : colors.ink, strokeWidth: 3, seed: 1020 + seriesIdx });
    canvas.add(svgText(legendX + 62, legendY + 6, entry.name, { size: 22, weight: 700, anchor: "start", fill: colors.ink }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawDonutProportionChart(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(709);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const segments = visual.segments || [];
  const total = segments.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0) || 1;
  const center = [610, 480];
  let start = -Math.PI / 2;
  segments.forEach((segment, idx) => {
    const value = Math.max(0, Number(segment.value) || 0);
    const end = start + (value / total) * Math.PI * 2;
    const large = end - start > Math.PI ? 1 : 0;
    const rOuter = segment.label === visual.highlight ? 214 : 198;
    const rInner = 104;
    const p1 = [center[0] + Math.cos(start) * rOuter, center[1] + Math.sin(start) * rOuter];
    const p2 = [center[0] + Math.cos(end) * rOuter, center[1] + Math.sin(end) * rOuter];
    const p3 = [center[0] + Math.cos(end) * rInner, center[1] + Math.sin(end) * rInner];
    const p4 = [center[0] + Math.cos(start) * rInner, center[1] + Math.sin(start) * rInner];
    const fill = [colors.blue, colors.green, colors.warm, colors.pink, colors.yellow, colors.gray][idx % 6];
    pathRough(canvas, rc, `M ${p1[0]} ${p1[1]} A ${rOuter} ${rOuter} 0 ${large} 1 ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]} A ${rInner} ${rInner} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`, {
      fill: segment.label === visual.highlight ? colors.pink : fill,
      stroke: segment.label === visual.highlight ? colors.red : colors.ink,
      strokeWidth: segment.label === visual.highlight ? 3.4 : 2.1,
      fillStyle: segment.label === visual.highlight ? "cross-hatch" : "hachure",
      seed: 1040 + idx,
    });
    const mid = (start + end) / 2;
    const lx = center[0] + Math.cos(mid) * 285;
    const ly = center[1] + Math.sin(mid) * 210;
    canvas.add(svgText(lx, ly, [`${segment.label}`, `${segment.value}`], { size: 23, weight: segment.label === visual.highlight ? 900 : 700, fill: segment.label === visual.highlight ? colors.red : colors.ink, lineHeight: 28 }));
    start = end;
  });
  ellipse(canvas, rc, center[0], center[1], 180, 120, { fill: "#fffdf7", stroke: colors.red, strokeWidth: 2.5, seed: 1080 });
  canvas.add(svgText(center[0], center[1] + 8, wrapCjk(visual.total_label || "合计", 8).slice(0, 2), { size: 28, weight: 900, fill: colors.red, lineHeight: 32 }));
  pathRough(canvas, rc, "M 1005 308 C 1188 246 1376 312 1412 458 C 1448 607 1305 704 1116 672 C 974 648 908 426 1005 308 Z", { fill: "#fff8df", stroke: colors.red, strokeWidth: 2.4, fillStyle: "zigzag", seed: 1090 });
  canvas.add(svgText(1190, 438, "比例关系", { size: 31, weight: 900, fill: colors.red }));
  canvas.add(svgText(1190, 504, "用面积/角度强调\n份额结构", { size: 26, weight: 700, lineHeight: 34 }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawHeatmap(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(710);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const rows = visual.rows || [];
  const columns = visual.columns || [];
  const values = visual.values || [];
  const numericValues = values.flat().map(Number).filter(Number.isFinite);
  const max = Math.max(...numericValues, 1);
  const min = Math.min(...numericValues, 0);
  const grid = { x: 330, y: 220, w: 820, h: 500 };
  const cellW = grid.w / Math.max(1, columns.length);
  const cellH = grid.h / Math.max(1, rows.length);
  columns.forEach((column, idx) => canvas.add(svgText(grid.x + idx * cellW + cellW / 2, grid.y - 30, wrapCjk(column, 8).slice(0, 2), { size: 22, weight: 800, fill: colors.red, lineHeight: 24 })));
  rows.forEach((row, rowIdx) => {
    canvas.add(svgText(grid.x - 28, grid.y + rowIdx * cellH + cellH / 2 + 8, wrapCjk(row, 8).slice(0, 2), { size: 22, weight: 800, fill: colors.ink, anchor: "end", lineHeight: 24 }));
    columns.forEach((column, colIdx) => {
      const value = Number(values[rowIdx]?.[colIdx]) || 0;
      const t = max === min ? 0.5 : (value - min) / (max - min);
      const highlighted = visual.highlight?.row === row && visual.highlight?.column === column;
      const fill = t > 0.66 ? colors.pink : t > 0.33 ? colors.warm : colors.blue;
      rect(canvas, rc, grid.x + colIdx * cellW, grid.y + rowIdx * cellH, cellW - 10, cellH - 10, {
        fill: highlighted ? colors.pink : fill,
        stroke: highlighted ? colors.red : colors.ink,
        strokeWidth: highlighted ? 3.2 : 1.8,
        fillStyle: highlighted ? "cross-hatch" : "hachure",
        seed: 1120 + rowIdx * 20 + colIdx,
      });
      canvas.add(svgText(grid.x + colIdx * cellW + cellW / 2 - 5, grid.y + rowIdx * cellH + cellH / 2 + 8, String(value), { size: 24, weight: 850, fill: highlighted ? colors.red : colors.ink }));
    });
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawArchiveEvolutionTree(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(202);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const pos = layoutTree(visual.nodes || [], visual.edges || []);
  const mainPath = findPathToHighlight(visual.edges || [], visual.highlight);
  (visual.edges || []).forEach(([from, to], i) => {
    const a = pos.get(from);
    const b = pos.get(to);
    if (!a || !b) return;
    curve(canvas, rc, a[0], a[1] + 42, b[0], b[1] - 46, (i % 2 ? 20 : -16), {
      arrow: true,
      stroke: to === visual.highlight ? colors.red : "#39434d",
      strokeWidth: to === visual.highlight ? 3.2 : 2.4,
      seed: 210 + i,
    });
  });
  (visual.nodes || []).forEach((id, i) => {
    const [x, y] = pos.get(id);
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
  pathRough(canvas, rc, "M 920 282 C 1070 230 1255 264 1370 348 C 1470 426 1452 568 1325 654 C 1188 750 978 724 872 640 C 760 552 785 332 920 282 Z", {
    fill: "#fff8df",
    stroke: colors.red,
    strokeWidth: 2.6,
    fillStyle: "zigzag",
    hachureGap: 14,
    roughness: 2,
    seed: 301,
  });
  canvas.add(svgText(1130, 365, visual.callout_title || "分支保留策略", { size: 32, weight: 900, fill: colors.red }));
  canvas.add(svgText(1130, 420, wrapCjk(visual.callout || "弱分支仍可能成为高分路径", 12).slice(0, 2), { size: 29, weight: 700, lineHeight: 36 }));
  const scorePath = mainPath.length
    ? mainPath.map((id) => visual.labels?.[id]).filter(Boolean).join(" → ")
    : Object.values(visual.labels || {}).join(" → ");
  canvas.add(svgText(1130, 510, wrapCjk(scorePath, 18).slice(0, 3), { size: 25, weight: 800, lineHeight: 31 }));
  canvas.add(svgText(960, 622, wrapCjk(visual.annotation || "", 22).slice(0, 3), { size: 23, fill: colors.muted, weight: 500, anchor: "start", lineHeight: 28 }));
  const highlightPos = pos.get(visual.highlight);
  if (highlightPos) line(canvas, rc, 900, 655, highlightPos[0] + 52, highlightPos[1] - 16, { arrow: true, stroke: colors.red, strokeWidth: 3, seed: 330 });
  if (highlightPos) canvas.add(`<path d="M${highlightPos[0] - 56} ${highlightPos[1] + 42} C${highlightPos[0] - 5} ${highlightPos[1] + 20} ${highlightPos[0] + 45} ${highlightPos[1] + 24} ${highlightPos[0] + 84} ${highlightPos[1] + 55}" fill="none" stroke="${colors.red}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`);
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function layoutTree(nodes, edges) {
  const childrenByParent = new Map();
  const childNodes = new Set();
  nodes.forEach((node) => childrenByParent.set(node, []));
  edges.forEach(([from, to]) => {
    if (!childrenByParent.has(from)) childrenByParent.set(from, []);
    childrenByParent.get(from).push(to);
    childNodes.add(to);
  });
  const roots = nodes.filter((node) => !childNodes.has(node));
  const levels = [];
  const queue = roots.length ? roots.map((node) => [node, 0]) : nodes.map((node) => [node, 0]);
  const seen = new Set();
  while (queue.length) {
    const [node, level] = queue.shift();
    if (seen.has(node)) continue;
    seen.add(node);
    if (!levels[level]) levels[level] = [];
    levels[level].push(node);
    (childrenByParent.get(node) || []).forEach((child) => queue.push([child, level + 1]));
  }
  nodes.forEach((node) => {
    if (!seen.has(node)) {
      if (!levels[0]) levels[0] = [];
      levels[0].push(node);
    }
  });
  const positions = new Map();
  const xMin = 150;
  const xMax = 780;
  const yMin = 220;
  const yMax = 770;
  levels.forEach((levelNodes, levelIdx) => {
    const y = yMin + (levelIdx / Math.max(1, levels.length - 1)) * (yMax - yMin);
    levelNodes.forEach((node, idx) => {
      const x = xMin + ((idx + 1) / (levelNodes.length + 1)) * (xMax - xMin);
      positions.set(node, [x, y]);
    });
  });
  return positions;
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
  const sourceSteps = visual.steps || [];
  const steps = sourceSteps.map((step, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(sourceSteps.length, 1);
    return {
    ...step,
    x: center[0] + Math.cos(angle) * 440,
    y: center[1] + Math.sin(angle) * 250,
  };
  });
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
  canvas.add(svgText(center[0], center[1] + 8, wrapCjk(visual.center, 12).slice(0, 2), { size: 31, weight: 900, fill: colors.red, lineHeight: 36 }));
  steps.forEach((step, i) => {
    const highlighted = step.id === visual.highlight;
    rect(canvas, rc, step.x - 132, step.y - 52, 264, 104, {
      fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray, colors.pink, colors.yellow][i % 6],
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
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawDualLoop(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(304);
  const canvas = createCanvas();
  const loops = spec.visual_spec?.loops || [];
  const centers = [[565, 480], [1015, 480]];
  loops.forEach((loopSpec, loopIdx) => {
    const center = centers[loopIdx] || [565 + loopIdx * 450, 480];
    const steps = loopSpec.steps || [];
    const highlighted = loopSpec.id === spec.visual_spec?.highlight;
    ellipse(canvas, rc, center[0], center[1], 330, 210, { fill: highlighted ? colors.pink : [colors.blue, colors.warm][loopIdx % 2], stroke: highlighted ? colors.red : colors.ink, strokeWidth: highlighted ? 3.4 : 2.4, seed: 1360 + loopIdx });
    canvas.add(svgText(center[0], center[1] - 10, loopSpec.label, { size: 30, weight: 900, fill: highlighted ? colors.red : colors.ink }));
    steps.forEach((step, i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, steps.length);
      const x = center[0] + Math.cos(angle) * 180;
      const y = center[1] + Math.sin(angle) * 125;
      ellipse(canvas, rc, x, y, 96, 50, { fill: "#ffffff", stroke: highlighted ? colors.red : colors.ink, seed: 1380 + loopIdx * 20 + i });
      canvas.add(svgText(x, y + 7, wrapCjk(step.label, 6).slice(0, 2), { size: 18, weight: 800, lineHeight: 20 }));
    });
  });
  line(canvas, rc, 742, 480, 838, 480, { arrow: true, stroke: colors.red, strokeWidth: 3.2, seed: 1400 });
  line(canvas, rc, 838, 535, 742, 535, { arrow: true, stroke: colors.muted, strokeWidth: 2.2, seed: 1401 });
  canvas.add(svgText(790, 448, "互相校准", { size: 23, weight: 900, fill: colors.red }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawSpiralIterationLadder(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(305);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const steps = visual.steps || [];
  let last = null;
  steps.forEach((step, i) => {
    const t = i / Math.max(1, steps.length - 1);
    const x = 260 + t * 1020;
    const y = 700 - t * 420 + Math.sin(i * 1.2) * 70;
    const highlighted = step.id === visual.highlight;
    if (last) curve(canvas, rc, last[0], last[1], x, y, i % 2 ? -42 : 42, { arrow: true, stroke: highlighted ? colors.red : colors.ink, strokeWidth: highlighted ? 3 : 2.1, seed: 1420 + i });
    ellipse(canvas, rc, x, y, highlighted ? 146 : 124, highlighted ? 84 : 70, { fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray][i % 4], stroke: highlighted ? colors.red : colors.ink, strokeWidth: highlighted ? 3.3 : 2.2, seed: 1440 + i });
    canvas.add(svgText(x, y - 4, wrapCjk(step.label, 7).slice(0, 2), { size: 23, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 25 }));
    canvas.add(svgText(x, y + 25, wrapCjk(step.note || "", 8).slice(0, 1), { size: 16, fill: colors.muted }));
    last = [x, y];
  });
  canvas.add(svgText(760, 216, visual.center || "迭代爬升", { size: 35, weight: 900, fill: colors.red }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawHorizontalSequence(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(404);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const steps = visual.steps || [];
  const startX = 120;
  const y = 455;
  const gap = Math.max(14, Math.min(32, 170 / Math.max(1, steps.length)));
  const stepW = Math.max(110, Math.min(220, (1360 - gap * Math.max(steps.length - 1, 0)) / Math.max(steps.length, 1)));
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
    canvas.add(svgText(x + stepW / 2, y - 16, wrapCjk(step.label, stepW < 140 ? 4 : 7).slice(0, 2), { size: stepW < 140 ? 20 : 26, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 24 }));
    canvas.add(svgText(x + stepW / 2, y + 28, wrapCjk(step.note, stepW < 140 ? 5 : 9).slice(0, 2), { size: stepW < 140 ? 16 : 19, weight: 500, fill: colors.muted, lineHeight: 20 }));
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
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawVerticalProcess(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(405);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const steps = visual.steps || [];
  const x = 560;
  const top = 205;
  const stepH = Math.max(78, Math.min(130, 520 / Math.max(1, steps.length)));
  const gap = Math.max(12, Math.min(28, 130 / Math.max(1, steps.length)));
  const palette = [colors.blue, colors.warm, colors.green, colors.yellow, colors.pink, colors.gray];
  steps.forEach((step, i) => {
    const y = top + i * (stepH + gap);
    const highlighted = step.id === visual.highlight;
    rect(canvas, rc, x - 230, y, 460, stepH, {
      fill: highlighted ? colors.pink : palette[i % palette.length],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.3 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 1160 + i,
    });
    ellipse(canvas, rc, x - 190, y + stepH / 2, 52, 42, { fill: highlighted ? colors.red : "#ffffff", stroke: highlighted ? colors.red : colors.ink, seed: 1180 + i });
    canvas.add(svgText(x - 190, y + stepH / 2 + 8, String(i + 1), { size: 18, weight: 900, fill: highlighted ? "#ffffff" : colors.ink }));
    canvas.add(svgText(x, y + stepH / 2 - 8, step.label, { size: 27, weight: 850, fill: highlighted ? colors.red : colors.ink }));
    canvas.add(svgText(x, y + stepH / 2 + 28, wrapCjk(step.note || step.time || "", 14).slice(0, 2), { size: 19, fill: colors.muted, lineHeight: 22 }));
    if (i < steps.length - 1) line(canvas, rc, x, y + stepH + 8, x, y + stepH + gap - 8, { arrow: true, stroke: highlighted ? colors.red : colors.ink, strokeWidth: 2.2, seed: 1200 + i });
  });
  pathRough(canvas, rc, "M 970 260 C 1140 216 1342 285 1370 446 C 1398 610 1220 724 1018 650 C 902 608 868 314 970 260 Z", { fill: "#fff8df", stroke: colors.red, strokeWidth: 2.3, fillStyle: "zigzag", seed: 1220 });
  canvas.add(svgText(1170, 430, "自上而下推进", { size: 31, weight: 900, fill: colors.red }));
  canvas.add(svgText(1170, 492, "适合阶段门\n和审批链路", { size: 25, weight: 700, lineHeight: 32 }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawTimeline(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(406);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const steps = visual.steps || [];
  const y = 470;
  const startX = 160;
  const endX = 1420;
  line(canvas, rc, startX, y, endX, y, { arrow: true, stroke: colors.red, strokeWidth: 4, seed: 1240 });
  steps.forEach((step, i) => {
    const x = startX + (i / Math.max(1, steps.length - 1)) * (endX - startX - 40);
    const highlighted = step.id === visual.highlight;
    ellipse(canvas, rc, x, y, highlighted ? 76 : 58, highlighted ? 58 : 46, { fill: highlighted ? colors.pink : "#ffffff", stroke: highlighted ? colors.red : colors.ink, strokeWidth: highlighted ? 3.2 : 2.1, seed: 1260 + i });
    canvas.add(svgText(x, y - 70, step.time || `T${i + 1}`, { size: 23, weight: 900, fill: highlighted ? colors.red : colors.ink }));
    rect(canvas, rc, x - 95, y + 52, 190, 118, { fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray][i % 4], stroke: highlighted ? colors.red : colors.ink, seed: 1280 + i });
    canvas.add(svgText(x, y + 96, wrapCjk(step.label, 7).slice(0, 2), { size: 24, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 26 }));
    canvas.add(svgText(x, y + 132, wrapCjk(step.note || "", 8).slice(0, 2), { size: 17, fill: colors.muted, lineHeight: 20 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawSwimlane(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(407);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const lanes = visual.lanes || [];
  const x0 = 170;
  const y0 = 205;
  const w = 1220;
  const laneH = Math.max(120, Math.min(170, 530 / Math.max(1, lanes.length)));
  lanes.forEach((lane, laneIdx) => {
    const y = y0 + laneIdx * laneH;
    rect(canvas, rc, x0, y, w, laneH - 12, { fill: [colors.blue, colors.green, colors.warm, colors.gray][laneIdx % 4], stroke: "#d7d2c8", strokeWidth: 1.6, hachureGap: 26, seed: 1300 + laneIdx });
    canvas.add(svgText(x0 + 70, y + laneH / 2, lane.label, { size: 25, weight: 900, fill: colors.red }));
    const laneSteps = lane.steps || [];
    const slotW = (w - 190) / Math.max(1, laneSteps.length);
    laneSteps.forEach((step, stepIdx) => {
      const cx = x0 + 170 + stepIdx * slotW + slotW / 2;
      const cy = y + laneH / 2;
      const highlighted = step.id === visual.highlight;
      rect(canvas, rc, cx - 95, cy - 42, 190, 84, { fill: highlighted ? colors.pink : "#ffffff", stroke: highlighted ? colors.red : colors.ink, strokeWidth: highlighted ? 3.1 : 2, seed: 1320 + laneIdx * 20 + stepIdx });
      canvas.add(svgText(cx, cy + 8, wrapCjk(step.label, 8).slice(0, 2), { size: 22, weight: 800, fill: highlighted ? colors.red : colors.ink, lineHeight: 24 }));
      if (stepIdx < laneSteps.length - 1) line(canvas, rc, cx + 100, cy, cx + slotW - 100, cy, { arrow: true, stroke: colors.ink, strokeWidth: 2, seed: 1340 + laneIdx * 20 + stepIdx });
    });
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
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

  (visual.items || []).forEach((item, i) => {
    const px = x0 + Math.max(0.06, Math.min(0.94, Number(item.x) || 0.5)) * w;
    const py = y0 + (1 - Math.max(0.06, Math.min(0.94, Number(item.y) || 0.5))) * h;
    const highlighted = item.label === visual.highlight || item.id === visual.highlight;
    const itemW = visual.items.length > 8 ? 140 : 170;
    ellipse(canvas, rc, px, py, highlighted ? itemW + 24 : itemW, highlighted ? 86 : 74, {
      fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray][i % 4],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.5 : 2.3,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 530 + i,
    });
    canvas.add(svgText(px, py - 8, wrapCjk(item.label, visual.items.length > 8 ? 5 : 8).slice(0, 2), { size: visual.items.length > 8 ? 20 : 25, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 22 }));
    canvas.add(svgText(px, py + 25, wrapCjk(item.note || "", 8).slice(0, 2), { size: 17, fill: colors.muted, lineHeight: 20 }));
  });
  canvas.add(svgText(1130, 170, "先定位关系，再选渲染器", { size: 24, weight: 800, fill: colors.red, anchor: "end" }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawMatrixGrid(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(506);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const rows = visual.rows || [];
  const columns = visual.columns || [];
  const values = visual.values || [];
  const grid = { x: 310, y: 220, w: 900, h: 500 };
  const cellW = grid.w / Math.max(1, columns.length);
  const cellH = grid.h / Math.max(1, rows.length);
  columns.forEach((column, idx) => canvas.add(svgText(grid.x + idx * cellW + cellW / 2, grid.y - 30, wrapCjk(column, 8).slice(0, 2), { size: 22, weight: 850, fill: colors.red, lineHeight: 24 })));
  rows.forEach((row, rowIdx) => {
    canvas.add(svgText(grid.x - 28, grid.y + rowIdx * cellH + cellH / 2 + 8, wrapCjk(row, 8).slice(0, 2), { size: 22, weight: 850, anchor: "end", fill: colors.ink, lineHeight: 24 }));
    columns.forEach((column, colIdx) => {
      const value = values[rowIdx]?.[colIdx] ?? "";
      const highlighted = visual.highlight?.row === row && visual.highlight?.column === column;
      rect(canvas, rc, grid.x + colIdx * cellW, grid.y + rowIdx * cellH, cellW - 10, cellH - 10, {
        fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray][(rowIdx + colIdx) % 4],
        stroke: highlighted ? colors.red : colors.ink,
        strokeWidth: highlighted ? 3.2 : 1.8,
        fillStyle: highlighted ? "cross-hatch" : "hachure",
        seed: 1460 + rowIdx * 20 + colIdx,
      });
      canvas.add(svgText(grid.x + colIdx * cellW + cellW / 2 - 5, grid.y + rowIdx * cellH + cellH / 2 + 8, wrapCjk(value, 8).slice(0, 2), { size: 22, weight: 800, fill: highlighted ? colors.red : colors.ink, lineHeight: 24 }));
    });
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawPyramidCapabilityStack(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(203);
  const canvas = createCanvas();
  const levels = spec.visual_spec?.levels || [];
  const centerX = 760;
  const top = 215;
  const totalH = 540;
  const maxW = 980;
  const minW = 260;
  const levelH = totalH / Math.max(1, levels.length);
  levels.forEach((level, idx) => {
    const t = levels.length === 1 ? 1 : idx / (levels.length - 1);
    const wTop = minW + t * (maxW - minW);
    const wBottom = minW + ((idx + 1) / Math.max(1, levels.length)) * (maxW - minW);
    const y = top + idx * levelH;
    const highlighted = level.label === spec.visual_spec?.highlight || level.id === spec.visual_spec?.highlight;
    pathRough(canvas, rc, `M ${centerX - wTop / 2} ${y} L ${centerX + wTop / 2} ${y} L ${centerX + wBottom / 2} ${y + levelH - 10} L ${centerX - wBottom / 2} ${y + levelH - 10} Z`, {
      fill: highlighted ? colors.pink : [colors.yellow, colors.warm, colors.green, colors.blue, colors.gray][idx % 5],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.4 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 1500 + idx,
    });
    canvas.add(svgText(centerX, y + levelH / 2 - 4, level.label, { size: 28, weight: 900, fill: highlighted ? colors.red : colors.ink }));
    canvas.add(svgText(centerX, y + levelH / 2 + 32, wrapCjk(level.note || "", 12).slice(0, 1), { size: 18, fill: colors.muted }));
  });
  canvas.add(svgText(1240, 445, "越往上越接近\n业务判断", { size: 26, weight: 800, fill: colors.red, lineHeight: 34 }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawGenericNetworkGraph(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(607);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const nodes = visual.nodes || [];
  const center = [800, 475];
  const radiusX = 480;
  const radiusY = 270;
  const positions = new Map();
  nodes.forEach((node, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(nodes.length, 1);
    positions.set(node.id, [center[0] + Math.cos(angle) * radiusX, center[1] + Math.sin(angle) * radiusY]);
  });
  (visual.edges || []).forEach(([from, to], i) => {
    const a = positions.get(from);
    const b = positions.get(to);
    if (!a || !b) return;
    curve(canvas, rc, a[0], a[1], b[0], b[1], i % 2 ? 35 : -25, {
      arrow: true,
      stroke: from === visual.highlight || to === visual.highlight ? colors.red : colors.muted,
      strokeWidth: from === visual.highlight || to === visual.highlight ? 2.9 : 2,
      seed: 1540 + i,
    });
  });
  nodes.forEach((node, i) => {
    const [x, y] = positions.get(node.id);
    const highlighted = node.id === visual.highlight || node.label === visual.highlight;
    rect(canvas, rc, x - 116, y - 52, 232, 104, {
      fill: highlighted ? colors.pink : [colors.blue, colors.green, colors.warm, colors.gray, colors.yellow][i % 5],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.3 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 1580 + i,
    });
    canvas.add(svgText(x, y - 9, wrapCjk(node.label, 8).slice(0, 2), { size: 23, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 25 }));
    canvas.add(svgText(x, y + 25, wrapCjk(node.note || "", 8).slice(0, 1), { size: 16, fill: colors.muted }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function drawHubSpokeNetwork(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(606);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const hub = visual.hub || { id: "hub", label: "中心" };
  const nodes = visual.nodes || [];
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
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), spec._canvasOptions);
}

function createHandDrawnDiagramSvg(spec, options = {}) {
  validateHandDrawnDiagramSpec(spec);
  const renderSpec = { ...spec, _canvasOptions: resolveCanvasOptions(options) };
  const template = spec.template || spec.intent;
  if (template === "grouped_bar_chart") return drawGroupedBarChart(renderSpec);
  if (template === "line_chart") return drawLineChart(renderSpec);
  if (template === "donut_proportion_chart" || template === "donut_chart" || template === "proportion_chart") return drawDonutProportionChart(renderSpec);
  if (template === "heatmap") return drawHeatmap(renderSpec);
  if (template === "layered_architecture") return drawLayeredArchitecture(renderSpec);
  if (template === "tree") return drawArchiveEvolutionTree(renderSpec);
  if (template === "pyramid_capability_stack" || template === "pyramid" || template === "capability_stack") return drawPyramidCapabilityStack(renderSpec);
  if (template === "closed_loop") return drawSelfImprovementLoop(renderSpec);
  if (template === "dual_loop") return drawDualLoop(renderSpec);
  if (template === "spiral_iteration_ladder") return drawSpiralIterationLadder(renderSpec);
  if (template === "horizontal_sequence" || template === "horizontal_process") return drawHorizontalSequence(renderSpec);
  if (template === "vertical_process") return drawVerticalProcess(renderSpec);
  if (template === "timeline") return drawTimeline(renderSpec);
  if (template === "swimlane") return drawSwimlane(renderSpec);
  if (template === "quadrant_matrix") return drawQuadrantMatrix(renderSpec);
  if (template === "capability_matrix") return drawMatrixGrid(renderSpec);
  if (template === "hub_spoke_network") return drawHubSpokeNetwork(renderSpec);
  if (template === "dependency_graph" || template === "module_interaction_map" || template === "causal_influence_graph") return drawGenericNetworkGraph(renderSpec);
  throw new Error(`Unsupported hand-drawn diagram template: ${template}`);
}

function createHandDrawnDiagramImage(spec, options = {}) {
  const canvas = resolveCanvasOptions(options);
  return {
    format: "svg",
    mimeType: "image/svg+xml",
    width: canvas.width,
    height: canvas.height,
    svg: createHandDrawnDiagramSvg(spec, options),
  };
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
  const template = spec.template;

  if (visual && spec.template === "layered_architecture") {
    if (!Array.isArray(visual.layers) || visual.layers.length < 3) errors.push("layered_architecture requires at least three visual_spec.layers.");
    if (!Array.isArray(visual.edges) || !visual.edges.length) errors.push("layered_architecture requires visual_spec.edges.");
    if (!Array.isArray(visual.side_modules)) errors.push("layered_architecture requires visual_spec.side_modules.");
    if (Array.isArray(visual.layers) && Array.isArray(visual.edges)) {
      const itemIds = new Set([...visual.layers.flatMap((layer) => layer.items || []), ...(visual.side_modules || [])]);
      collectUnknownEdgeEndpoints(visual.edges, itemIds, "layered_architecture").forEach((error) => errors.push(error));
    }
  }

  if (visual && ["grouped_bar_chart", "line_chart"].includes(template)) {
    if (!Array.isArray(visual.categories) || visual.categories.length < 1) errors.push(`${template} requires visual_spec.categories.`);
    if (!Array.isArray(visual.series) || visual.series.length < 1) errors.push(`${template} requires visual_spec.series.`);
    validateSeriesValues(visual, template).forEach((error) => errors.push(error));
  }

  if (visual && ["donut_proportion_chart", "donut_chart", "proportion_chart"].includes(template)) {
    if (!Array.isArray(visual.segments) || visual.segments.length < 2) errors.push(`${template} requires at least two visual_spec.segments.`);
    if (Array.isArray(visual.segments)) {
      visual.segments.forEach((segment, idx) => {
        if (!safeText(segment.label)) errors.push(`${template} segment ${idx + 1} missing label.`);
        if (!Number.isFinite(Number(segment.value))) errors.push(`${template} segment ${idx + 1} requires numeric value.`);
      });
    }
  }

  if (visual && template === "heatmap") {
    validateGridValues(visual, template).forEach((error) => errors.push(error));
  }

  if (visual && template === "tree") {
    if (!Array.isArray(visual.nodes) || visual.nodes.length < 2) errors.push("tree requires at least two visual_spec.nodes.");
    if (!Array.isArray(visual.edges) || !visual.edges.length) errors.push("tree requires visual_spec.edges.");
    if (!visual.labels || typeof visual.labels !== "object") errors.push("tree requires visual_spec.labels.");
    if (!safeText(visual.highlight)) errors.push("tree requires visual_spec.highlight.");
    if (Array.isArray(visual.nodes) && safeText(visual.highlight) && !visual.nodes.includes(visual.highlight)) {
      errors.push("tree visual_spec.highlight must be one of visual_spec.nodes.");
    }
    if (Array.isArray(visual.nodes) && visual.labels) {
      const unlabeled = visual.nodes.filter((node) => !safeText(visual.labels[node]));
      if (unlabeled.length) errors.push(`tree labels missing for nodes: ${unlabeled.join(", ")}`);
    }
    if (Array.isArray(visual.nodes) && Array.isArray(visual.edges)) {
      collectUnknownEdgeEndpoints(visual.edges, new Set(visual.nodes), "tree").forEach((error) => errors.push(error));
    }
  }

  if (visual && ["pyramid_capability_stack", "pyramid", "capability_stack"].includes(template)) {
    if (!Array.isArray(visual.levels) || visual.levels.length < 2) errors.push(`${template} requires at least two visual_spec.levels.`);
    if (Array.isArray(visual.levels)) {
      visual.levels.forEach((level, idx) => {
        if (!safeText(level.label)) errors.push(`${template} level ${idx + 1} missing label.`);
      });
    }
  }

  if (visual && ["closed_loop", "spiral_iteration_ladder"].includes(template)) {
    if (!Array.isArray(visual.steps) || visual.steps.length < 3) errors.push("closed_loop requires at least three visual_spec.steps.");
    if (!safeText(visual.center)) errors.push("closed_loop requires visual_spec.center.");
    if (Array.isArray(visual.steps)) {
      visual.steps.forEach((step, idx) => {
        if (!safeText(step.id)) errors.push(`closed_loop step ${idx + 1} missing id.`);
        if (!safeText(step.label)) errors.push(`closed_loop step ${idx + 1} missing label.`);
      });
      if (safeText(visual.highlight) && !visual.steps.some((step) => step.id === visual.highlight)) {
        errors.push("closed_loop visual_spec.highlight must match a step id.");
      }
    }
  }

  if (visual && ["horizontal_sequence", "horizontal_process", "vertical_process", "timeline"].includes(template)) {
    if (!Array.isArray(visual.steps) || visual.steps.length < 2) errors.push("horizontal_sequence requires at least two visual_spec.steps.");
    if (Array.isArray(visual.steps)) {
      visual.steps.forEach((step, idx) => {
        if (!safeText(step.id)) errors.push(`horizontal_sequence step ${idx + 1} missing id.`);
        if (!safeText(step.label)) errors.push(`horizontal_sequence step ${idx + 1} missing label.`);
      });
      if (safeText(visual.highlight) && !visual.steps.some((step) => step.id === visual.highlight)) {
        errors.push("horizontal_sequence visual_spec.highlight must match a step id.");
      }
    }
  }

  if (visual && template === "swimlane") {
    if (!Array.isArray(visual.lanes) || visual.lanes.length < 1) errors.push("swimlane requires visual_spec.lanes.");
    if (Array.isArray(visual.lanes)) {
      const stepIds = [];
      visual.lanes.forEach((lane, laneIdx) => {
        if (!safeText(lane.id)) errors.push(`swimlane lane ${laneIdx + 1} missing id.`);
        if (!safeText(lane.label)) errors.push(`swimlane lane ${laneIdx + 1} missing label.`);
        if (!Array.isArray(lane.steps) || lane.steps.length < 1) errors.push(`swimlane lane ${laneIdx + 1} requires steps.`);
        (lane.steps || []).forEach((step, stepIdx) => {
          if (!safeText(step.id)) errors.push(`swimlane lane ${laneIdx + 1} step ${stepIdx + 1} missing id.`);
          if (!safeText(step.label)) errors.push(`swimlane lane ${laneIdx + 1} step ${stepIdx + 1} missing label.`);
          stepIds.push(step.id);
        });
      });
      if (safeText(visual.highlight) && !stepIds.includes(visual.highlight)) errors.push("swimlane visual_spec.highlight must match a lane step id.");
    }
  }

  if (visual && template === "dual_loop") {
    if (!Array.isArray(visual.loops) || visual.loops.length < 2) errors.push("dual_loop requires at least two visual_spec.loops.");
    if (Array.isArray(visual.loops)) {
      visual.loops.forEach((loop, loopIdx) => {
        if (!safeText(loop.id)) errors.push(`dual_loop loop ${loopIdx + 1} missing id.`);
        if (!safeText(loop.label)) errors.push(`dual_loop loop ${loopIdx + 1} missing label.`);
        if (!Array.isArray(loop.steps) || loop.steps.length < 2) errors.push(`dual_loop loop ${loopIdx + 1} requires at least two steps.`);
      });
      if (safeText(visual.highlight) && !visual.loops.some((loop) => loop.id === visual.highlight)) errors.push("dual_loop visual_spec.highlight must match a loop id.");
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

  if (visual && template === "capability_matrix") {
    validateGridValues(visual, template).forEach((error) => errors.push(error));
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
    if (visual.hub && Array.isArray(visual.nodes) && Array.isArray(visual.edges)) {
      const ids = new Set([visual.hub.id, ...visual.nodes.map((node) => node.id)]);
      collectUnknownEdgeEndpoints(visual.edges, ids, "hub_spoke_network").forEach((error) => errors.push(error));
    }
  }

  if (visual && ["dependency_graph", "module_interaction_map", "causal_influence_graph"].includes(template)) {
    if (!Array.isArray(visual.nodes) || visual.nodes.length < 2) errors.push(`${template} requires at least two visual_spec.nodes.`);
    if (!Array.isArray(visual.edges) || !visual.edges.length) errors.push(`${template} requires visual_spec.edges.`);
    if (Array.isArray(visual.nodes)) {
      visual.nodes.forEach((node, idx) => {
        if (!safeText(node.id)) errors.push(`${template} node ${idx + 1} missing id.`);
        if (!safeText(node.label)) errors.push(`${template} node ${idx + 1} missing label.`);
      });
    }
    if (Array.isArray(visual.nodes) && Array.isArray(visual.edges)) {
      collectUnknownEdgeEndpoints(visual.edges, new Set(visual.nodes.map((node) => node.id)), template).forEach((error) => errors.push(error));
    }
  }

  if (errors.length) {
    throw new Error(`Invalid hand-drawn diagram spec "${spec.id || "(unknown)"}":\n- ${errors.join("\n- ")}`);
  }
  return true;
}

function collectUnknownEdgeEndpoints(edges, validIds, template) {
  const errors = [];
  edges.forEach((edge, idx) => {
    if (!Array.isArray(edge) || edge.length !== 2) {
      errors.push(`${template} edge ${idx + 1} must be a [from, to] pair.`);
      return;
    }
    const [from, to] = edge;
    if (!validIds.has(from)) errors.push(`${template} edge ${idx + 1} references unknown source: ${from}`);
    if (!validIds.has(to)) errors.push(`${template} edge ${idx + 1} references unknown target: ${to}`);
  });
  return errors;
}

function validateSeriesValues(visual, template) {
  const errors = [];
  if (!Array.isArray(visual.series)) return errors;
  visual.series.forEach((entry, idx) => {
    if (!safeText(entry.name)) errors.push(`${template} series ${idx + 1} missing name.`);
    if (!Array.isArray(entry.values)) errors.push(`${template} series ${idx + 1} missing values.`);
    if (Array.isArray(entry.values) && Array.isArray(visual.categories) && entry.values.length !== visual.categories.length) {
      errors.push(`${template} series ${idx + 1} values must match category count.`);
    }
    (entry.values || []).forEach((value, valueIdx) => {
      if (!Number.isFinite(Number(value))) errors.push(`${template} series ${idx + 1} value ${valueIdx + 1} must be numeric.`);
    });
  });
  return errors;
}

function validateGridValues(visual, template) {
  const errors = [];
  if (!Array.isArray(visual.rows) || visual.rows.length < 1) errors.push(`${template} requires visual_spec.rows.`);
  if (!Array.isArray(visual.columns) || visual.columns.length < 1) errors.push(`${template} requires visual_spec.columns.`);
  if (!Array.isArray(visual.values) || visual.values.length < 1) errors.push(`${template} requires visual_spec.values.`);
  if (Array.isArray(visual.rows) && Array.isArray(visual.columns) && Array.isArray(visual.values)) {
    if (visual.values.length !== visual.rows.length) errors.push(`${template} values row count must match rows.`);
    visual.values.forEach((row, idx) => {
      if (!Array.isArray(row) || row.length !== visual.columns.length) errors.push(`${template} values row ${idx + 1} must match column count.`);
    });
  }
  return errors;
}

function writeHandDrawnDiagramSvg(spec, outDir, options = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = options.fileName || `${spec.id || spec.template || "diagram"}.svg`;
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, createHandDrawnDiagramSvg(spec, options), "utf8");
  return filePath;
}

function writeHandDrawnDiagramImage(spec, outDir, options = {}) {
  return writeHandDrawnDiagramSvg(spec, outDir, options);
}

module.exports = {
  DIAGRAM_STYLE,
  createHandDrawnDiagramImage,
  createHandDrawnDiagramSvg,
  validateHandDrawnDiagramSpec,
  writeHandDrawnDiagramImage,
  writeHandDrawnDiagramSvg,
};
