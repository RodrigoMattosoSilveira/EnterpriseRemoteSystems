#!/usr/bin/env python3
"""Run IT-02 focused regressions and capture explicit, private LOCAL evidence.

This does not interact with deployed Test/Production resources or enroll users.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
TARGETS = (
    "two-human-administrators-check",
    "production-bootstrap-reconciliation-check",
    "onepassword-deployment-preflight-check",
    "production-credential-cutover-check",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def git_value(root: Path, *arguments: str) -> str:
    return subprocess.check_output(["git", *arguments], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()


def run(root: Path, evidence_root: Path, *, go_command: str = "go", make_command: str = "make") -> int:
    """Run the full test (or stop on the first error), preserving all prior results."""
    previous_umask = os.umask(0o077)
    try:
        try:
            revision = git_value(root, "rev-parse", "HEAD")
            tree = git_value(root, "rev-parse", "HEAD^{tree}")
            branch = git_value(root, "branch", "--show-current")
            working_tree_clean = not bool(git_value(root, "status", "--porcelain"))
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            print(f"BLOCKED: IT-02 cannot identify the repository commit/tree: {type(exc).__name__}", file=sys.stderr)
            return 2

        try:
            toolchain = subprocess.run(
                [go_command, "version"], cwd=root, text=True, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, check=False,
            )
        except OSError as exc:
            print(f"BLOCKED: IT-02 cannot execute Go: {type(exc).__name__}", file=sys.stderr)
            return 2
        go_version = toolchain.stdout.strip()
        if toolchain.returncode != 0 or not re.search(r"\bgo1\.26\.2\b", go_version):
            print(f"BLOCKED: IT-02 requires Go 1.26.2; observed: {go_version or 'unavailable'}", file=sys.stderr)
            return 2

        try:
            evidence_root.mkdir(mode=0o700, parents=True, exist_ok=True)
            directory = evidence_root / revision / ("IT-02-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8])
            directory.mkdir(mode=0o700, parents=True, exist_ok=False)
        except OSError as exc:
            print(f"BLOCKED: IT-02 cannot create private evidence directory: {type(exc).__name__}", file=sys.stderr)
            return 2

        record = {
            "test_id": "IT-02", "environment": "LOCAL", "branch": branch,
            "revision": revision, "tree_sha": tree, "working_tree_clean": working_tree_clean, "go_version": go_version,
            "started_at_utc": utc_now(), "ended_at_utc": None,
            "checks": [], "overall_status": "BLOCKED",
            "note": "Local regression evidence only; not deployed Test or Production acceptance.",
        }
        print(f"IT-02 REVISION: {revision}")
        print(f"IT-02 TREE: {tree}")
        print(f"IT-02 WORKTREE: {'CLEAN' if working_tree_clean else 'MODIFIED — pre-commit evidence only'}")
        print(f"IT-02 GO VERSION: {go_version}")
        print(f"IT-02 LOCAL EVIDENCE DIRECTORY: {directory}")
        failed = False
        for index, target in enumerate(TARGETS, start=1):
            if failed:
                print(f"IT-02 RESULT {index}/4: {target} SKIPPED (prior failure)")
                record["checks"].append({"target": target, "result": "SKIPPED", "exit_code": None, "evidence_ref": None, "sha256": None})
                continue
            log_path = directory / (f"{index:02d}-{target}.log")
            print(f"IT-02 RUN {index}/4: make {target}", flush=True)
            try:
                with log_path.open("wb") as output:
                    outcome = subprocess.run([make_command, target], cwd=root, stdout=output, stderr=subprocess.STDOUT, check=False)
                code = outcome.returncode
            except OSError as exc:
                code = 127
                log_path.write_text(f"Unable to execute make target: {type(exc).__name__}\n", encoding="utf-8")
            data = log_path.read_bytes()
            # Show the same child output that the previous manual step showed.
            sys.stdout.write(data.decode("utf-8", errors="replace"))
            if data and not data.endswith(b"\n"):
                print()
            status = "PASS" if code == 0 else "FAIL"
            digest = hashlib.sha256(data).hexdigest()
            record["checks"].append({"target": target, "result": status, "exit_code": code,
                "evidence_ref": str(log_path), "sha256": digest})
            print(f"IT-02 RESULT {index}/4: {target} {status} exit={code}")
            print(f"IT-02 EVIDENCE REF {index}/4: {log_path} sha256={digest}")
            if code != 0:
                failed = True

        record["ended_at_utc"] = utc_now()
        record["overall_status"] = "FAIL" if failed else "PASS"
        report = directory / "it02-evidence.json"
        report.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        print(f"IT-02 SUMMARY: {record['overall_status']} ({sum(x['result']=='PASS' for x in record['checks'])}/4 passed)")
        print(f"IT-02 EVIDENCE INDEX: {report}")
        print("IT-02 NOTE: Store or reference these private LOCAL logs without committing them; independently record the CI run URL from IT-00.")
        if not working_tree_clean:
            print("IT-02 NOTICE: Working tree is modified; rerun after committing to capture final-SHA evidence.")
        if failed:
            print("STOP: IT-02 failed. Do not proceed to IT-03.", file=sys.stderr)
        return 1 if failed else 0
    finally:
        os.umask(previous_umask)


if __name__ == "__main__":
    if len(sys.argv) != 1:
        print("Usage: python3 -B scripts/ers-bite3368-it02-evidence.py", file=sys.stderr)
        sys.exit(2)
    sys.exit(run(ROOT, Path.home() / "ers-bite3368-acceptance"))
