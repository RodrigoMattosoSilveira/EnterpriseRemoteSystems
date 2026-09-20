#!/usr/bin/env python3
"""Static/guard regression checks for the destructive server demo reset."""
from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "brazilian-demo-server-reset.sh"
MAKEFILE = ROOT / "Makefile"
RUNBOOK = ROOT / "docs" / "06-Usage" / "Brazilian Demo Presenter Runbook.md"


def require(text: str, needle: str, context: str) -> None:
    if needle not in text:
        raise AssertionError(f"{context} missing {needle!r}")


def main() -> int:
    script = SCRIPT.read_text(encoding="utf-8")
    makefile = MAKEFILE.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")

    for token in (
        "development)",
        "test)",
        "production|prod)",
        "compose down",
        "volume rm",
        "up -d --no-build backend",
        "seed-brazilian-demo.py",
        "--verify-only",
        "up -d --no-build",
        "Mineração Serra Dourada — DEMO",
    ):
        require(script, token, "server reset script")

    for token in (
        ".PHONY: brazilian-demo-server-reset",
        "$(MAKE) server-backup ENV=$(ENV)",
        "$(MAKE) server-backend-health ENV=$(ENV)",
        "$(MAKE) server-smoke ENV=$(ENV)",
    ):
        require(makefile, token, "Makefile")

    require(runbook, "make brazilian-demo-server-reset ENV=development", "presenter runbook")
    require(runbook, "make brazilian-demo-server-reset ENV=test", "presenter runbook")

    # Production must be rejected before any Docker invocation. Point DOCKER_BIN
    # at a marker script and assert that marker is never created.
    with tempfile.TemporaryDirectory(prefix="ers-demo-reset-guard-") as tmp:
        marker = Path(tmp) / "docker-called"
        fake = Path(tmp) / "docker"
        fake.write_text(f"#!/usr/bin/env bash\ntouch {marker!s}\nexit 99\n", encoding="utf-8")
        fake.chmod(0o755)
        proc = subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=ROOT,
            env={**os.environ, "ENV": "production", "DOCKER_BIN": str(fake)},
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        assert proc.returncode != 0
        assert "Refusing to reset Brazilian demo data in Production" in proc.stdout
        assert not marker.exists(), "Production refusal occurred after Docker was invoked"

    print("Brazilian demo server reset contract verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
