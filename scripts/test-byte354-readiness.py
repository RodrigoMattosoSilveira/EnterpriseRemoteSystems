#!/usr/bin/env python3
"""Negative and positive tests for the offline Byte 35.4 readiness document contract."""
from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("byte354", ROOT / "scripts/ers-byte354-readiness-check.py")
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

assert not module.validate(ROOT), module.validate(ROOT)

with tempfile.TemporaryDirectory(prefix="ers-byte354-test-") as work:
    target = Path(work)
    files = [module.MANIFEST, *module.REQUIRED_DOCUMENTS.values(),
             "docs/bite-35/launch-baseline.json", "frontend/src/app/router.tsx",
             "docs/database-recovery-runbook.md",
             "docs/bite-3368/manual-acceptance-tests.md",
             "docs/bite-33-6-recovery-rehearsal-and-operational-runbook.md",
             "docs/bite-35/byte-35-3-actual-work-location-override.md",
             "docs/bite-35/byte-35-4a-cartao-substituicoes-pt-br.md"]
    for relative in files:
        source = ROOT / relative
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)

    manifest = target / module.MANIFEST
    template = target / module.REQUIRED_DOCUMENTS["evidence_template"]
    ops = target / module.REQUIRED_DOCUMENTS["technical_runbook"]
    manual = target / module.REQUIRED_DOCUMENTS["customer_manual"]
    cases = target / module.REQUIRED_DOCUMENTS["manual_acceptance"]
    baseline_data = json.loads(manifest.read_text())
    evidence_data = json.loads(template.read_text())
    negative_cases = 0

    def reject(label, path, content, expected):
        global negative_cases
        original = path.read_text()
        path.write_text(content, encoding="utf-8")
        errors = module.validate(target)
        assert any(expected in error for error in errors), f"{label}: {errors}"
        path.write_text(original, encoding="utf-8")
        assert not module.validate(target), f"{label}: failed to restore clean fixture"
        negative_cases += 1

    changed = dict(baseline_data, training_language="en-US")
    reject("wrong locale", manifest, json.dumps(changed), "training_language")
    changed = dict(baseline_data, production_launch_authorized=True)
    reject("forged launch approval", manifest, json.dumps(changed), "production_launch_authorized")
    changed = dict(baseline_data, functional_case_ids=["F01"])
    reject("missing training coverage", manifest, json.dumps(changed), "functional training coverage")
    changed = dict(baseline_data, deferred=[])
    reject("erased deferred items", manifest, json.dumps(changed), "deferred scope")
    changed = dict(baseline_data, navigation_routes=[])
    reject("missing route coverage", manifest, json.dumps(changed), "route/case mapping")
    changed = dict(evidence_data, production_launch_authorized=True)
    reject("forged evidence approval", template, json.dumps(changed), "evidence template must not authorize")
    changed = json.loads(json.dumps(evidence_data))
    changed["functional_tests"][0]["status"] = "PASS"
    reject("prefilled human PASS", template, json.dumps(changed), "functional_tests must start")
    changed = json.loads(json.dumps(evidence_data))
    changed["production_launch_gates"][0]["status"] = "PASS"
    reject("prefilled launch gate", template, json.dumps(changed), "production gate evidence")
    reject("missing operator instructions", ops, ops.read_text().replace("LastPass", "legacy-vault"), "LastPass")
    reject("missing customer workflow", manual, manual.read_text().replace("## F06", "## absent"), "customer manual must have")
    reject("broken customer manual link", manual, manual.read_text().replace("byte-35-4-operational-readiness.md", "nonexistent-ops-file.md"), "broken or unsafe document link")
    reject("missing manual test", cases, cases.read_text().replace("### O05", "### absent"), "manual acceptance must have O01")
    router_path = target / "frontend/src/app/router.tsx"
    reject("missing real route", router_path, router_path.read_text().replace('path: "work-periods"', 'path: "removed-work-periods"'), "navigation route absent")

print(f"PASS: Byte 35.4 documentation validator positive + {negative_cases} fail-closed negative regressions")
print("NOT VERIFIED: external operations, users, actual restore, CI matching SHA or Production release")
