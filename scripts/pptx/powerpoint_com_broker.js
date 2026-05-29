const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const BROKER_SCRIPT = path.join(__dirname, "powerpoint_com_broker.ps1");
const PID_FILE = path.join(ROOT, ".tmp", "powerpoint_com_broker.pid");
const BROKER_TRACE = path.join(ROOT, ".tmp", "powerpoint_com_broker.trace.log");
const QUEUE_DIR = path.join(ROOT, ".tmp", "powerpoint_com_broker_queue");
const REQUEST_DIR = path.join(QUEUE_DIR, "requests");
const RESPONSE_DIR = path.join(QUEUE_DIR, "responses");
const HEARTBEAT_PATH = path.join(QUEUE_DIR, "broker.heartbeat");

function requestPowerPointBroker(command, payload = {}, options = {}) {
  if (process.platform !== "win32") throw new Error("PowerPoint COM broker is only available on Windows.");
  return requestWithRetry({ command, ...payload }, options);
}

async function requestWithRetry(message, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 180000);
  await ensurePowerPointBroker();
  try {
    return await sendQueued(message, timeoutMs);
  } catch (firstError) {
    if (firstError?.code === "BROKER_RESPONSE") throw firstError;
    if (firstError?.code === "BROKER_TIMEOUT") resetPowerPointBroker();
    await ensurePowerPointBroker();
    try {
      return await sendQueued(message, timeoutMs);
    } catch (secondError) {
      if (secondError?.code === "BROKER_TIMEOUT") resetPowerPointBroker();
      throw secondError;
    }
  }
}

async function ensurePowerPointBroker() {
  fs.mkdirSync(REQUEST_DIR, { recursive: true });
  fs.mkdirSync(RESPONSE_DIR, { recursive: true });
  if (brokerProcessLooksAlive() && heartbeatFresh()) return;
  if (brokerProcessLooksAlive() && !heartbeatFresh()) resetPowerPointBroker();
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  const command = [
    "$ErrorActionPreference='Stop'",
    `$env:HW_POWERPOINT_COM_BROKER_TRACE='${escapePowerShellSingleQuoted(BROKER_TRACE)}'`,
    `$env:HW_POWERPOINT_COM_BROKER_QUEUE='${escapePowerShellSingleQuoted(QUEUE_DIR)}'`,
    `& '${escapePowerShellSingleQuoted(BROKER_SCRIPT)}'`,
  ].join("; ");
  const result = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    [
      "$ErrorActionPreference='Stop'",
      `$command='${escapePowerShellSingleQuoted(command)}'`,
      "$p = Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command',$command) -WindowStyle Hidden -PassThru",
      "$p.Id",
    ].join("; "),
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Failed to start PowerPoint COM broker.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  const pid = Number(String(result.stdout || "").trim().split(/\s+/).pop());
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error("PowerPoint COM broker did not report a pid.");
  }
  fs.writeFileSync(PID_FILE, String(pid), "utf8");
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (heartbeatFresh()) return;
    await sleep(100);
  }
  throw new Error("Timed out starting PowerPoint COM broker.");
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

async function sendQueued(message, timeoutMs) {
  const id = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
  const requestPath = path.join(REQUEST_DIR, `${id}.json`);
  const tempPath = path.join(REQUEST_DIR, `${id}.tmp`);
  const responsePath = path.join(RESPONSE_DIR, `${id}.json`);
  fs.mkdirSync(REQUEST_DIR, { recursive: true });
  fs.mkdirSync(RESPONSE_DIR, { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify({ id, ...message }, null, 2), "utf8");
  fs.renameSync(tempPath, requestPath);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(responsePath)) {
      const responseText = fs.readFileSync(responsePath, "utf8").replace(/^\uFEFF/, "");
      const response = JSON.parse(responseText);
      fs.rmSync(responsePath, { force: true });
      if (!response.ok) {
        const error = new Error(response.error || "PowerPoint COM broker request failed.");
        error.code = "BROKER_RESPONSE";
        throw error;
      }
      return response;
    }
    await sleep(50);
  }
  fs.rmSync(requestPath, { force: true });
  const error = new Error(`PowerPoint COM broker queued request timed out after ${timeoutMs}ms.`);
  error.code = "BROKER_TIMEOUT";
  throw error;
}

function resetPowerPointBroker() {
  const pid = readBrokerPid();
  if (pid) {
    spawnSync("powershell", [
      "-NoProfile",
      "-Command",
      `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }
  spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -match '-File .*powerpoint_com_broker\\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    "Get-Process POWERPNT -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  fs.rmSync(PID_FILE, { force: true });
  try {
    fs.rmSync(REQUEST_DIR, { recursive: true, force: true });
    fs.rmSync(RESPONSE_DIR, { recursive: true, force: true });
    fs.rmSync(HEARTBEAT_PATH, { force: true });
  } catch {}
}

function readBrokerPid() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 && pid < 10000000 ? pid : null;
  } catch {
    return null;
  }
}

function brokerProcessLooksAlive() {
  const pid = readBrokerPid();
  if (!pid) return false;
  const result = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { 'alive' }`,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0 && String(result.stdout || "").includes("alive");
}

function heartbeatFresh() {
  try {
    const stat = fs.statSync(HEARTBEAT_PATH);
    return Date.now() - stat.mtimeMs < 5000;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  ensurePowerPointBroker,
  requestPowerPointBroker,
  resetPowerPointBroker,
};
