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


# Every documented acceptance case must have its own executable context and
# result criteria. Changing this list requires reviewing the manual contract.
EXPECTED_MANUAL_CASES = [f"T{i:02d}" for i in range(1, 11)]


def manual_contract_issues(manual: str) -> list[str]:
    headings = list(re.finditer(r"^## (T\d\d) —", manual, flags=re.MULTILINE))
    actual = [match.group(1) for match in headings]
    if actual != EXPECTED_MANUAL_CASES:
        return [f"expected T01–T10 once in order, found {actual}"]

    issues = []
    for index, heading in enumerate(headings):
        end = headings[index + 1].start() if index + 1 < len(headings) else len(manual)
        section = manual[heading.end():end]
        case = heading.group(1)
        if not re.search(r"\*\*Identit(?:y|ies)/context:\*\*", section):
            issues.append(f"{case} missing identity/context")
        for marker in ("**PASS", "**FAIL", "BLOCKED"):
            if marker not in section:
                issues.append(f"{case} missing {marker} result criteria")

    # Existing operational cases remain distinct from synthetic LOCAL fixtures.
    for case, required in (
        ("T06", "two different natural persons"),
        ("T07", "two approved real recovery technicians"),
        ("T08", "isolated restore"),
    ):
        index = EXPECTED_MANUAL_CASES.index(case)
        end = headings[index + 1].start() if index + 1 < len(headings) else len(manual)
        if required not in manual[headings[index].end():end]:
            issues.append(f"{case} missing operational safeguard: {required}")

    # T10 is deliberately LOCAL-only and must not turn synthetic fixture
    # Accounts into evidence for human recovery or Production authorization.
    t10 = manual[headings[-1].end():]
    for required in (
        "make local-fixtures-ensure", "make local-fixtures-check",
        "eleven LOCAL passwords", "1Password", "backup",
        "APP-ADMIN", "TENANT-A", "TENANT-B", "SHARED", "MULTI",
        "no duplicate Accounts", "Production", "T06–T08",
    ):
        if required not in t10:
            issues.append(f"T10 missing fixture safeguard: {required}")
    return issues


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
    manual_issues = manual_contract_issues(manual)
    if manual_issues:
        raise AssertionError("manual acceptance contract: " + "; ".join(manual_issues))
    check("manual has ten executable, identity-specific T01–T10 cases",
          "make local-check" in manual)
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
