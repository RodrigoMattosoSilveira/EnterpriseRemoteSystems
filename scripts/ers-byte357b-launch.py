#!/usr/bin/env python3
"""Bite 35.7B: offline Production gate review and two-signature receipt.

This tool NEVER contacts a server, authenticates a human, grants a role, runs SQL,
changes Production, or authorizes a deployment. A successful result only means
that supplied evidence is structurally complete and signatures verify.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

GATES = (
    "release_integrity", "security", "data_preservation", "backup_restore",
    "operational_continuity", "administrator_recovery",
)
SHA = re.compile(r"[a-f0-9]{40}\Z")
SHA256 = re.compile(r"[a-f0-9]{64}\Z")
PROD_URL = "https://app.enterpriseremotesystems.com"
REPO_ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    "release_integrity": (
        "test_revision", "test_tree_sha", "test_acceptance_reference", "local_check_reference",
        "ci_reference", "deployed_test_smoke_reference",
    ),
    "security": (
        "production_https_url", "authentication_tested", "role_boundaries_tested",
        "tenant_isolation_tested", "pilot_admission_enforced",
    ),
    "data_preservation": (
        "migration_gate_verified", "non_destructive_deployment_verified",
        "test_355_operational_rehearsal_passed", "production_355_signed_plan_verified",
    ),
    "backup_restore": (
        "production_offhost_receipt_reference", "production_offhost_object_version",
        "isolated_restore_verified", "rpo_seconds", "rto_seconds",
    ),
    "operational_continuity": (
        "scheduled_backup_verified", "failed_backup_alert_verified",
        "retention_policy_verified", "named_recovery_owner", "named_oncall_contact",
    ),
    "administrator_recovery": (
        "two_distinct_humans_verified", "independent_1password_custody_verified",
        "mutual_admin_recovery_tested", "actual_recovery_rehearsal_verified",
    ),
}
BOOLEANS = {
    "security": {"authentication_tested", "role_boundaries_tested", "tenant_isolation_tested", "pilot_admission_enforced"},
    "data_preservation": {"migration_gate_verified", "non_destructive_deployment_verified", "test_355_operational_rehearsal_passed", "production_355_signed_plan_verified"},
    "backup_restore": {"isolated_restore_verified"},
    "operational_continuity": {"scheduled_backup_verified", "failed_backup_alert_verified", "retention_policy_verified"},
    "administrator_recovery": {"two_distinct_humans_verified", "independent_1password_custody_verified", "mutual_admin_recovery_tested", "actual_recovery_rehearsal_verified"},
}


class Blocked(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise Blocked(message)


def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def utc(value: object, label: str) -> None:
    require(isinstance(value, str), f"{label}: UTC timestamp required")
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        require(value.endswith("Z") and d.tzinfo is not None and d.utcoffset().total_seconds() == 0,
                f"{label}: timestamp must be UTC Z")
        require(d <= datetime.now(timezone.utc), f"{label}: cannot be in the future")
    except (ValueError, AttributeError) as exc:
        raise Blocked(f"{label}: invalid UTC timestamp") from exc


def concrete(value: object) -> bool:
    return (isinstance(value, str) and bool(value.strip()) and not any(
        mark in value.lower() for mark in ("<", ">", "todo", "placeholder", "replace-me", "example.invalid")
    ))


def json_file(path: Path) -> tuple[dict, bytes]:
    require(path.is_file() and not path.is_symlink(), f"missing or symlinked JSON file: {path}")
    blob = path.read_bytes()
    require(len(blob) <= 1024 * 1024, "JSON evidence file exceeds 1 MB")
    obj = json.loads(blob)
    require(isinstance(obj, dict), f"JSON must be an object: {path}")
    return obj, blob


def starter(revision: str, tree_sha: str) -> dict:
    return {
        "schema_version": 1,
        "bite": "35.7B",
        "environment": "production",
        "production_url": PROD_URL,
        "release_revision": revision,
        "release_tree_sha": tree_sha,
        "change_reference": "",
        "release_operator": "",
        "independent_reviewer": "",
        "customer_pilot_tenant_reference": "",
        "gates": [
            {
                "id": gate, "status": "BLOCKED", "observer": "", "observed_at": "",
                "source_reference": "", "source_artifact": "", "source_sha256": "",
                "details": {k: False if k in BOOLEANS.get(gate, set()) else None if k in ("rpo_seconds", "rto_seconds") else ""
                            for k in REQUIRED[gate]},
            }
            for gate in GATES
        ],
    }


def create_private(path: Path, data: bytes) -> None:
    require(not path.resolve().is_relative_to(REPO_ROOT), "protected evidence/output must stay outside repository")
    require(not path.exists() and not path.is_symlink(), f"refusing to overwrite output: {path}")
    # Exclusive creation: no accidental overwrite of acceptance/receipt evidence.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def verify(evidence: Path, revision: str, tree_sha: str) -> str:
    require(SHA.fullmatch(revision) is not None, "expected revision must be 40 lowercase hex characters")
    require(SHA.fullmatch(tree_sha) is not None, "expected tree SHA must be 40 lowercase hex characters")
    record, blob = json_file(evidence)
    require(record.get("schema_version") == 1 and record.get("bite") == "35.7B", "wrong schema or bite")
    require(record.get("environment") == "production" and record.get("production_url") == PROD_URL,
            "wrong environment or canonical Production HTTPS URL")
    require(record.get("release_revision") == revision and record.get("release_tree_sha") == tree_sha,
            "release revision/tree do not match independently specified expected values")
    for k in ("change_reference", "release_operator", "independent_reviewer", "customer_pilot_tenant_reference"):
        require(concrete(record.get(k)), f"{k}: independently sourced value required")
    require(record["release_operator"].strip().casefold() != record["independent_reviewer"].strip().casefold(),
            "release operator and independent reviewer must be different humans")
    gates = record.get("gates")
    require(isinstance(gates, list) and len(gates) == len(GATES), "six gates required, once each")
    require([g.get("id") for g in gates if isinstance(g, dict)] == list(GATES),
            "gate IDs/order are fixed by Bite 35.1; none may be skipped or duplicated")
    for gate in gates:
        name = gate["id"]
        require(gate.get("status") == "PASS", f"{name}: BLOCKED until separately observed PASS")
        require(concrete(gate.get("observer")), f"{name}: real observer required")
        utc(gate.get("observed_at"), f"{name}.observed_at")
        require(concrete(gate.get("source_reference")), f"{name}: original evidence reference required")
        artifact = gate.get("source_artifact")
        require(concrete(artifact), f"{name}: protected source artifact path required")
        source_path = Path(artifact)
        require(source_path.is_absolute() and source_path.is_file() and not source_path.is_symlink() and
                not source_path.resolve().is_relative_to(REPO_ROOT),
                f"{name}: source artifact must be an existing non-symlink file OUTSIDE the repository")
        require(SHA256.fullmatch(str(gate.get("source_sha256", ""))) is not None,
                f"{name}: source SHA-256 required")
        require(source_path.stat().st_size > 0 and source_path.stat().st_size <= 10 * 1024 * 1024,
                f"{name}: source artifact must be nonempty and <=10MB")
        require(sha256(source_path.read_bytes()) == gate["source_sha256"],
                f"{name}: source artifact SHA-256 mismatch (modified source)")
        details = gate.get("details")
        require(isinstance(details, dict), f"{name}: details object required")
        for k in REQUIRED[name]:
            v = details.get(k)
            if k in BOOLEANS.get(name, set()):
                require(v is True, f"{name}.{k}: independently observed true required")
            elif k in ("rpo_seconds", "rto_seconds"):
                bound = 86400 if k == "rpo_seconds" else 14400
                require(type(v) is int and 0 <= v <= bound,
                        f"{name}.{k}: measured integer must be 0..{bound} seconds")
            else:
                require(concrete(v), f"{name}.{k}: concrete evidence required")
        if name == "release_integrity":
            require(SHA.fullmatch(details["test_revision"]) is not None, "test_revision must be SHA")
            require(details["test_tree_sha"] == tree_sha, "Test-approved tree must equal Production release tree")
        if name == "security":
            require(details["production_https_url"] == PROD_URL, "security gate must use Production HTTPS URL")
    return sha256(blob)


def verified_signature(approval_path: Path, signature: Path, public_key: Path, trusted_sha: str,
                       revision: str, tree_sha: str, manifest_sha: str) -> tuple[str, str, str]:
    require(SHA256.fullmatch(trusted_sha) is not None, "independently trusted PEM SHA-256 must be 64 hex")
    for file in (signature, public_key):
        require(file.is_file() and not file.is_symlink() and file.stat().st_size > 0, f"missing protected file {file}")
    require(sha256(public_key.read_bytes()) == trusted_sha, "public PEM differs from independently trusted digest")
    approval, bytes_ = json_file(approval_path)
    require(approval.get("schema_version") == 1 and approval.get("bite") == "35.7B" and
            approval.get("environment") == "production" and approval.get("decision") == "APPROVE",
            "approval scope or decision is wrong")
    for key, val in (("release_revision", revision), ("release_tree_sha", tree_sha),
                     ("launch_manifest_sha256", manifest_sha)):
        require(approval.get(key) == val, f"signed approval {key} mismatch")
    for key in ("approved_by", "approval_reference", "responsibility"):
        require(concrete(approval.get(key)), f"signed approval {key} required")
    utc(approval.get("approved_at"), "signed approval approved_at")
    require(approval["responsibility"] in ("release_owner", "independent_reviewer"),
            "signed approval responsibility must be release_owner or independent_reviewer")
    try:
        process = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", str(public_key),
             "-signature", str(signature), str(approval_path)],
            capture_output=True, text=True, timeout=15, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Blocked("OpenSSL verifier missing or timed out") from exc
    require(process.returncode == 0 and "Verified OK" in process.stdout,
            "cryptographic approval signature verification FAILED")
    return approval["approved_by"].strip(), approval["responsibility"], sha256(bytes_)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init", help="Write a private BLOCKED evidence starter; no Production access")
    init.add_argument("--output", type=Path, required=True)
    init.add_argument("--revision", required=True)
    init.add_argument("--tree-sha", required=True)
    for name in ("verify", "authorize"):
        cmd = commands.add_parser(name, help="Offline evidence/signed approval verification ONLY")
        cmd.add_argument("--evidence", type=Path, required=True)
        cmd.add_argument("--expected-revision", required=True)
        cmd.add_argument("--expected-tree-sha", required=True)
        if name == "authorize":
            for suffix in ("a", "b"):
                cmd.add_argument(f"--approval-{suffix}", type=Path, required=True)
                cmd.add_argument(f"--signature-{suffix}", type=Path, required=True)
                cmd.add_argument(f"--public-key-{suffix}", type=Path, required=True)
                cmd.add_argument(f"--trusted-key-sha256-{suffix}", required=True)
            cmd.add_argument("--receipt", type=Path, required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "init":
        require(SHA.fullmatch(args.revision) is not None and SHA.fullmatch(args.tree_sha) is not None,
                "init requires real 40-hex revision and tree SHA; never use placeholders")
        data = json.dumps(starter(args.revision, args.tree_sha), indent=2).encode() + b"\n"
        create_private(args.output, data)
        print("BLOCKED: private six-gate evidence starter created; no gates accepted and no Production action")
        return 0
    digest = verify(args.evidence, args.expected_revision, args.expected_tree_sha)
    if args.command == "verify":
        print(f"REVIEW READY: six gates are complete on supplied evidence; launch_manifest_sha256={digest}")
        print("NOT INDEPENDENTLY VERIFIED / NOT PRODUCTION AUTHORIZATION / NOT ACTIVATED")
        return 0
    first = verified_signature(args.approval_a, args.signature_a, args.public_key_a,
                               args.trusted_key_sha256_a, args.expected_revision, args.expected_tree_sha, digest)
    second = verified_signature(args.approval_b, args.signature_b, args.public_key_b,
                                args.trusted_key_sha256_b, args.expected_revision, args.expected_tree_sha, digest)
    record, _ = json_file(args.evidence)
    require(first[0].casefold() != second[0].casefold(), "approval signers must be distinct actual humans")
    signers = {first[1]: first[0].casefold(), second[1]: second[0].casefold()}
    latest_gate_time = max(g["observed_at"] for g in record["gates"])
    for file in (args.approval_a, args.approval_b):
        signed, _ = json_file(file)
        require(datetime.fromisoformat(signed["approved_at"].replace("Z", "+00:00")) >=
                datetime.fromisoformat(latest_gate_time.replace("Z", "+00:00")),
                "launch approval cannot precede the last gate observation")
    require(signers.get("release_owner") == record["release_operator"].strip().casefold() and
            signers.get("independent_reviewer") == record["independent_reviewer"].strip().casefold(),
            "signed approval identities do not match evidence release operator/reviewer")
    require({first[1], second[1]} == {"release_owner", "independent_reviewer"},
            "requires separate release owner and independent reviewer signed roles")
    require(args.trusted_key_sha256_a != args.trusted_key_sha256_b,
            "the two approval signatures must use independent public keys")
    receipt = {
        "schema_version": 1, "bite": "35.7B", "environment": "production",
        "status": "SIGNATURES_VERIFIED_NOT_ACTIVATED",
        "release_revision": args.expected_revision,
        "release_tree_sha": args.expected_tree_sha,
        "launch_manifest_sha256": digest,
        "approvals": [
            {"approved_by": x[0], "responsibility": x[1], "approval_sha256": x[2], "trusted_public_key_sha256": trusted}
            for x, trusted in ((first, args.trusted_key_sha256_a), (second, args.trusted_key_sha256_b))
        ],
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "warning": "Offline structural/cryptographic verification only: no human identity, vault custody, deployment, tenant activation or live safety gate independently verified",
    }
    create_private(args.receipt, (json.dumps(receipt, indent=2) + "\n").encode())
    print("SIGNATURES VERIFIED — NOT ACTIVATED. Human reviewer must independently validate evidence and authorize deployment.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (Blocked, OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"BLOCKED 35.7B: {exc}", file=sys.stderr)
        raise SystemExit(2)
