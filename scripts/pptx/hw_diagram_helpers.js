const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const rough = require("roughjs");

const ShapeType = pptxgen.ShapeType || { rect: "rect", line: "line" };

const DIAGRAM_STYLE = Object.freeze({
  width: 1600,
  height: 900,
  pptW: 13.333,
  pptH: 7.5,
  font: "'Microsoft YaHei', 'Noto Sans CJK SC', Arial, sans-serif",
  color: {
    red: "#C00000",
    red2: "#D53C44",
    red3: "#E37882",
    red4: "#F1B4B6",
    redPale: "#FFF1EF",
    ink: "#333333",
    muted: "#595959",
    paper: "#FFFFFF",
    line: "#D9D9D9",
    lineDark: "#8C8C8C",
    gray: "#F2F2F2",
    gray2: "#E6E6E6",
    gray3: "#BFBFBF",
    blue: "#115CAA",
    blue2: "#487FBF",
    blue3: "#7FAAD4",
    bluePale: "#EAF5FE",
    yellow: "#FCDC00",
    yellow2: "#FFD464",
    yellowPale: "#FFF3CB",
    green: "#61B23A",
    green2: "#85C45F",
    greenPale: "#E7F5E0",
    warm: "#FFF1EF",
    pink: "#FCE4E0",
  },
});

const TEXT_LIMITS = Object.freeze({
  minSvgFontSize: 14,
  minNativeFontSize: 6,
});

const TEMPLATE_LAYOUTS = Object.freeze({
  bar_chart: "16:9",
  line_chart: "16:9",
  proportion_chart: "16:9",
  data_cards: "16:9",
  heatmap: "16:9",
  layered_architecture: "16:9",
  tree: "16:9",
  capability_stack: "16:9",
  closed_loop: "16:9",
  dual_loop: "16:9",
  spiral_iteration_ladder: "16:9",
  process: "16:9",
  timeline: "16:9",
  swimlane: "16:9",
  table: "16:9",
  quadrant_matrix: "16:9",
  capability_matrix: "16:9",
  hub_spoke_network: "16:9",
  dependency_graph: "16:9",
  module_interaction_map: "16:9",
  causal_influence_graph: "16:9",
});

const STANDALONE_VISUAL_SPEC_TEXT_FIELDS = Object.freeze([
  "annotation",
  "caption",
  "callout",
  "callout_title",
  "claim",
  "conclusion",
  "explanation",
  "explanations",
  "figure_legend",
  "footer",
  "detail",
  "details",
  "insight",
  "insights",
  "interpretation",
  "interpretations",
  "legend",
  "note",
  "notes",
  "rationale",
  "reading_guide",
  "remark",
  "remarks",
  "source_note",
  "source_notes",
  "subtitle",
  "summary",
  "takeaway",
  "takeaways",
  "title",
]);

function chooseTemplateLayout(spec) {
  const template = spec?.template || spec?.kind;
  return TEMPLATE_LAYOUTS[template] || "16:9";
}

