#!/usr/bin/env python3
"""Bite 35.6: offline, itemized review of existing admin + recovery contracts.

No 1Password access, Docker, network, Production database, or secret material.
A PASS here never establishes actual two-person access or Production readiness.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
COUNT = 0


def text(path):
    return (ROOT / path).read_text(encoding="utf-8")


def check(label, assertion):
    global COUNT
    if not assertion:
        raise AssertionError(label)
    COUNT += 1
    print("PASS 35.6-%02d: %s" % (COUNT, label))


def manifest():
    pairs = {}
    for raw in text("ops/recovery-access.production.env").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise AssertionError("invalid manifest assignment")
        key, val = line.split("=", 1)
        if key in pairs:
            raise AssertionError("duplicate recovery key: " + key)
        pairs[key] = val
    return pairs


def main():
    m = manifest()
    check("Production recovery provider is 1Password only",
          m.get("RECOVERY_SHARED_SECRETS_PROVIDER") == "1Password"
          and m.get("RECOVERY_SHARED_COLLECTION") == "ers-production")

    sources = {
        "RECOVERY_PRODUCTION_ENV_SOURCE": "op://ers-production/recovery-production-env/document",
        "RECOVERY_S3_CREDENTIAL_SOURCE": "op://ers-production/recovery-hetzner-s3/document",
        "RECOVERY_HOST_ACCESS_SOURCE": "op://ers-production/recovery-host-ssh/document",
        "RECOVERY_HETZNER_CONSOLE_SOURCE": "op://ers-production/recovery-hetzner-console/document",
        "RECOVERY_DNS_SOURCE": "op://ers-production/recovery-dns/document",
    }
    check("five required scoped, distinct Production recovery locators",
          all(m.get(k) == v for k, v in sources.items())
          and len(set(sources.values())) == 5)
    check("no passwords or private keys included in locator manifest",
          all(not any(token in k for token in ("PASSWORD", "SECRET_KEY", "PRIVATE_KEY", "TOKEN"))
                  for k in m)
          and "BEGIN PRIVATE KEY" not in text("ops/recovery-access.production.env"))
    check("owner-independent MFA and access policies preserved",
          m.get("RECOVERY_OWNER_UNAVAILABLE_REQUIRED") == "true"
          and m.get("RECOVERY_MFA_POLICY") == "must-not-depend-on-owner-device-or-approval"
          and m.get("RECOVERY_SHARED_ACCESS_POLICY") == "technician-access-independent-of-owner")
    shell = text("scripts/server-owner-unavailable-recovery-preflight.sh")
    check("preflight refuses legacy provider and unscoped vault locators",
          '== "1Password"' in shell and 'op://*)' in shell
          and '"$value" == op://' in shell and '"lastpass"*' in shell)

    canonical = text("docs/database-recovery-runbook.md")
    check("canonical database recovery runbook matches every 1Password locator",
          all(value in canonical for value in sources.values())
          and "lastpass-shared://" not in canonical and "LastPass" not in canonical)
    check("existing canonical two-human enrollment and read-only status reused",
          (ROOT / "backend/cmd/enroll-human-admins/main.go").is_file()
          and (ROOT / "scripts/ers-two-human-admin-status.py").is_file()
          and "ENROLL_TWO_HUMAN_ADMINS" in text("backend/cmd/enroll-human-admins/main.go"))
    runbook = text("docs/bite-35/byte-35-6-administrator-and-recovery-runbook.md")
    check("runbook distinguishes solo software verification from actual human custody",
          all(phrase in runbook for phrase in (
              "one human permitted", "two **different actual humans**", "1Password-only",
              "**BLOCKED**", "RPO", "RTO", "Docker", "Glossary impact")))
    manual = text("docs/bite-35/byte-35-6-manual-acceptance.md")
    check("manual has nine executable, identity-specific T01–T09 cases",
          re.findall(r"^## (T\d\d) —", manual, flags=re.MULTILINE)
          == ["T%02d" % n for n in range(1, 10)]
          and all(word in manual for word in ("**Identity", "**PASS", "**BLOCKED", "make local-check")))
    make = text("Makefile")
    ci = text(".github/workflows/ci.yml")
    check("LOCAL, promotion and CI run this offline contract",
          make.count("\t$(MAKE) byte356-operations-check") >= 2
          and "run: make byte356-operations-check" in ci)
    check("Production launch remains unapproved in accepted launch ledger",
          '"production_launch_authorized": false' in text("docs/bite-35/launch-baseline.json"))
    print("RESULT: Byte 35.6 %d PASS / 0 FAIL; policy/static checks only; real human custody and restore NOT VERIFIED" % COUNT)


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, OSError, ValueError) as exc:
        print("FAIL: Byte 35.6 offline contract: %s" % exc, file=sys.stderr)
        sys.exit(1)
