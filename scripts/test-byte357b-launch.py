#!/usr/bin/env python3
"""Purely offline Bite 35.7B regressions. All identities and keys are fictitious.

Only temporary files and ephemeral signing keys are created. No Docker, DB, 1Password,
network, user passwords, Test, TRN or Production resources are accessed.
"""

from __future__ import annotations

import copy
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "scripts/ers-byte357b-launch.py"
REV = "a" * 40
TREE = "b" * 40
NOW = "2026-11-20T12:34:56Z"
MODULE_SPEC = importlib.util.spec_from_file_location("ers_byte357b_launch", CLI)
assert MODULE_SPEC is not None and MODULE_SPEC.loader is not None
LAUNCH = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(LAUNCH)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def invoke(*args, expect=0):
    r = subprocess.run([sys.executable, str(CLI), *map(str, args)], text=True,
                       capture_output=True, cwd=ROOT, timeout=25)
    if r.returncode != expect:
        raise AssertionError(f"Expected {expect}, got {r.returncode}: {r.args}\n{r.stdout}\n{r.stderr}")
    return r


def run_openssl(*args):
    r = subprocess.run(["openssl", *map(str, args)], capture_output=True, text=True, timeout=20)
    if r.returncode:
        raise AssertionError(f"openssl failed: {r.stderr}")


def write_json(path, obj):
    path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def accepted_manifest(tmp: Path) -> tuple[Path, dict]:
    path = tmp / "launch.json"
    invoke("init", "--output", path, "--revision", REV, "--tree-sha", TREE)
    data = json.loads(path.read_text())
    data.update({"change_reference": "CHANGE-35-7B-TEST", "release_operator": "Operator A",
                 "independent_reviewer": "Reviewer B", "customer_pilot_tenant_reference": "TICKET-SYNTHETIC-PILOT"})
    for i, g in enumerate(data["gates"]):
        source = tmp / f"gate-{i}.txt"
        source.write_text(f"FICTITIOUS only: {g['id']} observed\n", encoding="utf-8")
        g.update({"status": "PASS", "observer": "Reviewer B", "observed_at": NOW,
                  "source_reference": f"TICKET-FAKE-{i}", "source_artifact": str(source),
                  "source_sha256": digest(source.read_bytes())})
        for k in g["details"]:
            if k in {"rpo_seconds", "rto_seconds"}:
                g["details"][k] = 60
            elif isinstance(g["details"][k], bool):
                g["details"][k] = True
            else:
                g["details"][k] = f"FAKE-EVIDENCE-{k}"
    data["gates"][0]["details"]["test_revision"] = "c" * 40
    data["gates"][0]["details"]["test_tree_sha"] = TREE
    data["gates"][1]["details"]["production_https_url"] = "https://app.enterpriseremotesystems.com"
    write_json(path, data)
    return path, data


def approve(tmp, manifest):
    record = json.loads(manifest.read_text())
    entries = []
    for label, (human, role) in zip("ab", (("Operator A", "release_owner"), ("Reviewer B", "independent_reviewer"))):
        key = tmp / f"private-{label}.pem"
        pub = tmp / f"public-{label}.pem"
        run_openssl("genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", key)
        run_openssl("pkey", "-in", key, "-pubout", "-out", pub)
        signed = {"schema_version": 1, "bite": "35.7B", "environment": "production",
                  "decision": "APPROVE", "release_revision": REV, "release_tree_sha": TREE,
                  "launch_manifest_sha256": digest(manifest.read_bytes()), "approved_by": human,
                  "approval_reference": f"FAKE-REVIEW-{label}", "responsibility": role, "approved_at": NOW}
        approval = tmp / f"approval-{label}.json"
        sig = tmp / f"approval-{label}.sig"
        write_json(approval, signed)
        run_openssl("dgst", "-sha256", "-sign", key, "-out", sig, approval)
        entries.extend([f"--approval-{label}", str(approval), f"--signature-{label}", str(sig),
                        f"--public-key-{label}", str(pub), f"--trusted-key-sha256-{label}", digest(pub.read_bytes())])
    return entries


