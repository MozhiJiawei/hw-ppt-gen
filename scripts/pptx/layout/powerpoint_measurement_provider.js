const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const CACHE_DIR = path.join(ROOT, ".tmp", "powerpoint_layout_measurement_cache");
const CACHE_VERSION = 10;

function createPowerPointMeasurementSession(options = {}) {
  return {
    cache: new Map(),
    stats: {
      requests: 0,
      sessionHits: 0,
      diskHits: 0,
      spawned: 0,
      batchSpawned: 0,
      batchItems: 0,
    },
  };
}

function measureBlockWithPowerPoint(block = {}, area = {}, classification = {}, options = {}) {
  assertPowerPointMeasurementEnabled(options);
  const request = normalizeRequest(block, area, classification, options);
  const key = hashJson(request);
  const session = options.measurementSession || options.measurement_session || null;
  if (session?.stats) session.stats.requests += 1;
  if (session?.cache?.has(key)) {
    if (session.stats) session.stats.sessionHits += 1;
    return { ...session.cache.get(key), session_cache_hit: true };
  }
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (session?.cache) session.cache.set(key, cached);
    if (session?.stats) session.stats.diskHits += 1;
    return cached;
  }

  const measured = runMeasurementWorker(key, request, session);
  if (session?.cache) session.cache.set(key, measured);
  return measured;
}

function premeasureBlocksWithPowerPoint(items = [], options = {}) {
  assertPowerPointMeasurementEnabled(options);
  const session = options.measurementSession || options.measurement_session || null;
  const misses = [];
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  items.forEach((item) => {
    const request = normalizeRequest(item.block || {}, item.area || {}, item.classification || {}, options);
    const key = hashJson(request);
    if (session?.stats) session.stats.requests += 1;
    if (session?.cache?.has(key)) {
      if (session.stats) session.stats.sessionHits += 1;
      return;
    }
    const cachePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      if (session?.cache) session.cache.set(key, cached);
      if (session?.stats) session.stats.diskHits += 1;
      return;
    }
    misses.push({ key, request });
  });
  const uniqueMisses = [];
  const seen = new Set();
  for (const miss of misses) {
    if (seen.has(miss.key)) continue;
    seen.add(miss.key);
    uniqueMisses.push(miss);
  }
  if (!uniqueMisses.length) return;
  const measured = runBatchMeasurementWorker(uniqueMisses, session);
  uniqueMisses.forEach((miss) => {
    const result = measured.results?.[miss.key] || {
      ok: false,
      error: "Batch PowerPoint measurement did not return this request.",
      cache_key: miss.key,
      request: miss.request,
    };
    const cached = { ...result, cache_key: miss.key, request: miss.request };
    fs.writeFileSync(path.join(CACHE_DIR, `${miss.key}.json`), JSON.stringify(cached, null, 2), "utf8");
    fs.writeFileSync(path.join(CACHE_DIR, `${miss.key}.request.json`), JSON.stringify(miss.request, null, 2), "utf8");
    fs.writeFileSync(path.join(CACHE_DIR, `${miss.key}.result.json`), JSON.stringify(result, null, 2), "utf8");
    if (session?.cache) session.cache.set(miss.key, cached);
  });
}

function assertPowerPointMeasurementEnabled(options = {}) {
  if (process.platform !== "win32") {
    throw new Error("PowerPoint COM measurement requires Windows; no non-COM measurement fallback is available.");
  }
}

function runMeasurementWorker(key, request, session) {
  const requestPath = path.join(CACHE_DIR, `${key}.request.json`);
  const outputPath = path.join(CACHE_DIR, `${key}.result.json`);
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  fs.writeFileSync(requestPath, JSON.stringify(request, null, 2), "utf8");
  if (session?.stats) session.stats.spawned += 1;
  const result = spawnSync("node", [
    "scripts/pptx/layout/powerpoint_measurement_worker.js",
    requestPath,
    outputPath,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const failure = {
      ok: false,
      error: `${result.stdout || ""}\n${result.stderr || ""}`.trim(),
      cache_key: key,
      request,
    };
    fs.writeFileSync(cachePath, JSON.stringify(failure, null, 2), "utf8");
    return failure;
  }
  const measured = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const cached = { ...measured, cache_key: key, request };
  fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2), "utf8");
  return cached;
}

function runBatchMeasurementWorker(misses, session) {
  const batchKey = hashJson({ version: CACHE_VERSION, batch: misses.map((miss) => ({ key: miss.key, request: miss.request })) });
  const requestPath = path.join(CACHE_DIR, `${batchKey}.batch.request.json`);
  const outputPath = path.join(CACHE_DIR, `${batchKey}.batch.result.json`);
  fs.writeFileSync(requestPath, JSON.stringify({
    requests: misses.map((miss) => ({ id: miss.key, request: miss.request })),
  }, null, 2), "utf8");
  if (session?.stats) {
    session.stats.batchSpawned += 1;
    session.stats.batchItems += misses.length;
  }
  const result = spawnSync("node", [
    "scripts/pptx/layout/powerpoint_measurement_worker.js",
    requestPath,
    outputPath,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    return {
      ok: false,
      results: Object.fromEntries(misses.map((miss) => [miss.key, {
        ok: false,
        error,
        cache_key: miss.key,
        request: miss.request,
      }])),
    };
  }
  return JSON.parse(fs.readFileSync(outputPath, "utf8"));
}

function normalizeRequest(block, area, classification, options) {
  return {
    version: CACHE_VERSION,
    kind: measurementKind(block, classification),
    taxonomy_key: classification.taxonomy_key,
    block,
    area: {
      w: round(Number(area.w || 0)),
    },
    options: {},
  };
}

function measurementKind(block, classification) {
  if (!block.visual_anchor && !block.visualAnchor) return "text";
  if (classification.type === "KpiCardRow") return "kpi";
  if (classification.type === "NativeTable") return "table";
  return "visual";
}

function hashJson(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 24);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

module.exports = {
  createPowerPointMeasurementSession,
  measureBlockWithPowerPoint,
  premeasureBlocksWithPowerPoint,
};
