const BODY_LAYOUT_TYPES = Object.freeze({
  two_column: Object.freeze({
    reference: "05 内容 二分栏",
    moduleCount: 2,
    columns: Object.freeze([1, 1]),
  }),
  biased_column: Object.freeze({
    reference: "06 内容 偏分栏",
    minModuleCount: 2,
    maxModuleCount: 4,
    special: "large_visual_with_side_cards",
  }),
  three_column: Object.freeze({
    reference: "07 内容 三分栏",
    moduleCount: 3,
    columns: Object.freeze([1, 1, 1]),
  }),
  four_column: Object.freeze({
    reference: "08 内容 四分栏",
    moduleCount: 4,
    grid: Object.freeze({ rows: 2, columns: 2 }),
  }),
});

function getBodyLayoutType(type) {
  return BODY_LAYOUT_TYPES[safeText(type)] || null;
}

function bodyLayoutTypeRows() {
  return Object.entries(BODY_LAYOUT_TYPES).map(([type, contract]) => ({ type, ...contract }));
}

function safeText(value) {
  if (value == null) return "";
  return String(value).trim();
}

module.exports = {
  BODY_LAYOUT_TYPES,
  bodyLayoutTypeRows,
  getBodyLayoutType,
};