def main():
    count = 0
    with tempfile.TemporaryDirectory(prefix="ers-357b-") as directory:
        tmp = Path(directory)
        manifest, record = accepted_manifest(tmp)
        empty = tmp / "empty.json"
        invoke("init", "--output", empty, "--revision", REV, "--tree-sha", TREE)
        assert json.loads(empty.read_text())["gates"][0]["status"] == "BLOCKED"
        invoke("init", "--output", empty, "--revision", REV, "--tree-sha", TREE, expect=2)
        invoke("verify", "--evidence", empty, "--expected-revision", REV, "--expected-tree-sha", TREE, expect=2)
        count += 3

        base_args = ["verify", "--evidence", manifest, "--expected-revision", REV,
                     "--expected-tree-sha", TREE]
        assert "NOT ACTIVATED" in invoke(*base_args).stdout
        count += 1

        def mutation(callback):
            nonlocal count
            data = copy.deepcopy(record)
            callback(data)
            write_json(manifest, data)
            try:
                LAUNCH.verify(manifest, REV, TREE)
            except LAUNCH.Blocked:
                pass
            else:
                raise AssertionError("invalid evidence accepted")
            write_json(manifest, record)
            count += 1

        for change in (
            lambda x: x["gates"][0].update(status="BLOCKED"),
            lambda x: x["gates"][0].update(status="FAILED"),
            lambda x: x["gates"][1].update(id="release_integrity"),
            lambda x: x["gates"].pop(),
            lambda x: x.update(environment="test"),
            lambda x: x.update(production_url="http://app.enterpriseremotesystems.com"),
            lambda x: x.update(release_tree_sha="e" * 40),
            lambda x: x.update(independent_reviewer="Operator A"),
            lambda x: x.update(change_reference=""),
            lambda x: x["gates"][0]["details"].update(test_tree_sha="d" * 40),
            lambda x: x["gates"][1]["details"].update(pilot_admission_enforced=False),
            lambda x: x["gates"][2]["details"].update(test_355_operational_rehearsal_passed=False),
            lambda x: x["gates"][3]["details"].update(rpo_seconds=86401),
            lambda x: x["gates"][3]["details"].update(rto_seconds=14401),
            lambda x: x["gates"][3]["details"].update(rpo_seconds="60"),
            lambda x: x["gates"][3]["details"].update(production_offhost_object_version=""),
            lambda x: x["gates"][4]["details"].update(failed_backup_alert_verified=False),
            lambda x: x["gates"][5]["details"].update(two_distinct_humans_verified=False),
            lambda x: x["gates"][3].update(source_sha256="e" * 64),
            lambda x: x["gates"][4].update(observed_at="2030-01-01T00:00:00Z"),
        ):
            mutation(change)
        source = Path(record["gates"][0]["source_artifact"])
        source.write_text("TAMPERED\n")
        try:
            LAUNCH.verify(manifest, REV, TREE)
        except LAUNCH.Blocked:
            pass
        else:
            raise AssertionError("tampered artifact accepted")
        source.write_text("FICTITIOUS only: release_integrity observed\n")
        count += 1

        approvals = approve(tmp, manifest)
        receipt = tmp / "receipt.json"
        args = ["authorize", "--evidence", manifest, "--expected-revision", REV,
                "--expected-tree-sha", TREE, *approvals, "--receipt", receipt]
        assert "NOT ACTIVATED" in invoke(*args).stdout
        generated = json.loads(receipt.read_text())
        assert generated["status"] == "SIGNATURES_VERIFIED_NOT_ACTIVATED"
        assert (receipt.stat().st_mode & 0o777) == 0o600
        count += 1
        invoke(*args, expect=2)  # cannot overwrite signed receipt
        count += 1
        receipt.unlink()
        damaged = list(args)
        idx = damaged.index("--trusted-key-sha256-b") + 1
        damaged[idx] = "0" * 64
        invoke(*damaged, expect=2)
        count += 1
        approval_b = tmp / "approval-b.json"
        corrupt = json.loads(approval_b.read_text())
        corrupt["approved_by"] = "Operator A"
        write_json(approval_b, corrupt)
        invoke(*args, expect=2)  # invalid signature on changed JSON
        count += 1
        # Re-sign with B key to prove identity checks cannot be bypassed by a valid signature.
        run_openssl("dgst", "-sha256", "-sign", tmp / "private-b.pem", "-out", tmp / "approval-b.sig", approval_b)
        invoke(*args, expect=2)
        count += 1
        corrupt["approved_by"] = "Reviewer B"
        corrupt["responsibility"] = "release_owner"
        write_json(approval_b, corrupt)
        run_openssl("dgst", "-sha256", "-sign", tmp / "private-b.pem", "-out", tmp / "approval-b.sig", approval_b)
        invoke(*args, expect=2)
        count += 1
        # Mutating manifest after approval also invalidates the signatures' binding.
        write_json(manifest, {**record, "change_reference": "DIFFERENT-TICKET"})
        invoke(*args, expect=2)
        count += 1

    make = (ROOT / "Makefile").read_text()
    ci = (ROOT / ".github/workflows/ci.yml").read_text()
    manual = (ROOT / "docs/bite-35/byte-35-7b-manual-acceptance.md").read_text()
    runbook = (ROOT / "docs/bite-35/byte-35-7b-production-go-live.md").read_text()
    assert "byte357b-launch-check:" in make and "$(MAKE) byte357b-launch-check" in make
    assert "run: make byte357b-launch-check" in ci
    assert all(f"## T{i:02d} —" in manual for i in range(1, 11))
    assert all(word in runbook for word in ("NOT ACTIVATED", "35.5", "35.6", "RPO", "RTO", "1Password", "STOP", "Glossary"))
    count += 4
    print(f"PASS: Bite 35.7B {count} offline regression checks; 0 operational tests claimed")
    print("NOT INDEPENDENTLY VERIFIED / NOT PRODUCTION AUTHORIZATION / NOT ACTIVATED")


if __name__ == "__main__":
    main()
