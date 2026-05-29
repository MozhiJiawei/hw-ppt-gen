const fs = require("fs");
const os = require("os");
const path = require("path");

const LOCK_DIR = path.join(os.tmpdir(), "hw-ppt-powerpoint-com.lock");
const DEFAULT_TIMEOUT_MS = Number(process.env.HW_POWERPOINT_COM_LOCK_TIMEOUT_MS || 15 * 60 * 1000);
const STALE_MS = Number(process.env.HW_POWERPOINT_COM_LOCK_STALE_MS || 10 * 60 * 1000);

function withPowerPointComLockSync(label, fn, options = {}) {
  const release = acquirePowerPointComLockSync(label, options);
  try {
    return fn();
  } finally {
    release();
  }
}

async function withPowerPointComLock(label, fn, options = {}) {
  const release = acquirePowerPointComLockSync(label, options);
  try {
    return await fn();
  } finally {
    release();
  }
}

function acquirePowerPointComLockSync(label = "PowerPoint COM", options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  const owner = {
    pid: process.pid,
    label,
    cwd: process.cwd(),
    acquired_at: new Date().toISOString(),
  };

  while (true) {
    try {
      fs.mkdirSync(LOCK_DIR);
      fs.writeFileSync(path.join(LOCK_DIR, "owner.json"), JSON.stringify(owner, null, 2), "utf8");
      return () => releasePowerPointComLock(owner);
    } catch (error) {
      if (error && error.code !== "EEXIST") throw error;
      maybeBreakStaleLock();
      if (Date.now() - started > timeoutMs) {
        const current = readOwner();
        throw new Error(`Timed out waiting for PowerPoint COM lock for ${label}. Current owner: ${JSON.stringify(current)}`);
      }
      sleepSync(500);
    }
  }
}

function releasePowerPointComLock(owner) {
  const current = readOwner();
  if (current && Number(current.pid) !== Number(owner.pid)) return;
  fs.rmSync(LOCK_DIR, { recursive: true, force: true });
}

function maybeBreakStaleLock() {
  const ownerPath = path.join(LOCK_DIR, "owner.json");
  let stat = null;
  try {
    stat = fs.statSync(ownerPath);
  } catch {
    stat = safeStat(LOCK_DIR);
  }
  if (!stat) return;
  const old = Date.now() - stat.mtimeMs > STALE_MS;
  if (!old) return;
  const owner = readOwner();
  if (owner?.pid && processExists(Number(owner.pid))) return;
  fs.rmSync(LOCK_DIR, { recursive: true, force: true });
}

function readOwner() {
  try {
    return JSON.parse(fs.readFileSync(path.join(LOCK_DIR, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

function safeStat(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

function processExists(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

module.exports = {
  acquirePowerPointComLockSync,
  withPowerPointComLock,
  withPowerPointComLockSync,
};
