#!/usr/bin/env python3
"""Byte 35.6S.1: offline evidence planner/checker; NEVER provisions identities.

Every field is a human-supplied observation, not an automatically verified claim.
No network, database, Docker, GitHub, or 1Password access is performed.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys

CASE_IDS = tuple(f"T{i:02d}" for i in range(1, 13))
ALLOWED_ENVIRONMENTS = ("training",)
ALLOWED_ROLES = ("TENANT_VIEWER", "EARNINGS_OPERATOR", "EXPENSE_OPERATOR")
FORBIDDEN_TENANTS = ("TRAIN354C_A", "TRAIN354C_B", "E2EAUTHZADMIN", "E2EISOLATION")
SECRET_PATTERNS = (
    re.compile(r"(?i)(password|token|session.cookie|api.key|private.key|secret)\s*[:=]\s*\S+"),
    re.compile(r"(?i)-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----"),
    re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}"),
)


def template() -> dict:
    return {
        "schema_version": 1,
        "environment": "training",
        "deployment_revision": "",
        "training_tenant_code": "",
        "training_tenant_confirmed_synthetic": False,
        "trainee_login": "",
        "trainee_role": "TENANT_VIEWER",
        "training_owner": "",
        "technical_escalation_owner": "",
        "documentation_location": "",
        "credential_custody_verified": False,
        "individual_first_login_verified": False,
        "separate_from_immutable_354c_fixtures": False,
        "no_customer_data_verified": False,
        "production_access_not_granted": False,
        "cases": {k: {"status": "BLOCKED", "observation": "", "reviewer": ""} for k in CASE_IDS},
    }


def validate(raw: object) -> list[str]:
    errors = []
    if not isinstance(raw, dict):
        return ["record must be a JSON object"]
    expected = set(template())
    if set(raw) != expected:
        errors.append("unexpected or missing top-level fields: " + ", ".join(sorted(set(raw) ^ expected)))
    if raw.get("schema_version") != 1:
        errors.append("schema_version must be 1")
    if raw.get("environment") not in ALLOWED_ENVIRONMENTS:
        errors.append("environment must be training; DEV, TST and Production prohibited")
    rev = raw.get("deployment_revision")
    if not isinstance(rev, str) or not re.fullmatch(r"[a-f0-9]{40}", rev):
        errors.append("deployment_revision must be the verified 40-character Git SHA")
    code = raw.get("training_tenant_code")
    if not isinstance(code, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{3,31}", code):
        errors.append("training_tenant_code must be the exact 4–32 character uppercase Tenant code")
    elif code in FORBIDDEN_TENANTS or code.startswith(("TRAIN354C", "E2E", "PRD", "PROD")):
        errors.append("training_tenant_code must not reuse immutable fixture or Production Tenant codes")
    login = raw.get("trainee_login")
    if not isinstance(login, str) or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", login):
        errors.append("trainee_login must be the individual verified email/login, not a placeholder")
    elif any(tag in login.lower() for tag in ("e2e-", "training354c.", "bootstrap-admin", "shared@")):
        errors.append("trainee_login must not reuse a fixture or bootstrap identity")
    if raw.get("trainee_role") not in ALLOWED_ROLES:
        errors.append("trainee_role must be a tenant-scoped read-only or operator role; no admin/support role")
    for name in ("training_owner", "technical_escalation_owner", "documentation_location"):
        value = raw.get(name)
        if not isinstance(value, str) or len(value.strip()) < 3 or value.strip().lower() in ("tbd", "unknown", "none"):
            errors.append(f"{name} must identify a real owner or a readable documentation location")
        elif any(p.search(value) for p in SECRET_PATTERNS):
            errors.append(f"{name} may not include secrets")
    gates = (
        "training_tenant_confirmed_synthetic", "credential_custody_verified",
        "individual_first_login_verified", "separate_from_immutable_354c_fixtures",
        "no_customer_data_verified", "production_access_not_granted",
    )
    for name in gates:
        if raw.get(name) is not True:
            errors.append(f"{name} must be explicitly confirmed by an authorized human")
    cases = raw.get("cases")
    if not isinstance(cases, dict) or set(cases) != set(CASE_IDS):
        errors.append("cases must contain exactly T01–T12, no missing/extra cases")
    else:
        for cid in CASE_IDS:
            case = cases[cid]
            if not isinstance(case, dict) or set(case) != {"status", "observation", "reviewer"}:
                errors.append(f"{cid} must contain status, observation, and reviewer")
                continue
            status = case["status"]
            if status not in ("PASS", "FAIL", "BLOCKED"):
                errors.append(f"{cid} status must be PASS, FAIL, or BLOCKED")
            if status != "PASS":
                errors.append(f"{cid} is {status}; training acceptance cannot pass")
            for key in ("observation", "reviewer"):
                value = case[key]
                if not isinstance(value, str) or (status == "PASS" and len(value.strip()) < 8):
                    errors.append(f"{cid} {key} must contain a specific human observation when PASS")
                elif isinstance(value, str) and any(p.search(value) for p in SECRET_PATTERNS):
                    errors.append(f"{cid} {key} may not contain credentials or secrets")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init", help="create unfilled, explicitly BLOCKED evidence record")
    init.add_argument("--output", type=Path, required=True)
    check = sub.add_parser("check", help="validate reported acceptance without accessing ERS")
    check.add_argument("--record", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == "init":
        path = args.output.expanduser().absolute()
        if path.is_symlink() or path.exists():
            print("STOP: output path already exists or is a symlink; no overwrite", file=sys.stderr)
            return 2
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as output:
                json.dump(template(), output, ensure_ascii=False, indent=2)
                output.write("\n")
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        print(f"BLOCKED: empty support onboarding evidence created at {path}; no access provisioned")
        return 0
    path = args.record.expanduser().absolute()
    if path.is_symlink() or not path.is_file():
        print("STOP: record must be an existing non-symlink regular file", file=sys.stderr)
        return 2
    if path.stat().st_size > 65536:
        print("STOP: evidence record exceeds maximum size", file=sys.stderr)
        return 2
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"STOP: cannot parse record: {exc}", file=sys.stderr)
        return 2
    errors = validate(raw)
    if errors:
        for problem in errors:
            print("BLOCKED: " + problem)
        print(f"RESULT: 35.6S.1 documentation acceptance NOT READY ({len(errors)} findings); no runtime verification performed")
        return 1
    print("REVIEW READY: all 12 human-reported cases complete and evidence fields present")
    print("NOT INDEPENDENTLY VERIFIED: browser identity, Tenant authority, documentation access and credential custody")
    print("NOT PRODUCTION AUTHORIZATION: no customer access, support lease or administrator grant created")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
