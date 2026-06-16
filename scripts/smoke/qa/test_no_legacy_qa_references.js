"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const deny = [
  "check_huawei_pptx",
  "test_visual_anchor_content_contract",
  "test_feedback_issue_contract",
  "runtimeQa: false",
  "runtimeQa !== false",
  "runtimeQa === false",
];
const retiredPaths = [
  "scripts/qa/check_huawei_pptx.js",
  "scripts/smoke/test_visual_anchor_content_contract.js",
  "scripts/smoke/test_feedback_issue_contract.js",
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.name.endsWith(".js")) return [];
    return [full];
  });
}

for (const relPath of retiredPaths) {
  assert(!fs.existsSync(path.join(ROOT, relPath)), `${relPath} should stay retired`);
}

for (const fileName of walk(path.join(ROOT, "scripts"))) {
  const rel = path.relative(ROOT, fileName).replace(/\\/g, "/");
  if (rel === "scripts/smoke/qa/test_no_legacy_qa_references.js") continue;
  const text = fs.readFileSync(fileName, "utf8");
  for (const token of deny) {
    assert(!text.includes(token), `${rel} should not reference retired QA token ${token}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const packageScripts = Object.values(packageJson.scripts || {}).join("\n");
for (const token of deny) {
  assert(!packageScripts.includes(token), `package scripts should not reference retired QA token ${token}`);
}

console.log("Runtime QA no legacy references passed.");
