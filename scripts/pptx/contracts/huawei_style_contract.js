"use strict";

const ALLOWED_FONT_SIZES_PT = Object.freeze([10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32]);
const ALLOWED_FONT_FACES = Object.freeze(["Microsoft YaHei", "微软雅黑", "HarmonyOS Sans SC"]);
const ALLOWED_COLORS = Object.freeze(["FFFFFF", "F7F7F7", "F2F2F2", "E6E6E6", "D9D9D9", "C00000", "333333", "666666", "999999", "000000"]);
const STANDARD_LINE_WIDTH_PT = 0.5;
const EMU_PER_POINT = 12700;

function fontSizePtToPptxXml(sizePt) {
  return Number(sizePt) * 100;
}

function lineWidthPtToEmu(widthPt) {
  return Math.round(Number(widthPt) * EMU_PER_POINT);
}

function normalizeHexColor(value) {
  return String(value || "").replace(/^#/, "").toUpperCase();
}

function isAllowedColor(value) {
  const color = normalizeHexColor(value);
  return /^[0-9A-F]{6}$/.test(color) && ALLOWED_COLORS.includes(color);
}

module.exports = {
  ALLOWED_COLORS,
  ALLOWED_FONT_FACES,
  ALLOWED_FONT_SIZES_PT,
  STANDARD_LINE_WIDTH_EMU: lineWidthPtToEmu(STANDARD_LINE_WIDTH_PT),
  STANDARD_LINE_WIDTH_PT,
  fontSizePtToPptxXml,
  isAllowedColor,
  lineWidthPtToEmu,
  normalizeHexColor,
};
