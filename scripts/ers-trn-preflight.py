#!/usr/bin/env python3
"""35.6S.1A: read-only TRN readiness and exact TST rehearsal binding.

Never creates a Docker object, deploys, changes a database, or records a human approval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

SHA = re.compile(r"^[0-9a-f]{40}$")
EXPECTED_PROJECT = "ers-trn"
EXPECTED_NAMES = ("ers-trn-backend", "ers-trn-frontend", "ers-trn-caddy")
MIN_AVAILABLE_RAM = 2 * 1024**3
MIN_FREE_DISK = 5 * 1024**3
MAX_LOAD_PER_CPU = 0.75

class Blocked(Exception):
    pass

def verify_marker(path: Path, revision: str, tree: str, marker_validator: Path | None = None) -> dict:
    if not SHA.fullmatch(revision) or not SHA.fullmatch(tree):
        raise Blocked("requested Test revision/tree must be exact lowercase 40-character Git SHAs")
    if path.is_symlink() or not path.is_file():
        raise Blocked("missing or symbolic-link Test rehearsal marker")
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        if "=" not in line:
            raise Blocked("malformed Test rehearsal marker")
        key, value = line.split("=", 1)
        if not key or key in values:
            raise Blocked("duplicate or empty Test rehearsal marker key")
        values[key] = value
    if values.get("revision") != revision or values.get("tree_sha") != tree:
        raise Blocked("Test rehearsal revision/tree differs from exact requested release candidate")
    # Existing canonical verifier checks the migration chain and immutable Playwright artifact.
    validator = marker_validator or Path(__file__).with_name("verify-test-release-rehearsal-marker.py")
    cmd = [sys.executable, str(validator), "--file", str(path),
           "--expected-tree-sha", tree,
           "--expected-baseline-last-migration", "000062_tenant_administrator_cardinality.up.sql",
           "--expected-first-rehearsed-migration", "000063_global_administration_control_plane.up.sql",
           "--expected-final-migration", "000071_cross_tenant_delegated_role_isolation.up.sql",
           "--expected-deployment-final-migration", "000080_production_opening_balance.up.sql"]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=30)
    if result.returncode != 0:
        raise Blocked("canonical Test release-rehearsal validation failed: " + result.stderr.strip()[:320])
    return {"test_revision": revision, "tree_sha": tree,
            "marker_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "playwright_evidence_sha256": values["deployed_playwright_evidence_sha256"]}

def read_mem_available(path: Path) -> int:
    match = re.search(r"^MemAvailable:\s*(\d+)\s+kB$", path.read_text(), re.M)
    if not match:
        raise Blocked("Linux MemAvailable could not be read")
    return int(match.group(1)) * 1024

def verify_capacity(available: int, free_disk: int, load1: float, cpus: int) -> None:
    if available < MIN_AVAILABLE_RAM:
        raise Blocked(f"insufficient available host RAM: {available} bytes; need {MIN_AVAILABLE_RAM}")
    if free_disk < MIN_FREE_DISK:
        raise Blocked(f"insufficient disk headroom: {free_disk} bytes; need {MIN_FREE_DISK}")
    if cpus < 2 or load1 / cpus >= MAX_LOAD_PER_CPU:
        raise Blocked("insufficient CPU headroom to share the Production Hetzner VM safely")

def inspect_docker() -> None:
    # Read-only Docker metadata. Never stop, restart or remove an existing object.
    for name in EXPECTED_NAMES:
        result = subprocess.run(["docker", "inspect", "--format", "{{index .Config.Labels \"com.docker.compose.project\"}}", name],
                                capture_output=True, text=True, check=False, timeout=15)
        if result.returncode == 0 and result.stdout.strip() != EXPECTED_PROJECT:
            raise Blocked(f"container {name} belongs to another Compose project; refusing takeover")
        if result.returncode not in (0, 1):
            raise Blocked(f"cannot safely inspect container {name}: {result.stderr.strip()[:120]}")
    result = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"],
                            capture_output=True, text=True, check=False, timeout=15)
    if result.returncode != 0:
        raise Blocked("Docker daemon is not available for read-only inspection")

def check_host(root: Path, meminfo: Path = Path('/proc/meminfo')) -> dict:
    real = root.resolve(strict=True)
    if real != Path('/opt/EnterpriseRemoteSystems'):
        raise Blocked("capacity check must target the canonical deployed server root")
    if sys.platform != "linux":
        raise Blocked("host capacity check is intended for Linux Hetzner deployment")
    available = read_mem_available(meminfo)
    disk = shutil.disk_usage(real).free
    load1 = os.getloadavg()[0]
    cpus = os.cpu_count() or 0
    verify_capacity(available, disk, load1, cpus)
    inspect_docker()
    return {"available_ram_bytes": available, "free_disk_bytes": disk,
            "one_minute_load": round(load1, 2), "cpu_count": cpus,
            "checked_at_utc": datetime.now(timezone.utc).isoformat()}

def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    v = sub.add_parser("verify-test", help="validate immutable Test release rehearsal marker")
    v.add_argument("--marker", type=Path, required=True)
    v.add_argument("--revision", required=True)
    v.add_argument("--tree-sha", required=True)
    h = sub.add_parser("check-host", help="read-only VM capacity and Docker ownership")
    h.add_argument("--server-root", type=Path, default=Path('/opt/EnterpriseRemoteSystems'))
    args = p.parse_args(argv)
    try:
        result = verify_marker(args.marker, args.revision, args.tree_sha) if args.command == "verify-test" else check_host(args.server_root)
    except (Blocked, FileNotFoundError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f"BLOCKED: TRN readiness: {exc}", file=sys.stderr)
        return 2
    print("PASS: TRN preflight (read-only); no deployment, account provisioning or approval performed")
    print(json.dumps(result, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
