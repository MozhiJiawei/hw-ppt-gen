"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, ".tmp", "agent_cli_error_logs");
const SAMPLE_MD = path.join(OUT_DIR, "samples.md");

function runCase(id, command, args, expected) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assert.notEqual(result.status, 0, `${id} should fail`);
  assert(output.includes(expected), `${id} should include actionable message: ${expected}\n${output}`);
  assert(!/^\s+at\s+\S+/m.test(output), `${id} should not print a JS stack trace\n${output}`);
  assert(!output.includes("Node.js v"), `${id} should not be an uncaught Node exception\n${output}`);
  return {
    id,
    command: `${command} ${args.join(" ")}`,
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function renderSample(result) {
  return [
    `## ${result.id}`,
    "",
    "```bash",
    result.command,
    "```",
    "",
    `Exit code: ${result.exitCode}`,
    "",
    "STDOUT:",
    "```text",
    result.stdout.trim() || "(empty)",
    "```",
    "",
    "STDERR:",
    "```text",
    result.stderr.trim() || "(empty)",
    "```",
    "",
  ].join("\n");
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cases = [
    runCase(
      "brief-parser-missing-file",
      "node",
      ["scripts/pptx/parse_ppt_content_brief.js", ".tmp/missing_brief.md", "--json"],
      "no such file or directory",
    ),
    runCase(
      "dsl-describe-unknown-component",
      "node",
      ["scripts/pptx/dsl/describe_component.js", "NotAComponent"],
      "Unknown AI-visible Body DSL component: NotAComponent",
    ),
    runCase(
      "pptx-export-missing-input",
      "node",
      ["scripts/pptx/export_pptx_images.js", ".tmp/missing.pptx", "--out", ".tmp/missing_slides"],
      "Input PPTX not found:",
    ),
    runCase(
      "pptx-measure-missing-input",
      "node",
      ["scripts/pptx/measure_pptx_layout.js", ".tmp/missing.pptx", "--out", ".tmp/missing_measure.json"],
      "Input PPTX not found:",
    ),
  ];
  fs.writeFileSync(SAMPLE_MD, ["# Agent CLI Error Log Samples", "", ...cases.map(renderSample)].join("\n"), "utf8");
  console.log(`Agent CLI error log smoke passed: ${SAMPLE_MD}`);
}

main();
