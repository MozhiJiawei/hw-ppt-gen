#!/usr/bin/env python3
"""Verify external dependencies for huawei-pptx-generator.

This script checks only user/environment prerequisites: Node.js, installed Node
packages, and the OS-specific PPTX rendering toolchain. Repository files,
package declarations, generated artifacts, and QA/self-test flows are internal
health checks and are intentionally outside this dependency check.
"""

from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent

REQUIRED_NODE_PACKAGES = [
    "pptxgenjs",
    "jszip",
    "roughjs",
    "sharp",
]

def pass_check(name: str, detail: str = "") -> None:
    print(f"PASS {name}{': ' + detail if detail else ''}")


def warn_check(name: str, detail: str) -> None:
    print(f"WARN {name}: {detail}")


def fail_check(name: str, detail: str) -> None:
    print(f"FAIL {name}: {detail}")


def run(command: list[str], timeout: int = 30) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )


def command_version(command: str, args: list[str] | None = None) -> tuple[bool, str]:
    exe = shutil.which(command)
    if not exe:
        return False, "not found on PATH"

    try:
        result = run([exe, *(args or ["--version"])])
    except Exception as exc:
        return False, str(exc)

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        return False, detail or f"exited with {result.returncode}"

    return True, (result.stdout or result.stderr).strip().splitlines()[0]


def check_node_runtime() -> bool:
    ok = True
    node_ok, node_detail = command_version("node", ["--version"])
    if node_ok:
        pass_check("node", node_detail)
    else:
        fail_check("node", f"{node_detail}; install Node.js and ensure `node` is on PATH")
        ok = False

    npm_ok, npm_detail = command_version("npm", ["--version"])
    if npm_ok:
        pass_check("npm", npm_detail)
    else:
        fail_check("npm", f"{npm_detail}; install npm or use the Node.js installer that bundles npm")
        ok = False

    return ok


def check_node_packages() -> bool:
    probe = """
const packages = process.argv.slice(1);
for (const name of packages) {
  try {
    const mod = require(name);
    if (name === "sharp" && !mod.versions) throw new Error("sharp native runtime did not expose versions");
  } catch (error) {
    console.error(`${name}: ${error.message || error}`);
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log("loaded");
"""
    try:
        result = run(["node", "-e", probe, *REQUIRED_NODE_PACKAGES])
    except Exception as exc:
        fail_check("node package imports", str(exc))
        return False

    if result.returncode != 0:
        fail_check(
            "node package imports",
            (result.stderr or result.stdout).strip()
            + "\nRun `npm install` from the skill repository root.",
        )
        return False

    pass_check("node package imports", ", ".join(REQUIRED_NODE_PACKAGES))
    return True


def check_powershell() -> bool:
    ps = shutil.which("powershell") or shutil.which("pwsh")
    if not ps:
        fail_check("powershell", "not found on PATH; required for Windows PowerPoint COM export checks")
        return False

    pass_check("powershell", ps)
    return True


def check_powerpoint_com() -> bool:
    if platform.system() != "Windows":
        return False

    ps = shutil.which("powershell") or shutil.which("pwsh")
    if not ps:
        return False

    command = [
        ps,
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "$ErrorActionPreference='Stop'; "
        "$app = New-Object -ComObject PowerPoint.Application; "
        "$v = $app.Version; "
        "$app.Quit(); "
        "Write-Output $v",
    ]
    try:
        result = run(command, timeout=30)
    except Exception as exc:
        warn_check("PowerPoint COM", f"probe failed: {exc}")
        return False

    if result.returncode == 0 and any(char.isdigit() for char in result.stdout):
        pass_check("PowerPoint COM", f"version {result.stdout.strip()}")
        return True

    detail = (result.stderr or result.stdout or "PowerPoint COM unavailable").strip()
    fail_check("PowerPoint COM", f"{detail}; install Microsoft PowerPoint desktop for Windows native PPT rendering")
    return False


def check_libreoffice_poppler() -> bool:
    commands = [
        ("soffice", "LibreOffice headless PPTX-to-PDF export"),
        ("pdfinfo", "Poppler PDF page-count probe"),
        ("pdftoppm", "Poppler PDF-to-PNG export"),
    ]
    ok = True
    for command, description in commands:
        found = shutil.which(command)
        if found:
            pass_check(command, found)
        else:
            fail_check(command, f"not found on PATH; required for {description}")
            ok = False

    if not ok:
        if platform.system() == "Darwin":
            warn_check("LibreOffice/Poppler install", "install with `brew install --cask libreoffice` and `brew install poppler`, then ensure soffice/pdfinfo/pdftoppm are on PATH")
        elif platform.system() == "Linux":
            warn_check("LibreOffice/Poppler install", "install LibreOffice and Poppler with the system package manager, then ensure soffice/pdfinfo/pdftoppm are on PATH")
    return ok


def check_render_toolchain() -> bool:
    system = platform.system()
    pass_check("export OS policy", f"{system or 'unknown'}")

    if system == "Windows":
        if check_powershell() and check_powerpoint_com():
            pass_check("PPTX image renderer", "Windows native PowerPoint COM")
            return True
        fail_check("PPTX image renderer", "Windows requires Microsoft PowerPoint COM; LibreOffice fallback is not used by this dependency policy")
        return False

    if system in {"Darwin", "Linux"}:
        if check_libreoffice_poppler():
            platform_name = "macOS" if system == "Darwin" else "Linux"
            pass_check("PPTX image renderer", f"{platform_name} LibreOffice + Poppler")
            return True
        fail_check("PPTX image renderer", "this OS requires LibreOffice + Poppler; PowerPoint COM fallback is not used by this dependency policy")
        return False

    fail_check(
        "PPTX image renderer",
        f"unsupported OS `{system}`. Supported export policies: Windows PowerPoint COM; macOS/Linux LibreOffice + Poppler.",
    )
    return False


def check_services(skip_services: bool) -> bool:
    if skip_services:
        pass_check("external services", "skipped; this skill has no required external service checks")
    else:
        pass_check("external services", "none required")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify dependencies for the Huawei PPTX Generator skill.")
    parser.add_argument(
        "--skip-services",
        action="store_true",
        help="Skip external service checks. Kept for protocol compatibility; this skill has no required services.",
    )
    args = parser.parse_args()

    ok = True
    ok = check_node_runtime() and ok
    ok = check_node_packages() and ok
    ok = check_render_toolchain() and ok
    ok = check_services(args.skip_services) and ok

    if ok:
        print("PASS dependency verification complete")
        return 0

    print("FAIL dependency verification failed")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