function normalizeExportOptions(spec, options = {}) {
  if (options.aspectRatio && options.aspectRatio !== "16:9") {
    throw new Error(`Unsupported diagram aspectRatio: ${options.aspectRatio}. Reusable diagram exports use fixed template layouts.`);
  }
  const template = spec?.template || spec?.kind;
  const width = options.width ?? options.canvas?.width ?? null;
  const height = options.height ?? options.canvas?.height ?? null;
  if (width != null && (!Number.isFinite(Number(width)) || Number(width) <= 0)) {
    throw new Error("Diagram export width and height must be positive numbers.");
  }
  if (height != null && (!Number.isFinite(Number(height)) || Number(height) <= 0)) {
    throw new Error("Diagram export width and height must be positive numbers.");
  }
  return {
    template,
    requestedWidth: width == null ? null : Math.round(Number(width)),
    requestedHeight: height == null ? null : Math.round(Number(height)),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function chunkIntoRows(items, maxPerRow) {
  const rows = [];
  for (let i = 0; i < items.length; i += maxPerRow) rows.push(items.slice(i, i + maxPerRow));
  return rows;
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

function splitTextForWrap(text) {
  const value = safeText(text);
  const tokens = [];
  let ascii = "";
  const flushAscii = () => {
    if (!ascii) return;
    const parts = ascii.match(/\s+|[A-Za-z0-9#%@&._:/+-]+|./g) || [];
    tokens.push(...parts);
    ascii = "";
  };
  for (const char of value) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
      flushAscii();
      tokens.push(char);
    } else {
      ascii += char;
    }
  }
  flushAscii();
  return tokens.filter((token) => token.length);
}

function trimLineEnd(line) {
  return String(line || "").replace(/\s+$/g, "");
}

function wrapTextToWidth(text, opts = {}) {
  const size = opts.size || 28;
  const minSize = opts.minSize || TEXT_LIMITS.minSvgFontSize;
  if (size < minSize) {
    throw new Error(`Diagram text font size ${size} is below the ${minSize}px minimum${opts.context ? ` for ${opts.context}` : ""}.`);
  }
  const maxWidth = Number(opts.maxWidth);
  const lineHeight = opts.lineHeight || size * 1.25;
  const maxLinesFromHeight = opts.maxHeight ? Math.max(1, Math.floor(Number(opts.maxHeight) / lineHeight)) : Infinity;
  const maxLines = Math.max(1, Math.min(opts.maxLines || Infinity, maxLinesFromHeight));
  const rawLines = Array.isArray(text) ? text.flatMap((line) => String(line ?? "").split("\n")) : String(text ?? "").split("\n");
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return rawLines.map(safeText);

  const lines = [];
  const pushLine = (line) => {
    if (lines.length < maxLines) {
      lines.push(trimLineEnd(line));
    } else {
      throw new Error(`Diagram text exceeds ${maxLines} line(s)${opts.context ? ` for ${opts.context}` : ""}: ${safeText(text)}`);
    }
  };
  const splitOversizedToken = (token) => {
    let current = token.trimStart();
    while (current && estimateTextWidth(current, size) > maxWidth) {
      let chunk = "";
      for (const char of Array.from(current)) {
        if (chunk && estimateTextWidth(`${chunk}${char}`, size) > maxWidth) break;
        chunk += char;
      }
      pushLine(chunk);
      current = Array.from(current).slice(Array.from(chunk).length).join("");
    }
    return current;
  };

  for (const rawLine of rawLines) {
    const tokens = splitTextForWrap(rawLine);
    if (!tokens.length) {
      pushLine("");
      continue;
    }
    let current = "";
    for (const token of tokens) {
      const candidate = current ? `${current}${token}` : token;
      if (estimateTextWidth(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) pushLine(current);
      current = splitOversizedToken(token);
    }
    if (current) pushLine(current);
  }

  return lines.length ? lines : [""];
}

function measureTextLines(lines, size, lineHeight) {
  const values = Array.isArray(lines) ? lines : [lines];
  return {
    width: Math.max(...values.map((line) => estimateTextWidth(line, size)), size * 0.8),
    height: lineHeight * Math.max(1, values.length),
  };
}

function svgText(x, y, text, opts = {}) {
  const size = opts.size || 28;
  const weight = opts.weight || 500;
  const anchor = opts.anchor || "middle";
  const fill = opts.fill || DIAGRAM_STYLE.color.ink;
  const family = opts.family || DIAGRAM_STYLE.font;
  const lineHeight = opts.lineHeight || size * 1.25;
  const lines = wrapTextToWidth(text, { ...opts, size, lineHeight });
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${tspans}</text>`;
}

function estimateTextWidth(text, size) {
  const value = String(text ?? "");
  let units = 0;
  for (const char of value) {
    if (char === " ") units += 0.35;
    else if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) units += 1.5;
    else if (/[A-Z0-9#%@&]/.test(char)) units += 1.05;
    else if (/[a-z]/.test(char)) units += 0.9;
    else if (/[._:/+-]/.test(char)) units += 0.7;
    else units += 0.78;
  }
  return Math.max(size * 0.8, units * size * 0.62);
}

function getTextBounds(x, y, text, opts = {}) {
  const size = opts.size || 28;
  const anchor = opts.anchor || "middle";
  const lineHeight = opts.lineHeight || size * 1.25;
  const lines = wrapTextToWidth(text, { ...opts, size, lineHeight });
  const maxWidth = Math.max(...lines.map((line) => estimateTextWidth(line, size)), size * 0.8);
  const totalHeight = lineHeight * Math.max(1, lines.length);
  const padX = Math.max(8, size * 0.22);
  const padY = Math.max(8, size * 0.28);
  let minX = x - maxWidth / 2;
  let maxX = x + maxWidth / 2;
  if (anchor === "start") {
    minX = x;
    maxX = x + maxWidth;
  } else if (anchor === "end") {
    minX = x - maxWidth;
    maxX = x;
  }
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: y - totalHeight / 2 - padY,
    maxY: y + totalHeight / 2 + padY,
  };
}

function wrapCjk(text, chars = 12) {
  const value = safeText(text);
  if (!value) return [""];
  if (/^[\x00-\x7F]+$/.test(value)) return [value];
  if (value.length <= chars) return [value];
  return value.match(new RegExp(`.{1,${chars}}`, "g")) || [value];
}

function mergeBounds(target, bounds) {
  if (!bounds || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) return;
  target.minX = Math.min(target.minX, bounds.minX);
  target.minY = Math.min(target.minY, bounds.minY);
  target.maxX = Math.max(target.maxX, bounds.maxX);
  target.maxY = Math.max(target.maxY, bounds.maxY);
}

function boundsFromRect(x, y, w, h, pad = 0) {
  return { minX: x - pad, minY: y - pad, maxX: x + w + pad, maxY: y + h + pad };
}

function boundsFromEllipse(cx, cy, w, h, pad = 0) {
  return { minX: cx - w / 2 - pad, minY: cy - h / 2 - pad, maxX: cx + w / 2 + pad, maxY: cy + h / 2 + pad };
}

function boundsFromPoints(points, pad = 0) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs) - pad,
    minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad,
    maxY: Math.max(...ys) + pad,
  };
}

function tokenizePath(d) {
  return String(d || "").match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
}

function pathBoundsFromD(d, pad = 0) {
  const tokens = tokenizePath(d);
  if (!tokens.length) return null;
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const points = [];
  const nextNumber = () => Number(tokens[i++]);
  const isCommand = (token) => /^[A-Za-z]$/.test(token);
  while (i < tokens.length) {
    if (isCommand(tokens[i])) cmd = tokens[i++];
    if (!cmd) break;
    const relative = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M":
      case "L":
      case "T": {
        while (i < tokens.length && !isCommand(tokens[i])) {
          const nx = nextNumber();
          const ny = nextNumber();
          x = relative ? x + nx : nx;
          y = relative ? y + ny : ny;
          if (cmd.toUpperCase() === "M") {
            startX = x;
            startY = y;
            cmd = relative ? "l" : "L";
          }
          points.push([x, y]);
        }
        break;
      }
      case "H": {
        while (i < tokens.length && !isCommand(tokens[i])) {
          const nx = nextNumber();
          x = relative ? x + nx : nx;
          points.push([x, y]);
        }
        break;
      }
      case "V": {
        while (i < tokens.length && !isCommand(tokens[i])) {
          const ny = nextNumber();
          y = relative ? y + ny : ny;
          points.push([x, y]);
        }
        break;
      }
      case "C": {
        while (i < tokens.length && !isCommand(tokens[i])) {
          const x1 = nextNumber();
          const y1 = nextNumber();
          const x2 = nextNumber();
          const y2 = nextNumber();
          const nx = nextNumber();
          const ny = nextNumber();
          const p1 = [relative ? x + x1 : x1, relative ? y + y1 : y1];
          const p2 = [relative ? x + x2 : x2, relative ? y + y2 : y2];
          x = relative ? x + nx : nx;
          y = relative ? y + ny : ny;
          points.push(p1, p2, [x, y]);
        }
        break;
      }
      case "S":
      case "Q": {
        const step = cmd.toUpperCase() === "Q" ? 4 : 4;
        while (i < tokens.length && !isCommand(tokens[i])) {
          const x1 = nextNumber();
          const y1 = nextNumber();
          const nx = nextNumber();
          const ny = nextNumber();
          const p1 = [relative ? x + x1 : x1, relative ? y + y1 : y1];
          x = relative ? x + nx : nx;
          y = relative ? y + ny : ny;
          points.push(p1, [x, y]);
        }
        break;
      }
      case "A": {
        while (i < tokens.length && !isCommand(tokens[i])) {
          const rx = nextNumber();
          const ry = nextNumber();
          nextNumber();
          nextNumber();
          nextNumber();
          const nx = nextNumber();
          const ny = nextNumber();
          const endX = relative ? x + nx : nx;
          const endY = relative ? y + ny : ny;
          points.push([x - rx, y - ry], [x + rx, y + ry], [endX - rx, endY - ry], [endX + rx, endY + ry], [endX, endY]);
          x = endX;
          y = endY;
        }
        break;
      }
      case "Z": {
        x = startX;
        y = startY;
        points.push([x, y]);
        break;
      }
      default: {
        while (i < tokens.length && !isCommand(tokens[i])) i += 1;
      }
    }
  }
  if (!points.length) return null;
  return boundsFromPoints(points, pad);
}

function boundsFromMarkup(markup) {
  if (typeof markup !== "string") return null;
  const aggregate = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const push = (bounds) => mergeBounds(aggregate, bounds);
  const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  for (const match of markup.matchAll(textRegex)) {
    const attrs = match[1];
    const body = match[2];
    const xMatch = attrs.match(/text-anchor="([^"]+)"/);
    const sizeMatch = attrs.match(/font-size="([^"]+)"/);
    const lineMatches = [...body.matchAll(/<tspan\b[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*>([\s\S]*?)<\/tspan>/g)];
    if (lineMatches.length) {
      const anchor = xMatch?.[1] || "middle";
      const size = Number(sizeMatch?.[1] || 28);
      const lines = lineMatches.map((line) => line[3].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
      const x = Number(lineMatches[0][1]);
      const ys = lineMatches.map((line) => Number(line[2]));
      const lineHeight = ys.length > 1 ? ys[1] - ys[0] : size * 1.25;
      const centerY = (ys[0] + ys[ys.length - 1]) / 2;
      push(getTextBounds(x, centerY, lines, { size, anchor, lineHeight }));
    }
  }
  const rectRegex = /<rect\b([^>]*)\/?>/g;
  for (const match of markup.matchAll(rectRegex)) {
    const attrs = match[1];
    const x = Number((attrs.match(/\bx="([^"]+)"/) || [])[1]);
    const y = Number((attrs.match(/\by="([^"]+)"/) || [])[1]);
    const w = Number((attrs.match(/\bwidth="([^"]+)"/) || [])[1]);
    const h = Number((attrs.match(/\bheight="([^"]+)"/) || [])[1]);
    if ([x, y, w, h].every(Number.isFinite)) push(boundsFromRect(x, y, w, h, 8));
  }
  const ellipseRegex = /<ellipse\b([^>]*)\/?>/g;
  for (const match of markup.matchAll(ellipseRegex)) {
    const attrs = match[1];
    const cx = Number((attrs.match(/\bcx="([^"]+)"/) || [])[1]);
    const cy = Number((attrs.match(/\bcy="([^"]+)"/) || [])[1]);
    const rx = Number((attrs.match(/\brx="([^"]+)"/) || [])[1]);
    const ry = Number((attrs.match(/\bry="([^"]+)"/) || [])[1]);
    if ([cx, cy, rx, ry].every(Number.isFinite)) push(boundsFromEllipse(cx, cy, rx * 2, ry * 2, 8));
  }
  const pathRegex = /<path\b([^>]*)\/?>/g;
  for (const match of markup.matchAll(pathRegex)) {
    const attrs = match[1];
    const d = (attrs.match(/\bd="([^"]+)"/) || [])[1];
    if (d) push(pathBoundsFromD(d, 16));
  }
  return Number.isFinite(aggregate.minX) ? aggregate : null;
}

function createCanvas() {
  return {
    chunks: [],
    bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    add(value) {
      this.chunks.push(value);
      mergeBounds(this.bounds, boundsFromMarkup(value));
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
  if (opts.opaqueFill) {
    canvas.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts.opaqueFill}" stroke="none"/>`);
  }
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
  if (opts.opaqueFill) {
    canvas.add(`<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="${opts.opaqueFill}" stroke="none"/>`);
  }
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

function resolveCropBox(bounds) {
  const fallback = { x: 80, y: 120, w: 1440, h: 700 };
  if (!bounds || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) return fallback;
  const textPad = 26;
  const shapePad = 16;
  const x = clamp(Math.floor(bounds.minX - textPad), 0, DIAGRAM_STYLE.width - 40);
  const y = clamp(Math.floor(bounds.minY - textPad), 0, DIAGRAM_STYLE.height - 40);
  const maxX = clamp(Math.ceil(bounds.maxX + shapePad), x + 40, DIAGRAM_STYLE.width);
  const maxY = clamp(Math.ceil(bounds.maxY + shapePad), y + 40, DIAGRAM_STYLE.height);
  return {
    x,
    y,
    w: maxX - x,
    h: maxY - y,
  };
}

function resolveOutputSize(exportOptions, cropBox) {
  if (exportOptions.requestedWidth && exportOptions.requestedHeight) {
    return { width: exportOptions.requestedWidth, height: exportOptions.requestedHeight };
  }
  if (exportOptions.requestedWidth) {
    return {
      width: exportOptions.requestedWidth,
      height: Math.round((exportOptions.requestedWidth * cropBox.h) / cropBox.w),
    };
  }
  if (exportOptions.requestedHeight) {
    return {
      width: Math.round((exportOptions.requestedHeight * cropBox.w) / cropBox.h),
      height: exportOptions.requestedHeight,
    };
  }
  return { width: Math.round(cropBox.w), height: Math.round(cropBox.h) };
}

function baseSvg(title, claim, body, options = {}) {
  const exportOptions = options._exportOptions || normalizeExportOptions(options._spec, options);
  const cropBox = resolveCropBox(options._contentBounds);
  const { width, height } = resolveOutputSize(exportOptions, cropBox);
  const colors = DIAGRAM_STYLE.color;
  const header = options.renderHeader
    ? `${svgText(90, 66, safeText(title), { size: 36, weight: 800, anchor: "start", fill: colors.red, lineHeight: 40, maxWidth: 1340, maxLines: 2 })}
${svgText(90, 126, safeText(claim), { size: 24, weight: 500, anchor: "start", fill: colors.muted, lineHeight: 29, maxWidth: 1340, maxLines: 2 })}`
    : "";
  return {
    width,
    height,
    cropBox,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${cropBox.x} ${cropBox.y} ${cropBox.w} ${cropBox.h}">
<rect width="${DIAGRAM_STYLE.width}" height="${DIAGRAM_STYLE.height}" fill="${colors.paper}"/>
<g opacity="0.48">
  <path d="M80 120 C310 86 518 111 742 89 S1205 116 1510 82" fill="none" stroke="${colors.line}" stroke-width="2"/>
  <path d="M88 812 C358 790 606 830 894 802 S1266 788 1514 816" fill="none" stroke="${colors.line}" stroke-width="2"/>
</g>
${header}
${body}
</svg>`,
  };
}

function drawLayeredArchitecture(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(101);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const layers = visual.layers || [];
  const centers = new Map();
  const left = 145;
  const top = 170;
  const stackW = 930;
  const stackH = 540;
  const rowGap = 18;
  const layerH = Math.max(78, (stackH - rowGap * Math.max(0, layers.length - 1)) / Math.max(1, layers.length));
  const palette = [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray, colors.redPale];

  layers.forEach((layer, layerIdx) => {
    const y = top + layerIdx * (layerH + rowGap);
    rect(canvas, rc, left, y, stackW, layerH, {
      fill: palette[layerIdx % palette.length],
      hachureGap: 14,
      stroke: colors.lineDark,
      roughness: 2.1,
      seed: 20 + layerIdx,
    });
    canvas.add(svgText(left - 34, y + layerH / 2 + 8, layer.label || layer.id, {
      size: 22,
      fill: colors.red,
      weight: 750,
      maxWidth: 120,
      maxLines: 2,
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
      canvas.add(svgText(cx, cy + 7, label, {
        size: itemW < 140 ? 20 : 23,
        weight: 750,
        lineHeight: 24,
        maxWidth: itemW - 18,
        maxHeight: itemH - 12,
      }));
    });
  });

  const sideModules = visual.side_modules || [];
  if (sideModules.length) {
    const sideX = 1145;
    const sideY = 205;
    const sideW = 275;
    const sideH = 555;
    rect(canvas, rc, sideX - 24, sideY - 22, sideW + 48, sideH + 44, {
      fill: colors.gray,
      fillStyle: "cross-hatch",
      hachureGap: 18,
      stroke: colors.lineDark,
      roughness: 2.2,
      seed: 130,
    });
    if (visual.side_label) {
      canvas.add(svgText(sideX + sideW / 2, sideY - 48, visual.side_label, { size: 27, weight: 800, fill: colors.red, maxWidth: sideW }));
    }
    const gap = Math.max(16, (sideH - sideModules.length * 68) / Math.max(1, sideModules.length - 1));
    sideModules.forEach((label, i) => {
      const y = sideY + 30 + i * (68 + gap);
      centers.set(label, [sideX + sideW / 2, y]);
      ellipse(canvas, rc, sideX + sideW / 2, y, 210, 66, {
        fill: palette[(i + 1) % palette.length],
        hachureAngle: -45 + i * 15,
        seed: 140 + i,
      });
      canvas.add(svgText(sideX + sideW / 2, y + 8, label, { size: 20, weight: 700, lineHeight: 24, maxWidth: 182, maxLines: 2 }));
    });
  }

  (visual.edges || []).forEach(([from, to], i) => {
    const a = centers.get(from);
    const b = centers.get(to);
    if (!a || !b) return;
    const vertical = Math.abs(a[0] - b[0]) < 12;
    const fromSide = sideModules.includes(from);
    const toSide = sideModules.includes(to);
    const sideEdge = fromSide || toSide;
    const sideBend = sideEdge && sideModules.length > 3 ? (i % 2 ? 24 : -24) : (i % 3 - 1) * 12;
    curve(canvas, rc, a[0], a[1] + (fromSide ? 0 : 32), b[0], b[1] - (toSide ? 0 : 32), vertical ? 0 : sideBend, {
      arrow: true,
      stroke: sideEdge ? colors.lineDark : (i >= Math.floor((visual.edges || []).length * 0.55) ? colors.red : colors.ink),
      strokeWidth: sideEdge ? (sideModules.length > 3 ? 1.25 : 1.5) : (i >= Math.floor((visual.edges || []).length * 0.55) ? 2.7 : 2.1),
      seed: 90 + i,
    });
  });

  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
  const chart = { x: 170, y: 220, w: series.length > 3 ? 980 : 1030, h: 470 };
  const baseline = chart.y + chart.h;
  const groupW = chart.w / Math.max(categories.length, 1);
  const barGap = Math.max(5, Math.min(12, 42 / Math.max(1, series.length)));
  const barW = Math.max(12, Math.min(62, (groupW - 34 - barGap * Math.max(series.length - 1, 0)) / Math.max(series.length, 1)));

  rect(canvas, rc, chart.x - 18, chart.y - 12, chart.w + 44, chart.h + 48, {
    fill: "#ffffff",
    fillStyle: "hachure",
    hachureGap: 32,
    stroke: colors.line,
    strokeWidth: 1.6,
    roughness: 1.5,
    seed: 710,
  });
  line(canvas, rc, chart.x, chart.y, chart.x, baseline, { stroke: colors.ink, strokeWidth: 2.5, seed: 711 });
  line(canvas, rc, chart.x, baseline, chart.x + chart.w, baseline, { stroke: colors.ink, strokeWidth: 2.5, seed: 712 });
  for (let tick = 0; tick <= maxValue; tick += Math.max(10, maxValue / 6)) {
    const y = baseline - (tick / maxValue) * chart.h;
    line(canvas, rc, chart.x - 8, y, chart.x + chart.w, y, { stroke: tick === 0 ? colors.ink : colors.line, strokeWidth: tick === 0 ? 2 : 1.2, roughness: 0.8, seed: 720 + tick });
    canvas.add(svgText(chart.x - 22, y + 7, String(Math.round(tick)), { size: 18, weight: 500, anchor: "end", fill: colors.muted }));
  }
  canvas.add(svgText(chart.x + 4, chart.y - 36, visual.y_label, { size: 22, weight: 800, anchor: "start", fill: colors.red }));

  const seriesColor = (entry, idx, highlighted) => {
    if (highlighted) return colors.red;
    if (entry.color === "red") return colors.red2;
    if (entry.color === "gray") return colors.gray3;
    return [colors.blue2, colors.green2, colors.yellow2][idx % 3];
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
        stroke: highlighted ? colors.red : colors.lineDark,
        strokeWidth: highlighted ? 3.4 : 2,
        fillStyle: highlighted ? "cross-hatch" : "hachure",
        hachureGap: highlighted ? 7 : 10,
        seed: 760 + categoryIdx * 10 + seriesIdx,
      });
      canvas.add(svgText(x + barW / 2, y - 18, value.toFixed(value % 1 ? 1 : 0), { size: 18, weight: highlighted ? 900 : 700, fill: highlighted ? colors.red : colors.ink }));
    });
    canvas.add(svgText(groupX, baseline + 42, category, { size: categories.length > 6 ? 18 : 21, weight: 650, fill: colors.ink, lineHeight: 21, maxWidth: groupW - 16, maxLines: 2 }));
  });

  series.forEach((entry, idx) => {
    const x = series.length > 3 ? 1210 : 1280;
    const y = 252 + idx * Math.max(40, Math.min(54, 260 / Math.max(1, series.length)));
    rect(canvas, rc, x, y - 18, 46, 28, { fill: seriesColor(entry, idx, false), stroke: colors.lineDark, seed: 820 + idx });
    canvas.add(svgText(x + 62, y + 4, entry.name, { size: series.length > 4 ? 18 : 22, weight: 700, anchor: "start", fill: colors.ink, lineHeight: 22, maxWidth: 230, maxLines: 2 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
  const chart = { x: 190, y: 220, w: 1040, h: 490 };
  const baseline = chart.y + chart.h;
  rect(canvas, rc, chart.x - 18, chart.y - 12, chart.w + 44, chart.h + 48, { fill: "#ffffff", fillStyle: "hachure", hachureGap: 32, stroke: colors.line, strokeWidth: 1.6, seed: 910 });
  line(canvas, rc, chart.x, chart.y, chart.x, baseline, { stroke: colors.ink, strokeWidth: 2.5, seed: 911 });
  line(canvas, rc, chart.x, baseline, chart.x + chart.w, baseline, { stroke: colors.ink, strokeWidth: 2.5, seed: 912 });
  const xFor = (idx) => chart.x + (idx / Math.max(1, categories.length - 1)) * chart.w;
  const yFor = (value) => baseline - (Number(value || 0) / maxValue) * chart.h;
  categories.forEach((category, idx) => {
    const x = xFor(idx);
    line(canvas, rc, x, baseline, x, baseline + 8, { stroke: colors.ink, strokeWidth: 1.6, seed: 920 + idx });
    canvas.add(svgText(x, baseline + 42, category, { size: categories.length > 6 ? 18 : 21, weight: 650, fill: colors.ink, lineHeight: 21, maxWidth: Math.max(86, chart.w / Math.max(1, categories.length) - 12), maxLines: 2 }));
  });
  canvas.add(svgText(chart.x + 4, chart.y - 36, visual.y_label, { size: 22, weight: 800, anchor: "start", fill: colors.red }));
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
    const legendX = 1270;
    const legendY = 282 + seriesIdx * 52;
    line(canvas, rc, legendX, legendY, legendX + 46, legendY, { stroke: seriesIdx === 0 ? colors.red : colors.ink, strokeWidth: 3, seed: 1020 + seriesIdx });
    canvas.add(svgText(legendX + 62, legendY + 6, entry.name, { size: 22, weight: 700, anchor: "start", fill: colors.ink, maxWidth: 230, maxLines: 2 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
    const fill = [colors.bluePale, colors.greenPale, colors.yellowPale, colors.redPale, colors.gray, colors.gray2][idx % 6];
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
    canvas.add(svgText(lx, ly, [`${segment.label}`, `${segment.value}`], { size: 23, weight: segment.label === visual.highlight ? 900 : 700, fill: segment.label === visual.highlight ? colors.red : colors.ink, lineHeight: 28, maxWidth: 180, maxLines: 3 }));
    start = end;
  });
  ellipse(canvas, rc, center[0], center[1], 180, 120, { fill: colors.paper, stroke: colors.red, strokeWidth: 2.5, seed: 1080 });
  canvas.add(svgText(center[0], center[1] + 8, visual.total_label, { size: 28, weight: 900, fill: colors.red, lineHeight: 32, maxWidth: 150, maxLines: 2 }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
  columns.forEach((column, idx) => canvas.add(svgText(grid.x + idx * cellW + cellW / 2, grid.y - 30, column, { size: 22, weight: 800, fill: colors.red, lineHeight: 24, maxWidth: cellW - 14, maxLines: 2 })));
  rows.forEach((row, rowIdx) => {
    canvas.add(svgText(grid.x - 28, grid.y + rowIdx * cellH + cellH / 2 + 8, row, { size: 22, weight: 800, fill: colors.ink, anchor: "end", lineHeight: 24, maxWidth: 210, maxLines: 2 }));
    columns.forEach((column, colIdx) => {
      const value = Number(values[rowIdx]?.[colIdx]) || 0;
      const t = max === min ? 0.5 : (value - min) / (max - min);
      const highlighted = visual.highlight?.row === row && visual.highlight?.column === column;
      const fill = t > 0.66 ? colors.red4 : t > 0.33 ? colors.redPale : colors.gray;
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
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
}

function drawDataCards(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(730);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const cards = visual.cards || [];
  const cols = Math.min(4, Math.max(1, cards.length || 1));
  const gap = 36;
  const cardW = (1280 - gap * (cols - 1)) / cols;
  const cardH = 300;
  const x0 = 160;
  const y = 270;
  cards.forEach((card, idx) => {
    const x = x0 + idx * (cardW + gap);
    const highlighted = card.id === visual.highlight || card.label === visual.highlight;
    rect(canvas, rc, x, y, cardW, cardH, {
      fill: highlighted ? colors.redPale : colors.gray,
      stroke: highlighted ? colors.red : colors.lineDark,
      strokeWidth: highlighted ? 3 : 2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 740 + idx,
    });
    canvas.add(svgText(x + cardW / 2, y + 78, card.value, { size: 58, weight: 850, fill: highlighted ? colors.red : colors.ink }));
    canvas.add(svgText(x + cardW / 2, y + 138, card.unit || "", { size: 22, weight: 700, fill: colors.muted }));
    canvas.add(svgText(x + cardW / 2, y + 194, card.label || "", { size: 27, weight: 850, fill: colors.ink, lineHeight: 31, maxWidth: cardW - 32, maxLines: 2 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
}

function drawArchiveEvolutionTree(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(202);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const nodes = visual.nodes || [];
  const pos = layoutTree(nodes, visual.edges || []);
  const mainPath = findPathToHighlight(visual.edges || [], visual.highlight);
  const nodeBoxes = new Map();
  nodes.forEach((id) => {
    const isHighlight = id === visual.highlight;
    const idSize = isHighlight ? 25 : 21;
    const labelSize = isHighlight ? 22 : 18;
    const labelLineHeight = isHighlight ? 25 : 21;
    const labelMaxWidth = isHighlight ? 180 : 118;
    const labelLines = wrapTextToWidth(visual.labels?.[id] || "", {
      size: labelSize,
      lineHeight: labelLineHeight,
      maxWidth: labelMaxWidth,
      maxLines: 2,
    });
    const idMetrics = measureTextLines([`#${id}`], idSize, idSize * 1.1);
    const labelMetrics = measureTextLines(labelLines, labelSize, labelLineHeight);
    const w = clamp(Math.ceil(Math.max(idMetrics.width, labelMetrics.width) + 44), isHighlight ? 160 : 124, isHighlight ? 230 : 164);
    const h = clamp(Math.ceil(idMetrics.height + labelMetrics.height + 38), isHighlight ? 106 : 88, isHighlight ? 154 : 132);
    nodeBoxes.set(id, {
      idSize,
      labelSize,
      labelLineHeight,
      labelLines,
      w,
      h,
      idY: -(labelMetrics.height + 4) / 2,
      labelY: (idMetrics.height + 4) / 2,
    });
  });
  (visual.edges || []).forEach(([from, to], i) => {
    const a = pos.get(from);
    const b = pos.get(to);
    if (!a || !b) return;
    const fromBox = nodeBoxes.get(from) || { h: 86 };
    const toBox = nodeBoxes.get(to) || { h: 86 };
    curve(canvas, rc, a[0], a[1] + fromBox.h / 2 - 4, b[0], b[1] - toBox.h / 2 + 4, (i % 2 ? 20 : -16), {
      arrow: true,
      stroke: to === visual.highlight ? colors.red : colors.lineDark,
      strokeWidth: to === visual.highlight ? 3.2 : 2.4,
      seed: 210 + i,
    });
  });
  nodes.forEach((id, i) => {
    const [x, y] = pos.get(id);
    const isHighlight = id === visual.highlight;
    const box = nodeBoxes.get(id);
    ellipse(canvas, rc, x, y, box.w, box.h, {
      fill: isHighlight ? colors.pink : (i % 2 ? colors.bluePale : colors.gray),
      opaqueFill: isHighlight ? colors.pink : (i % 2 ? colors.bluePale : colors.gray),
      stroke: isHighlight ? colors.red : colors.ink,
      strokeWidth: isHighlight ? 3.5 : 2.3,
      fillStyle: isHighlight ? "cross-hatch" : "hachure",
      hachureGap: isHighlight ? 7 : 9,
      seed: 240 + i,
    });
    canvas.add(svgText(x, y + box.idY, `#${id}`, { size: box.idSize, weight: 800, maxWidth: box.w - 24, maxLines: 1 }));
    canvas.add(svgText(x, y + box.labelY, box.labelLines, {
      size: box.labelSize,
      weight: 800,
      fill: isHighlight ? colors.red : colors.muted,
      lineHeight: box.labelLineHeight,
      maxWidth: box.w - 24,
      maxLines: 2,
    }));
  });
  const highlightPos = pos.get(visual.highlight);
  const highlightBox = visual.highlight ? nodeBoxes.get(visual.highlight) : null;
  if (highlightPos && highlightBox) canvas.add(`<path d="M${highlightPos[0] - highlightBox.w / 2 + 6} ${highlightPos[1] + highlightBox.h / 2 - 8} C${highlightPos[0] - 8} ${highlightPos[1] + highlightBox.h / 2 - 28} ${highlightPos[0] + 44} ${highlightPos[1] + highlightBox.h / 2 - 18} ${highlightPos[0] + highlightBox.w / 2 + 22} ${highlightPos[1] + highlightBox.h / 2 + 14}" fill="none" stroke="${colors.red}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`);
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
  const xMin = 125;
  const xMax = 1475;
  const yMin = 160;
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
  const radiusX = 440;
  const radiusY = 250;
  const sourceSteps = visual.steps || [];
  const steps = sourceSteps.map((step, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(sourceSteps.length, 1);
    return {
    ...step,
    x: center[0] + Math.cos(angle) * radiusX,
    y: center[1] + Math.sin(angle) * radiusY,
  };
  });
  for (let i = 0; i < steps.length; i += 1) {
    const a = steps[i];
    const b = steps[(i + 1) % steps.length];
    curve(canvas, rc, a.x, a.y, b.x, b.y, i === steps.length - 1 ? -70 : 18, {
      arrow: true,
      stroke: b.id === visual.highlight ? colors.red : colors.lineDark,
      strokeWidth: b.id === visual.highlight ? 3.1 : 2.4,
      seed: 350 + i,
    });
  }
  ellipse(canvas, rc, center[0], center[1], 300, 150, { fill: colors.yellowPale, stroke: colors.red, strokeWidth: 3.4, fillStyle: "cross-hatch", hachureGap: 12, seed: 370 });
  canvas.add(svgText(center[0], center[1] + 8, visual.center, { size: 31, weight: 900, fill: colors.red, lineHeight: 36, maxWidth: 250, maxLines: 2 }));
  steps.forEach((step, i) => {
    const highlighted = step.id === visual.highlight;
    rect(canvas, rc, step.x - 132, step.y - 52, 264, 104, {
      fill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray, colors.redPale][i % 5],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.3 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      hachureGap: highlighted ? 8 : 11,
      roughness: 2,
      seed: 380 + i,
    });
    canvas.add(svgText(step.x, step.y - 10, step.label, { size: 25, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 28, maxWidth: 230, maxLines: 2 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
}

function drawDualLoop(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(304);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const loops = visual.loops || [];
  const centerY = 480;
  const startX = 350;
  const span = 980;
  const centers = loops.map((_, idx) => {
    const x = loops.length === 1 ? 800 : startX + (idx / Math.max(1, loops.length - 1)) * span;
    return [x, centerY];
  });
  loops.forEach((loopSpec, loopIdx) => {
    const center = centers[loopIdx] || [565 + loopIdx * 450, 480];
    const steps = loopSpec.steps || [];
    const highlighted = loopSpec.id === visual.highlight;
    const loopW = clamp(420 - loops.length * 22, 220, 330);
    const loopH = clamp(240 - loops.length * 8, 160, 210);
    ellipse(canvas, rc, center[0], center[1], loopW, loopH, { fill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray][loopIdx % 4], stroke: highlighted ? colors.red : colors.ink, strokeWidth: highlighted ? 3.4 : 2.4, seed: 1360 + loopIdx });
    canvas.add(svgText(center[0], center[1] - 10, loopSpec.label, { size: 28, weight: 900, fill: highlighted ? colors.red : colors.ink, lineHeight: 31, maxWidth: loopW - 52, maxLines: 2 }));
    steps.forEach((step, i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, steps.length);
      const x = center[0] + Math.cos(angle) * (loopW / 2 + 18);
      const y = center[1] + Math.sin(angle) * (loopH / 2 + 14);
      ellipse(canvas, rc, x, y, 96, 50, { fill: "#ffffff", stroke: highlighted ? colors.red : colors.ink, seed: 1380 + loopIdx * 20 + i });
      canvas.add(svgText(x, y + 7, step.label, { size: 18, weight: 800, lineHeight: 20, maxWidth: 82, maxLines: 2 }));
    });
  });
  for (let i = 0; i < centers.length - 1; i += 1) {
    line(canvas, rc, centers[i][0] + 90, centers[i][1], centers[i + 1][0] - 90, centers[i + 1][1], { arrow: true, stroke: colors.red, strokeWidth: 3.2, seed: 1400 + i * 2 });
    line(canvas, rc, centers[i + 1][0] - 90, centers[i][1] + 55, centers[i][0] + 90, centers[i][1] + 55, { arrow: true, stroke: colors.muted, strokeWidth: 2.2, seed: 1401 + i * 2 });
  }
  if (centers.length > 1 && visual.bridge_label) {
    canvas.add(svgText((centers[0][0] + centers[centers.length - 1][0]) / 2, centerY - 32, visual.bridge_label, { size: 23, weight: 900, fill: colors.red }));
  }
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
    ellipse(canvas, rc, x, y, highlighted ? 146 : 124, highlighted ? 84 : 70, { fill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray][i % 4], stroke: highlighted ? colors.red : colors.ink, strokeWidth: highlighted ? 3.3 : 2.2, seed: 1440 + i });
    canvas.add(svgText(x, y - 4, step.label, { size: 22, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 24, maxWidth: highlighted ? 128 : 106, maxLines: 2 }));
    last = [x, y];
  });
  canvas.add(svgText(760, 216, visual.center, { size: 35, weight: 900, fill: colors.red, maxWidth: 520, maxLines: 2 }));
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
  const palette = [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray, colors.redPale];
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
    canvas.add(svgText(x + stepW / 2, y - 16, step.label, { size: stepW < 140 ? 20 : 25, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 24, maxWidth: stepW - 30, maxLines: 2 }));
    if (i < steps.length - 1) {
      curve(canvas, rc, x + stepW + 8, y, x + stepW + gap - 8, y, i % 2 ? -18 : 18, {
        arrow: true,
        stroke: highlighted ? colors.red : colors.ink,
        strokeWidth: highlighted ? 3 : 2.1,
        seed: 470 + i,
      });
    }
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
  const palette = [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray, colors.redPale];
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
    canvas.add(svgText(x, y + stepH / 2 - 8, step.label, { size: 25, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 27, maxWidth: 350, maxLines: 2 }));
    if (step.time) {
      canvas.add(svgText(x, y + stepH / 2 + 30, step.time, { size: 18, fill: colors.muted, lineHeight: 21, maxWidth: 350, maxLines: 2 }));
    }
    if (i < steps.length - 1) line(canvas, rc, x, y + stepH + 8, x, y + stepH + gap - 8, { arrow: true, stroke: highlighted ? colors.red : colors.ink, strokeWidth: 2.2, seed: 1200 + i });
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
    rect(canvas, rc, x - 95, y + 52, 190, 118, { fill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray][i % 4], stroke: highlighted ? colors.red : colors.ink, seed: 1280 + i });
    canvas.add(svgText(x, y + 96, step.label, { size: 22, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: 24, maxWidth: 166, maxLines: 2 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
    rect(canvas, rc, x0, y, w, laneH - 12, { fill: [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray][laneIdx % 4], stroke: colors.line, strokeWidth: 1.6, hachureGap: 26, seed: 1300 + laneIdx });
    canvas.add(svgText(x0 + 70, y + laneH / 2, lane.label, { size: 23, weight: 900, fill: colors.red, lineHeight: 25, maxWidth: 120, maxLines: 2 }));
    const laneSteps = lane.steps || [];
    const slotW = (w - 190) / Math.max(1, laneSteps.length);
    laneSteps.forEach((step, stepIdx) => {
      const cx = x0 + 170 + stepIdx * slotW + slotW / 2;
      const cy = y + laneH / 2;
      const highlighted = step.id === visual.highlight;
      rect(canvas, rc, cx - 95, cy - 42, 190, 84, { fill: highlighted ? colors.pink : "#ffffff", stroke: highlighted ? colors.red : colors.ink, strokeWidth: highlighted ? 3.1 : 2, seed: 1320 + laneIdx * 20 + stepIdx });
      canvas.add(svgText(cx, cy + 8, step.label, { size: 21, weight: 800, fill: highlighted ? colors.red : colors.ink, lineHeight: 23, maxWidth: 162, maxLines: 2 }));
      if (stepIdx < laneSteps.length - 1) line(canvas, rc, cx + 100, cy, cx + slotW - 100, cy, { arrow: true, stroke: colors.ink, strokeWidth: 2, seed: 1340 + laneIdx * 20 + stepIdx });
    });
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
  line(canvas, rc, midX, y0 + 12, midX, y0 + h - 12, { stroke: colors.lineDark, strokeWidth: 2, seed: 511 });
  line(canvas, rc, x0 + 12, midY, x0 + w - 12, midY, { stroke: colors.lineDark, strokeWidth: 2, seed: 512 });
  line(canvas, rc, x0, y0 + h + 36, x0 + w, y0 + h + 36, { arrow: true, stroke: colors.red, strokeWidth: 2.4, seed: 513 });
  line(canvas, rc, x0 - 42, y0 + h, x0 - 42, y0, { arrow: true, stroke: colors.red, strokeWidth: 2.4, seed: 514 });

  canvas.add(svgText(x0 + w / 2, y0 + h + 76, visual.x_axis.label, { size: 24, weight: 800, fill: colors.red, maxWidth: 420, maxLines: 2 }));
  canvas.add(svgText(x0 - 94, y0 + h / 2, visual.y_axis.label, { size: 24, weight: 800, fill: colors.red, maxWidth: 180, maxLines: 3 }));
  canvas.add(svgText(x0, y0 + h + 22, visual.x_axis.left, { size: 20, anchor: "start", fill: colors.muted, maxWidth: 210, maxLines: 2 }));
  canvas.add(svgText(x0 + w, y0 + h + 22, visual.x_axis.right, { size: 20, anchor: "end", fill: colors.muted, maxWidth: 210, maxLines: 2 }));
  canvas.add(svgText(x0 - 58, y0 + h, visual.y_axis.bottom, { size: 20, anchor: "end", fill: colors.muted, maxWidth: 180, maxLines: 2 }));
  canvas.add(svgText(x0 - 58, y0, visual.y_axis.top, { size: 20, anchor: "end", fill: colors.muted, maxWidth: 180, maxLines: 2 }));

  if ((visual.items || []).length > 8) {
    throw new Error(`quadrant_matrix supports at most 8 items without tiny labels; received ${(visual.items || []).length}.`);
  }

  (visual.items || []).forEach((item, i) => {
    const px = x0 + Math.max(0.06, Math.min(0.94, Number(item.x) || 0.5)) * w;
    const py = y0 + (1 - Math.max(0.06, Math.min(0.94, Number(item.y) || 0.5))) * h;
    const highlighted = item.label === visual.highlight || item.id === visual.highlight;
    const dense = visual.items.length > 8;
    const itemW = dense ? 152 : 170;
    const itemH = dense ? 82 : 74;
    const fill = highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray][i % 4];
    ellipse(canvas, rc, px, py, highlighted ? itemW + 24 : itemW, highlighted ? itemH + 12 : itemH, {
      fill,
      opaqueFill: fill,
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.5 : 2.3,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 530 + i,
    });
    canvas.add(svgText(px, py - (dense ? 6 : 8), item.label, {
      size: dense ? 14 : 23,
      weight: 850,
      fill: highlighted ? colors.red : colors.ink,
      lineHeight: dense ? 15 : 22,
      maxWidth: itemW - 24,
      maxLines: 2,
    }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
  columns.forEach((column, idx) => canvas.add(svgText(grid.x + idx * cellW + cellW / 2, grid.y - 30, column, { size: 22, weight: 850, fill: colors.red, lineHeight: 24, maxWidth: cellW - 14, maxLines: 2 })));
  rows.forEach((row, rowIdx) => {
    canvas.add(svgText(grid.x - 28, grid.y + rowIdx * cellH + cellH / 2 + 8, row, { size: 22, weight: 850, anchor: "end", fill: colors.ink, lineHeight: 24, maxWidth: 210, maxLines: 2 }));
    columns.forEach((column, colIdx) => {
      const value = values[rowIdx]?.[colIdx] ?? "";
      const highlighted = visual.highlight?.row === row && visual.highlight?.column === column;
      rect(canvas, rc, grid.x + colIdx * cellW, grid.y + rowIdx * cellH, cellW - 10, cellH - 10, {
        fill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray][(rowIdx + colIdx) % 4],
        stroke: highlighted ? colors.red : colors.ink,
        strokeWidth: highlighted ? 3.2 : 1.8,
        fillStyle: highlighted ? "cross-hatch" : "hachure",
        seed: 1460 + rowIdx * 20 + colIdx,
      });
      canvas.add(svgText(grid.x + colIdx * cellW + cellW / 2 - 5, grid.y + rowIdx * cellH + cellH / 2 + 8, value, { size: 21, weight: 800, fill: highlighted ? colors.red : colors.ink, lineHeight: 23, maxWidth: cellW - 18, maxLines: 2 }));
    });
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
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
      fill: highlighted ? colors.pink : [colors.yellowPale, colors.greenPale, colors.bluePale, colors.gray, colors.redPale][idx % 5],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.4 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 1500 + idx,
    });
    canvas.add(svgText(centerX, y + levelH / 2 - 4, level.label, { size: 26, weight: 900, fill: highlighted ? colors.red : colors.ink, lineHeight: 29, maxWidth: Math.max(180, wBottom - 80), maxLines: 2 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
}

function drawGenericNetworkGraph(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(607);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const nodes = visual.nodes || [];
  const center = [800, 475];
  const dense = nodes.length > 8;
  const veryDense = nodes.length > 10;
  const radiusX = veryDense ? 560 : (dense ? 520 : 480);
  const radiusY = veryDense ? 318 : (dense ? 292 : 270);
  const nodeW = veryDense ? 150 : (dense ? 178 : 232);
  const nodeH = veryDense ? 70 : (dense ? 82 : 104);
  const labelSize = veryDense ? 15 : (dense ? 18 : 22);
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
    rect(canvas, rc, x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, {
      fill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray, colors.redPale][i % 5],
      opaqueFill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray, colors.redPale][i % 5],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.3 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 1580 + i,
    });
    canvas.add(svgText(x, y - (dense ? 7 : 9), node.label, { size: labelSize, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: veryDense ? 17 : (dense ? 20 : 24), maxWidth: nodeW - 20, maxLines: 2 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
}

function drawHubSpokeNetwork(spec) {
  const colors = DIAGRAM_STYLE.color;
  const { rc } = roughSvg(606);
  const canvas = createCanvas();
  const visual = spec.visual_spec || {};
  const hub = visual.hub || { id: "", label: "" };
  const nodes = visual.nodes || [];
  const center = [800, 475];
  const dense = nodes.length > 8;
  const veryDense = nodes.length > 10;
  const radiusX = veryDense ? 560 : (dense ? 520 : 455);
  const radiusY = veryDense ? 318 : (dense ? 292 : 245);
  const nodeW = veryDense ? 150 : (dense ? 178 : 230);
  const nodeH = veryDense ? 70 : (dense ? 82 : 110);
  const labelSize = veryDense ? 15 : (dense ? 18 : 22);
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

  ellipse(canvas, rc, center[0], center[1], 250, 142, { fill: colors.yellowPale, opaqueFill: colors.yellowPale, stroke: colors.red, strokeWidth: 3.5, fillStyle: "cross-hatch", seed: 650 });
  canvas.add(svgText(center[0], center[1] + 8, hub.label, { size: 32, weight: 900, fill: colors.red, lineHeight: 35, maxWidth: 210, maxLines: 2 }));

  nodes.forEach((node, i) => {
    const [x, y] = positions.get(node.id);
    const highlighted = node.id === visual.highlight || node.label === visual.highlight;
    rect(canvas, rc, x - nodeW / 2, y - nodeH / 2, nodeW, nodeH, {
      fill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray, colors.redPale][i % 5],
      opaqueFill: highlighted ? colors.pink : [colors.bluePale, colors.greenPale, colors.yellowPale, colors.gray, colors.redPale][i % 5],
      stroke: highlighted ? colors.red : colors.ink,
      strokeWidth: highlighted ? 3.3 : 2.2,
      fillStyle: highlighted ? "cross-hatch" : "hachure",
      seed: 660 + i,
    });
    canvas.add(svgText(x, y - (dense ? 7 : 10), node.label, { size: labelSize, weight: 850, fill: highlighted ? colors.red : colors.ink, lineHeight: veryDense ? 17 : (dense ? 20 : 24), maxWidth: nodeW - 20, maxLines: 2 }));
  });
  return baseSvg(spec.title, spec.claim, canvas.chunks.join("\n"), { ...spec._canvasOptions, _contentBounds: canvas.bounds });
}

function getVisualAnchorRenderer(env = process.env) {
  const renderer = env.HW_VISUAL_ANCHOR_RENDERER || "rough_svg";
  if (!["rough_svg", "ppt_native"].includes(renderer)) {
    throw new Error(`Unsupported HW_VISUAL_ANCHOR_RENDERER: ${renderer}. Use rough_svg or ppt_native.`);
  }
  return renderer;
}

function resolveVisualAnchorRenderPath(spec, env = process.env) {
  validateVisualAnchorSpec(spec);
  if (spec.kind === "Evidence") return "evidence";
  if (spec.kind === "Matrix" && spec.template === "table") return "ppt_native";
  return getVisualAnchorRenderer(env);
}

function renderVisualAnchorRoughSvg(spec, options = {}) {
  validateVisualAnchorSpec(spec);
  const renderPath = resolveVisualAnchorRenderPath(spec);
  if (renderPath !== "rough_svg") {
    throw new Error(`Visual anchor ${spec.kind}/${spec.template} is configured for ${renderPath}, not rough_svg.`);
  }
  const layout = spec.layout || chooseTemplateLayout(spec);
  const exportOptions = normalizeExportOptions(spec, options);
  const renderSpec = { ...spec, layout, _canvasOptions: { _exportOptions: exportOptions, _spec: spec } };
  const template = spec.template || spec.kind;
  if (template === "data_cards") return drawDataCards(renderSpec);
  if (template === "bar_chart") return drawGroupedBarChart(renderSpec);
  if (template === "line_chart") return drawLineChart(renderSpec);
  if (template === "proportion_chart") return drawDonutProportionChart(renderSpec);
  if (template === "heatmap") return drawHeatmap(renderSpec);
  if (template === "layered_architecture") return drawLayeredArchitecture(renderSpec);
  if (template === "tree") return drawArchiveEvolutionTree(renderSpec);
  if (template === "capability_stack") return drawPyramidCapabilityStack(renderSpec);
  if (template === "closed_loop") return drawSelfImprovementLoop(renderSpec);
  if (template === "dual_loop") return drawDualLoop(renderSpec);
  if (template === "spiral_iteration_ladder") return drawSpiralIterationLadder(renderSpec);
  if (template === "process" && renderSpec.visual_spec?.orientation === "vertical") return drawVerticalProcess(renderSpec);
  if (template === "process") return drawHorizontalSequence(renderSpec);
  if (template === "timeline") return drawTimeline(renderSpec);
  if (template === "swimlane") return drawSwimlane(renderSpec);
  if (template === "quadrant_matrix") return drawQuadrantMatrix(renderSpec);
  if (template === "capability_matrix") return drawMatrixGrid(renderSpec);
  if (template === "hub_spoke_network") return drawHubSpokeNetwork(renderSpec);
  if (template === "dependency_graph" || template === "module_interaction_map" || template === "causal_influence_graph") return drawGenericNetworkGraph(renderSpec);
  throw new Error(`Unsupported rough_svg visual anchor template: ${template}`);
}

function createVisualAnchorSvg(spec, options = {}) {
  const renderPath = resolveVisualAnchorRenderPath(spec);
  if (renderPath !== "rough_svg") {
    throw new Error(`Visual anchor ${spec.kind}/${spec.template} is configured for ${renderPath}, not rough_svg SVG export.`);
  }
  return renderVisualAnchorRoughSvg(spec, options).svg;
}

function createVisualAnchorImage(spec, options = {}) {
  const renderPath = resolveVisualAnchorRenderPath(spec);
  if (renderPath !== "rough_svg") {
    throw new Error(`Visual anchor ${spec.kind}/${spec.template} is configured for ${renderPath}, not rough_svg image export.`);
  }
  const rendered = renderVisualAnchorRoughSvg(spec, options);
  return {
    format: "svg",
    mimeType: "image/svg+xml",
    width: rendered.width,
    height: rendered.height,
    svg: rendered.svg,
  };
}

function valueAt(values, row, col) {
  return Array.isArray(values?.[row]) ? values[row][col] : "";
}

function estimateNativeTextUnits(text) {
  let units = 0;
  for (const char of String(text || "")) {
    if (/[\u3400-\u9fff]/.test(char)) units += 1;
    else if (/[A-Z]/.test(char)) units += 0.72;
    else if (/[a-z]/.test(char)) units += 0.55;
    else if (/[0-9]/.test(char)) units += 0.55;
    else if (/\s/.test(char)) units += 0.3;
    else units += 0.35;
  }
  return units;
}

function estimateNativeTextWidth(text, fontSize) {
  return estimateNativeTextUnits(text) * (fontSize / 72);
}

function normalizeNativeMargin(margin) {
  if (typeof margin === "number") return margin;
  if (Array.isArray(margin)) return Math.max(...margin.map((value) => Number(value) || 0));
  if (margin && typeof margin === "object") return Math.max(...Object.values(margin).map((value) => Number(value) || 0));
  return 0.04;
}

function wrapNativeTextToBox(text, opts) {
  const value = safeText(text);
  if (!value) return "";
  const fontSize = opts.fontSize || 11;
  if (fontSize < TEXT_LIMITS.minNativeFontSize) {
    throw new Error(`ppt_native text font size ${fontSize} is below the ${TEXT_LIMITS.minNativeFontSize}pt minimum: ${value}`);
  }
  const boxW = Number(opts.w);
  const boxH = Number(opts.h);
  if (!Number.isFinite(boxW) || boxW <= 0 || !Number.isFinite(boxH) || boxH <= 0) return value;

  const margin = normalizeNativeMargin(opts.margin);
  const maxWidth = boxW - margin * 2;
  const lineHeight = (fontSize / 72) * (opts.lineSpacingMultiple || 1.16);
  const maxLines = Math.max(1, Math.floor((boxH - margin * 2) / lineHeight));
  if (maxWidth <= 0) {
    throw new Error(`ppt_native text box is too narrow for ${value}`);
  }

  const output = [];
  const pushLine = (line) => {
    if (output.length >= maxLines) {
      throw new Error(`ppt_native text exceeds ${maxLines} line(s) in ${boxW.toFixed(2)}x${boxH.toFixed(2)} box: ${value}`);
    }
    output.push(trimLineEnd(line));
  };

  for (const rawLine of value.split("\n")) {
    const tokens = splitTextForWrap(rawLine);
    if (!tokens.length) {
      pushLine("");
      continue;
    }
    let current = "";
    for (const token of tokens) {
      const candidate = current ? `${current}${token}` : token;
      if (estimateNativeTextWidth(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) pushLine(current);
      let rest = token.trimStart();
      while (rest && estimateNativeTextWidth(rest, fontSize) > maxWidth) {
        let chunk = "";
        for (const char of Array.from(rest)) {
          if (chunk && estimateNativeTextWidth(`${chunk}${char}`, fontSize) > maxWidth) break;
          chunk += char;
        }
        if (!chunk) throw new Error(`ppt_native text token cannot fit at ${fontSize}pt: ${token}`);
        pushLine(chunk);
        rest = Array.from(rest).slice(Array.from(chunk).length).join("");
      }
      current = rest;
    }
    if (current) pushLine(current);
  }

  return output.join("\n");
}

function nativeText(slide, text, options = {}) {
  if (options.fit) {
    throw new Error(`ppt_native text does not allow fit:${options.fit}; resize the box, wrap text, or reject the render.`);
  }
  const opts = {
    fontFace: "Microsoft YaHei",
    fontSize: 11,
    color: "333333",
    margin: 0.04,
    breakLine: false,
    ...options,
  };
  slide.addText(wrapNativeTextToBox(text, opts), opts);
}

function nativeRect(slide, x, y, w, h, options = {}) {
  slide.addShape(ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: options.fill || "F7F7F7" },
    line: { color: options.stroke || "BFBFBF", width: options.strokeWidth || 0.5 },
  });
}

function nativeLine(slide, x1, y1, x2, y2, options = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  slide.addShape(ShapeType.line, {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(dx),
    h: Math.abs(dy),
    flipH: dx < 0,
    flipV: dy < 0,
    line: {
      color: options.color || "BFBFBF",
      width: options.width || 0.5,
      ...(options.endArrowType ? { endArrowType: options.endArrowType } : {}),
    },
  });
}

function drawNativeTable(slide, visual, area) {
  const rows = visual.rows || [];
  if (!rows.length) throw new Error("Matrix/table native render requires visual_spec.rows.");
  const colCount = Math.max(...rows.map((row) => row.length), 1);
  const rowH = Math.min(0.42, area.h / Math.max(rows.length, 1));
  const colW = area.w / colCount;
  rows.forEach((row, rowIdx) => {
    row.forEach((cell, colIdx) => {
      const x = area.x + colIdx * colW;
      const y = area.y + rowIdx * rowH;
      nativeRect(slide, x, y, colW, rowH, {
        fill: rowIdx === 0 ? "C00000" : (rowIdx % 2 ? "FFFFFF" : "F7F7F7"),
        stroke: "D9D9D9",
      });
      nativeText(slide, cell, {
        x: x + 0.04,
        y: y + 0.1,
        w: colW - 0.08,
        h: rowH - 0.12,
        fontSize: rowIdx === 0 ? 9 : 8,
        bold: rowIdx === 0 || colIdx === 0,
        color: rowIdx === 0 ? "FFFFFF" : "333333",
        align: "center",
      });
    });
  });
}

function drawNativeEvidence(slide, spec, area) {
  const source = spec.source || {};
  nativeRect(slide, area.x, area.y, area.w, area.h, { fill: "FFFFFF", stroke: "C00000", strokeWidth: 0.8 });
  const imagePath = source.path ? path.resolve(source.path) : "";
  const imageBox = { x: area.x + 0.18, y: area.y + 0.18, w: area.w - 0.36, h: area.h - 0.92 };
  if (imagePath && fs.existsSync(imagePath)) {
    const dimensions = readImageDimensions(imagePath);
    const fitted = dimensions ? fitAreaContain(imageBox, dimensions.width, dimensions.height) : imageBox;
    slide.addImage({ path: imagePath, ...fitted });
  } else {
    nativeRect(slide, area.x + 0.25, area.y + 0.25, area.w - 0.5, area.h - 1.1, { fill: "F7F7F7", stroke: "D9D9D9" });
    nativeText(slide, source.path || source.id, { x: area.x + 0.45, y: area.y + 0.72, w: area.w - 0.9, h: 0.32, fontSize: 12, bold: true, color: "595959", align: "center" });
  }
  nativeText(slide, source.caption, { x: area.x + 0.22, y: area.y + area.h - 0.44, w: area.w - 0.44, h: 0.2, fontSize: 10, bold: true, italic: true, color: "333333", align: "center" });
}

function fitAreaContain(area, imageWidth, imageHeight) {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) return area;
  const areaRatio = area.w / area.h;
  const imageRatio = imageWidth / imageHeight;
  if (imageRatio >= areaRatio) {
    const h = area.w / imageRatio;
    return { x: area.x, y: area.y + (area.h - h) / 2, w: area.w, h };
  }
  const w = area.h * imageRatio;
  return { x: area.x + (area.w - w) / 2, y: area.y, w, h: area.h };
}

function readImageDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (ext === ".svg") {
    const text = buffer.toString("utf8");
    const width = Number((text.match(/\bwidth="([0-9.]+)"/) || [])[1]);
    const height = Number((text.match(/\bheight="([0-9.]+)"/) || [])[1]);
    if (Number.isFinite(width) && Number.isFinite(height)) return { width, height };
    const viewBox = (text.match(/\bviewBox="([^"]+)"/) || [])[1];
    if (viewBox) {
      const [, , w, h] = viewBox.split(/\s+/).map(Number);
      if (Number.isFinite(w) && Number.isFinite(h)) return { width: w, height: h };
    }
  }
  return null;
}

function drawNativeDataCards(slide, visual, area) {
  const cards = visual.cards || [];
  const gap = 0.14;
  const cardW = (area.w - gap * Math.max(0, cards.length - 1)) / Math.max(1, cards.length);
  cards.forEach((card, idx) => {
    const x = area.x + idx * (cardW + gap);
    const highlighted = card.id === visual.highlight || card.label === visual.highlight;
    nativeRect(slide, x, area.y, cardW, area.h, { fill: highlighted ? "FFF1EF" : "F7F7F7", stroke: highlighted ? "C00000" : "BFBFBF", strokeWidth: highlighted ? 1 : 0.5 });
    nativeText(slide, card.value, { x: x + 0.08, y: area.y + 0.34, w: cardW - 0.16, h: 0.42, fontFace: "Impact", fontSize: 26, color: highlighted ? "C00000" : "333333", align: "center" });
    nativeText(slide, card.unit || "", { x: x + 0.08, y: area.y + 0.8, w: cardW - 0.16, h: 0.18, fontSize: 9, color: "595959", align: "center" });
    nativeText(slide, card.label || "", { x: x + 0.08, y: area.y + 1.15, w: cardW - 0.16, h: 0.22, fontSize: 12, bold: true, align: "center" });
  });
}

function drawNativeBarChart(slide, visual, area) {
  const categories = visual.categories || [];
  const series = visual.series || [];
  const values = series.flatMap((entry) => entry.values || []).map(Number).filter(Number.isFinite);
  const max = Math.max(...values, 1);
  const chart = { x: area.x + 0.35, y: area.y + 0.35, w: area.w - 0.7, h: area.h - 0.85 };
  slide.addShape(ShapeType.line, { x: chart.x, y: chart.y + chart.h, w: chart.w, h: 0, line: { color: "8C8C8C", width: 0.5 } });
  const groupW = chart.w / Math.max(1, categories.length);
  const barW = Math.min(0.22, groupW / Math.max(1, series.length + 1));
  categories.forEach((category, catIdx) => {
    series.forEach((entry, seriesIdx) => {
      const value = Number(entry.values?.[catIdx]) || 0;
      const h = chart.h * value / max;
      const x = chart.x + catIdx * groupW + 0.12 + seriesIdx * (barW + 0.05);
      const y = chart.y + chart.h - h;
      const highlighted = visual.highlight?.category === category && visual.highlight?.series === entry.name;
      nativeRect(slide, x, y, barW, h, { fill: highlighted ? "C00000" : "D9D9D9", stroke: highlighted ? "C00000" : "BFBFBF" });
    });
    nativeText(slide, category, { x: chart.x + catIdx * groupW, y: chart.y + chart.h + 0.08, w: groupW, h: 0.16, fontSize: 7, align: "center" });
  });
}

function drawNativeLineChart(slide, visual, area) {
  const categories = visual.categories || [];
  const series = visual.series || [];
  const values = series.flatMap((entry) => entry.values || []).map(Number).filter(Number.isFinite);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const chart = { x: area.x + 0.45, y: area.y + 0.38, w: area.w - 0.9, h: area.h - 0.9 };
  nativeRect(slide, chart.x, chart.y, chart.w, chart.h, { fill: "FFFFFF", stroke: "D9D9D9" });
  series.forEach((entry, seriesIdx) => {
    const points = (entry.values || []).map((value, idx) => {
      const x = chart.x + (categories.length === 1 ? chart.w / 2 : (idx / (categories.length - 1)) * chart.w);
      const ratio = max === min ? 0.5 : (Number(value) - min) / (max - min);
      const y = chart.y + chart.h - ratio * chart.h;
      return { x, y };
    });
    for (let i = 0; i < points.length - 1; i += 1) {
      nativeLine(slide, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, { color: seriesIdx ? "8C8C8C" : "C00000", width: 1.2 });
    }
    points.forEach((point) => slide.addShape("ellipse", { x: point.x - 0.035, y: point.y - 0.035, w: 0.07, h: 0.07, fill: { color: seriesIdx ? "8C8C8C" : "C00000" }, line: { color: "FFFFFF", width: 0.2 } }));
  });
  categories.forEach((category, idx) => nativeText(slide, category, { x: chart.x + idx * (chart.w / Math.max(1, categories.length - 1)) - 0.25, y: chart.y + chart.h + 0.08, w: 0.5, h: 0.16, fontSize: 7, align: "center" }));
}

function drawNativeGrid(slide, visual, area) {
  const rows = visual.rows || [];
  const columns = visual.columns || [];
  const cellW = area.w / Math.max(1, columns.length);
  const cellH = area.h / Math.max(1, rows.length);
  rows.forEach((row, rowIdx) => {
    columns.forEach((column, colIdx) => {
      const highlighted = visual.highlight?.row === row && visual.highlight?.column === column;
      nativeRect(slide, area.x + colIdx * cellW, area.y + rowIdx * cellH, cellW - 0.03, cellH - 0.03, { fill: highlighted ? "FFF1EF" : (rowIdx % 2 ? "FFFFFF" : "F7F7F7"), stroke: highlighted ? "C00000" : "D9D9D9" });
      nativeText(slide, String(valueAt(visual.values, rowIdx, colIdx)), { x: area.x + colIdx * cellW + 0.04, y: area.y + rowIdx * cellH + 0.08, w: cellW - 0.08, h: 0.18, fontSize: 9, align: "center" });
    });
    nativeText(slide, row, { x: area.x - 0.62, y: area.y + rowIdx * cellH + 0.08, w: 0.55, h: 0.18, fontSize: 8, align: "right" });
  });
  columns.forEach((column, colIdx) => nativeText(slide, column, { x: area.x + colIdx * cellW, y: area.y - 0.22, w: cellW, h: 0.16, fontSize: 8, bold: true, align: "center", color: "C00000" }));
}

function drawNativeProcess(slide, visual, area) {
  const steps = visual.steps || [];
  const gap = 0.16;
  const stepW = (area.w - gap * Math.max(0, steps.length - 1)) / Math.max(1, steps.length);
  steps.forEach((step, idx) => {
    const x = area.x + idx * (stepW + gap);
    const highlighted = step.id === visual.highlight;
    nativeRect(slide, x, area.y + 0.85, stepW, 0.85, { fill: highlighted ? "C00000" : "F7F7F7", stroke: highlighted ? "C00000" : "BFBFBF" });
    nativeText(slide, step.label, { x: x + 0.04, y: area.y + 1.02, w: stepW - 0.08, h: 0.2, fontSize: 11, bold: true, align: "center", color: highlighted ? "FFFFFF" : "333333" });
    if (step.time) {
      nativeText(slide, step.time, { x: x + 0.04, y: area.y + 1.32, w: stepW - 0.08, h: 0.16, fontSize: 7, align: "center", color: highlighted ? "FFFFFF" : "595959" });
    }
    if (idx < steps.length - 1) slide.addShape(ShapeType.line, { x: x + stepW, y: area.y + 1.28, w: gap, h: 0, line: { color: "8C8C8C", width: 0.6, endArrowType: "triangle" } });
  });
}

function drawNativeLoop(slide, visual, area) {
  const steps = visual.steps || (visual.loops || []).flatMap((loop) => loop.steps || []).slice(0, 5);
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const radius = Math.min(area.w, area.h) * 0.34;
  nativeText(slide, visual.center || visual.loops?.[0]?.label || "", { x: cx - 0.8, y: cy - 0.16, w: 1.6, h: 0.28, fontSize: 13, bold: true, align: "center", color: "C00000" });
  steps.forEach((step, idx) => {
    const angle = -Math.PI / 2 + idx * (Math.PI * 2 / Math.max(1, steps.length));
    const x = cx + Math.cos(angle) * radius - 0.55;
    const y = cy + Math.sin(angle) * radius - 0.25;
    nativeRect(slide, x, y, 1.1, 0.5, { fill: step.id === visual.highlight ? "FFF1EF" : "F7F7F7", stroke: step.id === visual.highlight ? "C00000" : "BFBFBF" });
    nativeText(slide, step.label || step, { x: x + 0.05, y: y + 0.14, w: 1, h: 0.16, fontSize: 8, bold: true, align: "center" });
  });
}

function drawNativeHierarchy(slide, spec, area) {
  const visual = spec.visual_spec || {};
  if (spec.template === "capability_stack") {
    const levels = visual.levels || [];
    const levelH = area.h / Math.max(1, levels.length);
    levels.forEach((level, idx) => {
      const w = area.w - idx * 0.35;
      const x = area.x + (area.w - w) / 2;
      const y = area.y + area.h - (idx + 1) * levelH;
      const highlighted = level.label === visual.highlight;
      nativeRect(slide, x, y, w, levelH - 0.06, { fill: highlighted ? "C00000" : "F7F7F7", stroke: highlighted ? "C00000" : "BFBFBF" });
      nativeText(slide, level.label, { x: x + 0.1, y: y + 0.12, w: w - 0.2, h: 0.2, fontSize: 11, bold: true, align: "center", color: highlighted ? "FFFFFF" : "333333" });
    });
    return;
  }
  const labels = spec.template === "layered_architecture" ? (visual.layers || []).map((layer) => layer.label) : (visual.nodes || []).slice(0, 8);
  drawNativeProcess(slide, { steps: labels.map((label, idx) => ({ id: `h${idx}`, label })), highlight: "h0" }, area);
}

function drawNativeNetwork(slide, visual, area) {
  const nodes = visual.hub ? [visual.hub, ...(visual.nodes || [])] : (visual.nodes || []);
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const radius = Math.min(area.w, area.h) * 0.36;
  nodes.slice(0, 9).forEach((node, idx) => {
    const angle = idx === 0 ? 0 : -Math.PI / 2 + (idx - 1) * (Math.PI * 2 / Math.max(1, nodes.length - 1));
    const x = idx === 0 ? cx - 0.55 : cx + Math.cos(angle) * radius - 0.55;
    const y = idx === 0 ? cy - 0.28 : cy + Math.sin(angle) * radius - 0.28;
    if (idx > 0) nativeLine(slide, cx, cy, x + 0.55, y + 0.28);
    nativeRect(slide, x, y, 1.1, 0.56, { fill: idx === 0 ? "FFF1EF" : "F7F7F7", stroke: idx === 0 ? "C00000" : "BFBFBF" });
    nativeText(slide, node.label || node.id, { x: x + 0.05, y: y + 0.18, w: 1, h: 0.16, fontSize: 8, bold: true, align: "center" });
  });
}

function renderVisualAnchorPptNative(slide, spec, area = { x: 0.85, y: 1.42, w: 11.65, h: 5.25 }) {
  validateVisualAnchorSpec(spec);
  const renderPath = resolveVisualAnchorRenderPath(spec, { HW_VISUAL_ANCHOR_RENDERER: "ppt_native" });
  const visual = spec.visual_spec || {};
  nativeRect(slide, area.x, area.y, area.w, area.h, { fill: "FFFFFF", stroke: "D9D9D9" });
  const inner = { x: area.x + 0.55, y: area.y + 0.58, w: area.w - 1.1, h: area.h - 1.15 };

  if (renderPath === "evidence") return drawNativeEvidence(slide, spec, inner);
  if (spec.kind === "Matrix" && spec.template === "table") return drawNativeTable(slide, visual, inner);
  if (renderPath !== "ppt_native") throw new Error(`Visual anchor ${spec.kind}/${spec.template} is configured for ${renderPath}, not ppt_native.`);

  if (spec.template === "data_cards") return drawNativeDataCards(slide, visual, inner);
  if (spec.template === "bar_chart") return drawNativeBarChart(slide, visual, inner);
  if (spec.template === "line_chart") return drawNativeLineChart(slide, visual, inner);
  if (spec.template === "proportion_chart") return drawNativeLoop(slide, { center: visual.total_label, steps: (visual.segments || []).map((segment, idx) => ({ id: `s${idx}`, label: segment.label })), highlight: visual.highlight }, inner);
  if (spec.template === "heatmap" || spec.template === "capability_matrix") return drawNativeGrid(slide, visual, inner);
  if (["process", "timeline", "swimlane"].includes(spec.template)) return drawNativeProcess(slide, visual.lanes ? { steps: visual.lanes.flatMap((lane) => lane.steps || []).slice(0, 6), highlight: visual.highlight } : visual, inner);
  if (["closed_loop", "dual_loop", "spiral_iteration_ladder"].includes(spec.template)) return drawNativeLoop(slide, visual, inner);
  if (["tree", "layered_architecture", "capability_stack"].includes(spec.template)) return drawNativeHierarchy(slide, spec, inner);
  if (["hub_spoke_network", "dependency_graph", "module_interaction_map", "causal_influence_graph"].includes(spec.template)) return drawNativeNetwork(slide, visual, inner);
  if (spec.template === "quadrant_matrix") {
    nativeRect(slide, inner.x, inner.y, inner.w, inner.h, { fill: "FFFFFF", stroke: "8C8C8C" });
    slide.addShape(ShapeType.line, { x: inner.x + inner.w / 2, y: inner.y, w: 0, h: inner.h, line: { color: "D9D9D9", width: 0.5 } });
    slide.addShape(ShapeType.line, { x: inner.x, y: inner.y + inner.h / 2, w: inner.w, h: 0, line: { color: "D9D9D9", width: 0.5 } });
    (visual.items || []).forEach((item) => {
      const x = inner.x + item.x * inner.w - 0.32;
      const y = inner.y + (1 - item.y) * inner.h - 0.16;
      nativeRect(slide, x, y, 0.64, 0.32, { fill: item.label === visual.highlight ? "FFF1EF" : "F7F7F7", stroke: item.label === visual.highlight ? "C00000" : "BFBFBF" });
      nativeText(slide, item.label, { x: x + 0.04, y: y + 0.09, w: 0.56, h: 0.12, fontSize: 6, align: "center" });
    });
    return undefined;
  }

  throw new Error(`Unsupported ppt_native visual anchor template: ${spec.kind}/${spec.template}`);
}

function validateVisualAnchorSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") {
    throw new Error("Visual anchor spec must be an object.");
  }
  for (const field of ["id", "title", "claim", "kind", "template"]) {
    if (!safeText(spec[field])) errors.push(`Missing required field: ${field}`);
  }
  if ("renderer" in spec) errors.push("renderer is a runtime setting; do not include it in visual anchor specs.");
  if ("intent" in spec) errors.push("Use kind instead of the old intent field.");
  if ("visual_strategy" in spec) errors.push("visual_strategy has been removed; use kind and template only.");
  const validKinds = new Set(["Evidence", "Quantity", "Sequence", "Loop", "Hierarchy", "Matrix", "Network"]);
  if (spec.kind && !validKinds.has(spec.kind)) errors.push(`Unsupported kind: ${spec.kind}`);

  if (spec.kind === "Evidence") {
    if (!spec.source || typeof spec.source !== "object") errors.push("Evidence requires a source object.");
    if (spec.source && !safeText(spec.source.path) && !safeText(spec.source.id)) errors.push("Evidence source requires path or id.");
    if (spec.source && !safeText(spec.source.caption)) errors.push("Evidence source requires caption; do not rely on renderer fallback text.");
    if (!["source_figure", "source_table", "source_screenshot", "source_chart"].includes(spec.template)) {
      errors.push("Evidence template must be source_figure, source_table, source_screenshot, or source_chart.");
    }
    if (errors.length) throw new Error(`Invalid visual anchor spec "${spec.id || "(unknown)"}":\n- ${errors.join("\n- ")}`);
    return true;
  }

  const visual = spec.visual_spec;
  if (!visual || typeof visual !== "object") errors.push("Missing required object: visual_spec");
  if (visual && typeof visual === "object") {
    collectForbiddenVisualFields(visual, "visual_spec").forEach((error) => errors.push(error));
  }
  const template = spec.template;
  const templatesByKind = {
    Quantity: new Set(["data_cards", "bar_chart", "line_chart", "proportion_chart", "heatmap"]),
    Sequence: new Set(["process", "timeline", "swimlane"]),
    Loop: new Set(["closed_loop", "dual_loop", "spiral_iteration_ladder"]),
    Hierarchy: new Set(["tree", "layered_architecture", "capability_stack"]),
    Matrix: new Set(["table", "quadrant_matrix", "capability_matrix", "heatmap"]),
    Network: new Set(["hub_spoke_network", "dependency_graph", "module_interaction_map", "causal_influence_graph"]),
  };
  if (spec.kind && templatesByKind[spec.kind] && !templatesByKind[spec.kind].has(template)) {
    errors.push(`Unsupported template for ${spec.kind}: ${template}`);
  }

  if (spec.kind === "Matrix" && template === "table") {
    rejectUnknownFields(visual || {}, ["rows"], "visual_spec", errors);
    if (!Array.isArray(visual?.rows) || visual.rows.length < 1) errors.push("table requires visual_spec.rows.");
    if (errors.length) throw new Error(`Invalid visual anchor spec "${spec.id || "(unknown)"}":\n- ${errors.join("\n- ")}`);
    return true;
  }

  if (visual && spec.template === "layered_architecture") {
    rejectUnknownFields(visual, ["layers", "side_label", "side_modules", "edges"], "visual_spec", errors);
    if (!Array.isArray(visual.layers) || visual.layers.length < 3) errors.push("layered_architecture requires at least three visual_spec.layers.");
    if (!Array.isArray(visual.edges) || !visual.edges.length) errors.push("layered_architecture requires visual_spec.edges.");
    if (!Array.isArray(visual.side_modules)) errors.push("layered_architecture requires visual_spec.side_modules.");
    if ((visual.side_modules || []).length && !safeText(visual.side_label)) errors.push("layered_architecture with side_modules requires visual_spec.side_label.");
    if (Array.isArray(visual.layers) && Array.isArray(visual.edges)) {
      const itemIds = new Set([...visual.layers.flatMap((layer) => layer.items || []), ...(visual.side_modules || [])]);
      collectUnknownEdgeEndpoints(visual.edges, itemIds, "layered_architecture").forEach((error) => errors.push(error));
    }
  }

  if (visual && ["bar_chart", "line_chart"].includes(template)) {
    rejectUnknownFields(visual, ["y_label", "categories", "series", "highlight"], "visual_spec", errors);
    if (!safeText(visual.y_label)) errors.push(`${template} requires visual_spec.y_label.`);
    if (!Array.isArray(visual.categories) || visual.categories.length < 1) errors.push(`${template} requires visual_spec.categories.`);
    if (!Array.isArray(visual.series) || visual.series.length < 1) errors.push(`${template} requires visual_spec.series.`);
    validateSeriesValues(visual, template).forEach((error) => errors.push(error));
  }

  if (visual && template === "data_cards") {
    rejectUnknownFields(visual, ["cards", "highlight"], "visual_spec", errors);
    if (!Array.isArray(visual.cards) || visual.cards.length < 1) errors.push("data_cards requires visual_spec.cards.");
    if (Array.isArray(visual.cards)) {
      visual.cards.forEach((card, idx) => {
        if (!safeText(card.label)) errors.push(`data_cards card ${idx + 1} missing label.`);
        if (!safeText(card.value)) errors.push(`data_cards card ${idx + 1} missing value.`);
      });
    }
  }

  if (visual && template === "proportion_chart") {
    rejectUnknownFields(visual, ["total_label", "segments", "highlight"], "visual_spec", errors);
    if (!safeText(visual.total_label)) errors.push(`${template} requires visual_spec.total_label.`);
    if (!Array.isArray(visual.segments) || visual.segments.length < 2) errors.push(`${template} requires at least two visual_spec.segments.`);
    if (Array.isArray(visual.segments)) {
      visual.segments.forEach((segment, idx) => {
        if (!safeText(segment.label)) errors.push(`${template} segment ${idx + 1} missing label.`);
        if (!Number.isFinite(Number(segment.value))) errors.push(`${template} segment ${idx + 1} requires numeric value.`);
      });
    }
  }

  if (visual && template === "heatmap") {
    rejectUnknownFields(visual, ["rows", "columns", "values", "highlight"], "visual_spec", errors);
    validateGridValues(visual, template).forEach((error) => errors.push(error));
  }

  if (visual && template === "tree") {
    rejectUnknownFields(visual, ["nodes", "edges", "labels", "highlight"], "visual_spec", errors);
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

  if (visual && template === "capability_stack") {
    rejectUnknownFields(visual, ["levels", "highlight"], "visual_spec", errors);
    if (!Array.isArray(visual.levels) || visual.levels.length < 2) errors.push(`${template} requires at least two visual_spec.levels.`);
    if (Array.isArray(visual.levels)) {
      visual.levels.forEach((level, idx) => {
        if (!safeText(level.label)) errors.push(`${template} level ${idx + 1} missing label.`);
      });
    }
  }

  if (visual && ["closed_loop", "spiral_iteration_ladder"].includes(template)) {
    rejectUnknownFields(visual, ["center", "steps", "highlight"], "visual_spec", errors);
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

  if (visual && ["process", "timeline"].includes(template)) {
    rejectUnknownFields(visual, ["steps", "highlight", "orientation"], "visual_spec", errors);
    if (!Array.isArray(visual.steps) || visual.steps.length < 2) errors.push(`${template} requires at least two visual_spec.steps.`);
    if (Array.isArray(visual.steps)) {
      visual.steps.forEach((step, idx) => {
        if (!safeText(step.id)) errors.push(`${template} step ${idx + 1} missing id.`);
        if (!safeText(step.label)) errors.push(`${template} step ${idx + 1} missing label.`);
      });
      if (safeText(visual.highlight) && !visual.steps.some((step) => step.id === visual.highlight)) {
        errors.push(`${template} visual_spec.highlight must match a step id.`);
      }
    }
  }

  if (visual && template === "swimlane") {
    rejectUnknownFields(visual, ["lanes", "highlight"], "visual_spec", errors);
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
    rejectUnknownFields(visual, ["loops", "highlight", "bridge_label"], "visual_spec", errors);
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
    rejectUnknownFields(visual, ["x_axis", "y_axis", "items", "highlight"], "visual_spec", errors);
    if (!visual.x_axis || typeof visual.x_axis !== "object") errors.push("quadrant_matrix requires visual_spec.x_axis.");
    if (!visual.y_axis || typeof visual.y_axis !== "object") errors.push("quadrant_matrix requires visual_spec.y_axis.");
    if (visual.x_axis && (!safeText(visual.x_axis.left) || !safeText(visual.x_axis.right) || !safeText(visual.x_axis.label))) {
      errors.push("quadrant_matrix visual_spec.x_axis requires left, right, and label.");
    }
    if (visual.y_axis && (!safeText(visual.y_axis.bottom) || !safeText(visual.y_axis.top) || !safeText(visual.y_axis.label))) {
      errors.push("quadrant_matrix visual_spec.y_axis requires bottom, top, and label.");
    }
    if (!Array.isArray(visual.items) || visual.items.length < 2) errors.push("quadrant_matrix requires at least two visual_spec.items.");
    if (Array.isArray(visual.items)) {
      visual.items.forEach((item, idx) => {
        if (!safeText(item.label)) errors.push(`quadrant_matrix item ${idx + 1} missing label.`);
        if (typeof item.x !== "number" || typeof item.y !== "number") errors.push(`quadrant_matrix item ${idx + 1} requires numeric x and y.`);
      });
    }
  }

  if (visual && template === "capability_matrix") {
    rejectUnknownFields(visual, ["rows", "columns", "values", "highlight"], "visual_spec", errors);
    validateGridValues(visual, template).forEach((error) => errors.push(error));
  }

  if (visual && spec.template === "hub_spoke_network") {
    rejectUnknownFields(visual, ["hub", "nodes", "edges", "highlight"], "visual_spec", errors);
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
    rejectUnknownFields(visual, ["nodes", "edges", "highlight"], "visual_spec", errors);
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
    throw new Error(`Invalid visual anchor spec "${spec.id || "(unknown)"}":\n- ${errors.join("\n- ")}`);
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

function collectForbiddenVisualFields(value, pathName, errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, idx) => collectForbiddenVisualFields(item, `${pathName}[${idx}]`, errors));
    return errors;
  }
  if (!value || typeof value !== "object") return errors;
  Object.entries(value).forEach(([field, child]) => {
    const childPath = `${pathName}.${field}`;
    if (STANDALONE_VISUAL_SPEC_TEXT_FIELDS.includes(field)) {
      errors.push(`${childPath} is not supported; put slide-level explanations, captions, legends, and conclusions in editable PPT text boxes.`);
    }
    collectForbiddenVisualFields(child, childPath, errors);
  });
  return errors;
}

function rejectUnknownFields(value, allowedFields, pathName, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const allowed = new Set(allowedFields);
  Object.keys(value).forEach((field) => {
    if (!allowed.has(field)) {
      errors.push(`${pathName}.${field} is not part of the ${pathName} schema; remove it or move explanatory content to PPT text boxes.`);
    }
  });
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

function writeVisualAnchorSvg(spec, outDir, options = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = options.fileName || `${spec.id || spec.template || "visual_anchor"}.svg`;
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, createVisualAnchorSvg(spec, options), "utf8");
  return filePath;
}

function writeVisualAnchorImage(spec, outDir, options = {}) {
  return writeVisualAnchorSvg(spec, outDir, options);
}

module.exports = {
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
};
