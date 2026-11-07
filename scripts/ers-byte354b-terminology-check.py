#!/usr/bin/env python3
"""Byte 35.4B — offline, fail-closed pt-BR presentation contract.

This checker is source-only; it does not attest browser behavior, authentication,
operational readiness, CI completion, or Production readiness.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANUAL = Path("docs/bite-35/byte-35-4-manual-da-entidade-pt-br.md")
# Preserves the exact committed 35.4A training body during the terminology rename.
MANUAL_SHA256 = "6d67c5d1b2199b90faaed9f2a601a5a122da62b45b720b278dbed81992f39d98"
REFERENCES = (
    "docs/bite-35/byte-35-4-manual-acceptance.md",
    "docs/bite-35/byte-35-4-operational-readiness.md",
    "docs/bite-35/byte-35-4-readiness-contract.json",
    "docs/bite-35/byte-35-4a-cartao-substituicoes-pt-br.md",
    "docs/bite-35/launch-plan.md",
    "scripts/ers-byte354a-manual-check.py",
    "scripts/ers-byte354-readiness-check.py",
)
UI = (
    "frontend/src/features/authz/AuditLogViewerPage.tsx",
    "frontend/src/features/authz/AuthzAdminPage.tsx",
    "frontend/src/features/authz/SupportAccessLeasesPage.tsx",
    "frontend/src/features/authz/TenantRoleDelegationPage.tsx",
)
KEY_RE = re.compile(r'^\s*"([^\"]+)":\s*"((?:\\.|[^"\\])*)",\s*$', re.M)
PARAM_RE = re.compile(r"\{[A-Za-z][A-Za-z0-9]*\}")


def validate(root: Path = ROOT) -> list[str]:
    errors: list[str] = []

    def read(name: str | Path) -> str:
        try:
            return (root / name).read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            errors.append(f"required source absent/unreadable: {name}: {exc}")
            return ""

    en = dict(KEY_RE.findall(read("frontend/src/i18n/resources/en-US.ts")))
    pt = dict(KEY_RE.findall(read("frontend/src/i18n/resources/pt-BR.ts")))
    if set(en) != set(pt):
        errors.append("en-US / pt-BR translation key parity mismatch")
    keys = {key for key in en if key.startswith("byte354b.")}
    if len(keys) < 90:
        errors.append(f"Byte 35.4B keys missing: expected >=90; found {len(keys)}")
    for key in sorted(keys):
        if key not in pt:
            continue
        if sorted(PARAM_RE.findall(en[key])) != sorted(PARAM_RE.findall(pt[key])):
            errors.append(f"placeholder mismatch: {key}")
        if re.search(r"\bTenants?\b", pt[key], flags=re.I):
            errors.append(f"English Tenant term in pt-BR display value: {key}")
        if not pt[key].strip():
            errors.append(f"empty pt-BR translation: {key}")

    # Technical codes and operation values must continue to be used without translated IDs.
    audit = read(UI[0]); authz = read(UI[1]); support = read(UI[2]); roles = read(UI[3])
    for fragment in [
        'value: "authz.tenant_actors.activate"',
        'value: "authz.tenant_role_grants.create"',
        'value: "people.memberships.status_change"',
        'operationLabel(log.operation, t)',
        '{log.operation}',
        't(option.key)',
        'const operationLabels = new Map(',
    ]:
        if fragment not in audit:
            errors.append(f"audit display/code contract missing: {fragment}")
    if re.search(r'label:\s*"(?:Tenant Actor|Person–Tenant Membership)', audit):
        errors.append("audit operation still displays hard-coded English Tenant label")

    for fragment in [
        'localizeAuthzReason(eligibility.reason, t)',
        'localizeAuthzReason(tenantEligibility.reason, t)',
        'localizeAuthzReason(tenantAdminCardinalityBlocker, t)',
        'tenantRoleGrantEligibility(actor).eligible',
        'grant.roleCode === "TENANT_ADMIN"',
        'localizedAdminRoleLabel(role, t, locale)',
        'binding.scopeType.trim().toUpperCase() !== "TENANT"',
    ]:
        if fragment not in authz:
            errors.append(f"eligibility/authorization display contract missing: {fragment}")
    for fragment in [
        't("byte354b.roles.tenantMember")',
        't("byte354b.roles.lifecycleMembership")',
        't("byte354b.roles.cannotDeactivate")',
        't("byte354b.roles.cannotRevoke")',
        'tenantRoleGrantEligibility(actor)',
        'TENANT_ADMIN',
        't("byte354b.roles.tenantAdministrator")',
    ]:
        if fragment not in roles:
            errors.append(f"delegated Role display/safety contract missing: {fragment}")
    if re.search(r'\?\s*"Collaborator"\s*:\s*"Tenant member"', roles):
        errors.append("tenant member hard-coded in delegated Role list")
    for fragment in [
        't("byte354b.support.allTenants")',
        '"byte354b.support.activeTenantsPlural"',
        't("byte354b.support.approvedMessage", { id: approvedLeaseId })',
        'onClick={() => chooseTenant(tenant.id)}',
        'event.key === "Escape"',
        'setSearch("")',
    ]:
        if fragment not in support:
            errors.append(f"support history display/combobox contract missing: {fragment}")

    manual = root / MANUAL
    if not manual.is_file() or hashlib.sha256(manual.read_bytes()).hexdigest() != MANUAL_SHA256:
        errors.append("Byte 35.4A customer manual content altered or renamed file missing")
    if (root / "docs/bite-35/byte-35-4-manual-do-tenant-pt-br.md").exists():
        errors.append("obsolete customer manual filename still exists")
    for rel in REFERENCES:
        src = read(rel)
        if "byte-35-4-manual-do-tenant-pt-br.md" in src:
            errors.append(f"obsolete customer manual reference: {rel}")
        if "byte-35-4-manual-da-entidade-pt-br.md" not in src:
            errors.append(f"missing new customer manual link: {rel}")

    legacy = read("docs/bite-31-3-core-business-demo-journey-pt-br.md")
    if "`Tenant` remains the intentional ERS domain term in Brazilian Portuguese." in legacy or "**Entidade**" not in legacy:
        errors.append("legacy Bite 31.3 contradicts Entidade terminology")
    terms = read("docs/bite-35/byte-35-4b-terminologia-entidade.md")
    for item in ["Entidade", "Ator da Entidade", "Administrador da Entidade", "Vínculo da Pessoa com a Entidade", "X-Tenant-ID", "TENANT_ADMIN", "Glossário Impact"]:
        if item not in terms:
            errors.append(f"terminology contract incomplete: {item}")
    acceptance = read("docs/bite-35/byte-35-4b-manual-acceptance.md")
    if re.findall(r"^### (T\d\d)\b", acceptance, flags=re.M) != [f"T{i:02d}" for i in range(1, 9)]:
        errors.append("manual acceptance T01–T08 incomplete/out of order")
    for fragment in ["APP", "ADMIN-A", "PASSOU", "FALHOU", "BLOQUEADO", "não", "LOCAL", "Cand.", "Repl."]:
        if fragment not in acceptance:
            errors.append(f"manual acceptance instruction missing: {fragment}")
    makefile = read("Makefile")
    ci = read(".github/workflows/ci.yml")
    if not re.search(r"^byte354b-terminology-check:\s*\n\s+python3 -B scripts/ers-byte354b-terminology-check.py\n\s+python3 -B scripts/test-byte354b-terminology.py", makefile, flags=re.M):
        errors.append("terminology make target missing checker or regression suite")
    if "$(MAKE) byte354b-terminology-check" not in makefile.split(".PHONY: local-check",1)[-1].split(".PHONY:",1)[0]:
        errors.append("local-check missing terminology target")
    if "make byte354b-terminology-check" not in ci:
        errors.append("GitHub CI missing terminology target")
    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: Byte 35.4B pt-BR terminology, 94-key parity, unchanged manual, references and CI contract")
    print("NOT VERIFIED: browser/UI, complete frontend suite, LOCAL environment, GitHub CI or Production")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
