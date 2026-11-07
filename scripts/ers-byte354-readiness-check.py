#!/usr/bin/env python3
"""Byte 35.4 *offline documentation contract* validation. No operational attestations.

Checks coverage against existing navigation, the frozen launch scope, Portuguese
training sections, an honest evidence template, and known pending dependencies.
No network, credentials, application process, database, or Docker access.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = "docs/bite-35/byte-35-4-readiness-contract.json"
REQUIRED_DOCUMENTS = {
    "customer_manual": "docs/bite-35/byte-35-4-manual-do-tenant-pt-br.md",
    "technical_runbook": "docs/bite-35/byte-35-4-operational-readiness.md",
    "manual_acceptance": "docs/bite-35/byte-35-4-manual-acceptance.md",
    "evidence_template": "docs/bite-35/byte-35-4-readiness-evidence.template.json",
}
FUNCTIONAL_IDS = [f"F{i:02d}" for i in range(1, 13)]
OPERATIONAL_IDS = [f"O{i:02d}" for i in range(1, 10)]
DEFERRED = ["34.5", "34.4", "33.6.6+", "33.6.8E/F"]
GATES = ["release_integrity", "security", "data_preservation", "backup_restore", "operational_continuity", "administrator_recovery"]
EXPECTED_ROUTES = {
    "people": "F02", "collaborators": "F03", "work-periods": "F04",
    "gold-production": "F07", "expenses": "F08",
    "collaborators/:id/current-account": "F09", "receipts/outstanding": "F10",
    "admin/authorization": "F11", "admin/reference-data": "F11",
    "admin/gold-prices": "F11", "admin/price-list-items": "F11",
    "admin/current-account-settings": "F11", "admin/support-access-leases": "O06",
}


def _read_json(path: Path, errors: list[str]) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("expected object")
        return data
    except (OSError, UnicodeError, ValueError) as exc:
        errors.append(f"could not read JSON {path.name}: {exc}")
        return {}


def _read_text(path: Path, errors: list[str]) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"could not read text {path.name}: {exc}")
        return ""


def _headings(text: str, level: int, initial: str) -> list[str]:
    # Anchored section headings, not mentions in paragraphs.
    return re.findall(rf"^{'#' * level} ({initial}\d{{2}})\b", text, flags=re.MULTILINE)


def validate(root: Path = ROOT, manifest_path: str = MANIFEST) -> list[str]:
    errors: list[str] = []
    manifest = _read_json(root / manifest_path, errors)
    if not manifest:
        return errors
    for key, expected in {"schema_version": 1, "byte": "35.4", "training_language": "pt-BR", "production_launch_authorized": False}.items():
        if type(manifest.get(key)) is not type(expected) or manifest.get(key) != expected:
            errors.append(f"invalid {key}: expected {expected!r}")
    if manifest.get("functional_case_ids") != FUNCTIONAL_IDS:
        errors.append("functional training coverage must contain F01-F12 exactly once in order")
    if manifest.get("operational_case_ids") != OPERATIONAL_IDS:
        errors.append("operational readiness must contain O01-O09 exactly once in order")
    if manifest.get("launch_gates") != GATES:
        errors.append("six launch gates must remain intact and ordered")
    if manifest.get("deferred") != DEFERRED:
        errors.append("deferred scope must remain explicit")
    if manifest.get("uncompleted_bites") != ["35.5", "35.6", "35.7"]:
        errors.append("remaining launch sub-bites must be pending")
    if "LastPass" not in str(manifest.get("known_blocker", "")) or "1Password" not in str(manifest.get("known_blocker", "")):
        errors.append("known LastPass/1Password reconciliation blocker omitted")

    sources: dict[str, str] = {}
    for key, expected in REQUIRED_DOCUMENTS.items():
        if manifest.get(key) != expected:
            errors.append(f"{key} must reference fixed path {expected}")
        sources[key] = _read_text(root / expected, errors) if expected.endswith(".md") else ""
    # Relative Markdown links must resolve within this source tree; no web/network lookups.
    for key in ("customer_manual", "technical_runbook", "manual_acceptance"):
        document = root / REQUIRED_DOCUMENTS[key]
        for url in re.findall(r"\]\(([^)]+)\)", sources[key]):
            path_part = url.split("#", 1)[0]
            if not path_part or path_part.startswith(("https://", "http://", "mailto:")):
                continue
            target = (document.parent / path_part).resolve()
            if not target.is_relative_to(root.resolve()) or not target.is_file():
                errors.append(f"broken or unsafe document link in {document.name}: {url}")

    manual = sources.get("customer_manual", "")
    ops = sources.get("technical_runbook", "")
    tests = sources.get("manual_acceptance", "")
    if _headings(manual, 2, "F") != FUNCTIONAL_IDS:
        errors.append("customer manual must have F01-F12 sections exactly once")
    if _headings(tests, 3, "F") != FUNCTIONAL_IDS:
        errors.append("manual acceptance must have F01-F12 tests exactly once")
    if _headings(ops, 2, "O") != OPERATIONAL_IDS:
        errors.append("technical runbook must have O01-O09 sections exactly once")
    if _headings(tests, 3, "O") != OPERATIONAL_IDS:
        errors.append("manual acceptance must have O01-O09 tests exactly once")
    if "```" in manual:
        errors.append("customer manual must be UI-only and have no executable code blocks")
    for fragment in ["Português (Brasil)", "Entidade", "Jornada", "Conta Corrente", "Setor", "Local", "Tarefa", "informad", "efetiv", "Recibo", "34.4", "35.7"]:
        if fragment not in manual:
            errors.append(f"customer manual missing terminology: {fragment}")
    for fragment in ["35.5", "35.6", "35.7", "1Password", "LastPass", "RPO", "RTO", "BLOCKED", "Docker", "integrity_check", "off-host", "make local-check"]:
        if fragment not in ops:
            errors.append(f"technical operations missing required safety/control: {fragment}")
    for fragment in ["PASS", "FAIL", "BLOCKED", "F01", "F12", "O01", "O09", "git rev-parse HEAD", "docker ps", "Ctrl+C", "pt-BR"]:
        if fragment not in tests:
            errors.append(f"manual acceptance missing mandatory contract: {fragment}")

    routes = manifest.get("navigation_routes")
    if not isinstance(routes, list) or any(not isinstance(item, dict) for item in routes):
        errors.append("navigation_routes must be a list of objects")
    else:
        pairs = [(item.get("route"), item.get("case")) for item in routes]
        if len(pairs) != len(EXPECTED_ROUTES) or dict(pairs) != EXPECTED_ROUTES:
            errors.append("route/case mapping differs from the frozen functional training coverage")
        router = _read_text(root / "frontend/src/app/router.tsx", errors)
        for route, _case in EXPECTED_ROUTES.items():
            if not re.search(r"\bpath:\s*['\"]" + re.escape(route) + r"['\"]", router):
                errors.append(f"navigation route absent from application: {route}")

    baseline = _read_json(root / "docs/bite-35/launch-baseline.json", errors)
    if baseline:
        scope = [b for b in baseline.get("launch_scope", []) if b.get("id") == "35.4"]
        if len(scope) != 1 or scope[0].get("absorbs") != "34.2":
            errors.append("35.4 / former 34.2 scope is absent from accepted baseline")
        if [g.get("id") for g in baseline.get("launch_gates", [])] != GATES:
            errors.append("launch baseline gate identities differ")
        if [d.get("id") for d in baseline.get("deferred", [])] != DEFERRED:
            errors.append("launch baseline deferred scope differs")
        if baseline.get("operational_assertions", {}).get("production_launch_authorized") is not False:
            errors.append("launch baseline must not pre-authorize Production")

    template = _read_json(root / REQUIRED_DOCUMENTS["evidence_template"], errors)
    if template:
        if template.get("schema_version") != 1 or template.get("byte") != "35.4":
            errors.append("invalid evidence template identity")
        for section, ids in [("functional_tests", FUNCTIONAL_IDS), ("operational_tests", OPERATIONAL_IDS)]:
            records = template.get(section, [])
            if not isinstance(records, list) or len(records) != len(ids) or [(r.get("id"), r.get("status")) for r in records if isinstance(r, dict)] != [(i, "NOT_RUN") for i in ids]:
                errors.append(f"{section} must start with every case NOT_RUN")
        records = template.get("production_launch_gates", [])
        if not isinstance(records, list) or len(records) != len(GATES) or [(r.get("id"), r.get("status")) for r in records if isinstance(r, dict)] != [(i, "NOT_VERIFIED") for i in GATES]:
            errors.append("production gate evidence must begin NOT_VERIFIED")
        if template.get("production_launch_authorized") is not False:
            errors.append("evidence template must not authorize Production")
        if template.get("recovery_locator_1password_reconciled") != "NOT_VERIFIED":
            errors.append("evidence template must keep the credential-custody blocker unverified")
        if any(template.get(k) != "NOT_RUN" for k in ["byte354_functional_acceptance", "byte354_operational_acceptance", "byte354_joint_acceptance", "ci_run_status"]):
            errors.append("evidence template must never fabricate successful acceptance or CI")
        if template.get("deferred_work") != DEFERRED:
            errors.append("evidence template must list deferred scope")

    return errors


def main() -> int:
    failures = validate()
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print("PASS: Byte 35.4 documentation, UI coverage and evidence-template contract")
    print("NOT VERIFIED: customer training, technical operations, deployed recovery, six Production launch gates and human signoff")
    return 0


if __name__ == "__main__":
    sys.exit(main())
