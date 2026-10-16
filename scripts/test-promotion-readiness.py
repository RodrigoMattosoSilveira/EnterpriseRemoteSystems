#!/usr/bin/env python3
"""Static release wiring and syntax checks; no Production credentials needed."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
makefile = (ROOT / "Makefile").read_text()
ci = (ROOT / ".github/workflows/ci.yml").read_text()
smoke = (ROOT / ".github/workflows/onepassword-smoke.yml").read_text()
for name in ("production-bootstrap-reconciliation-check", "production-bootstrap-full-schema-check", "onepassword-materialization-check", "promotion-readiness-check"):
    assert f".PHONY: {name}" in makefile, name
assert "$(MAKE) production-bootstrap-reconciliation-check" in makefile.split("local-check:", 1)[1], "missing local-check bootstrap coverage"
assert "$(MAKE) production-bootstrap-full-schema-check" in makefile.split("local-check:", 1)[1]
assert "$(MAKE) production-bootstrap-full-schema-check" in makefile.split("promotion-readiness-check:", 1)[1]
assert "$(MAKE) onepassword-materialization-check" in makefile.split("local-check:", 1)[1], "missing local-check materialization coverage"
assert "make promotion-readiness-check" in ci, "CI must run readiness checks"
assert "ers-development ers-test ers-production ers-recovery ers-automation-bootstrap" in smoke, "cross-vault denials missing"
assert '[[ "$forbidden" == "$EXPECTED_VAULT" ]] && continue' in smoke, "expected-vault exclusion missing"
for script in ("scripts/ers-environment-guard.sh", "scripts/server-migration-recovery-gate.sh"):
    subprocess.run(["bash", "-n", str(ROOT / script)], check=True)
for filename in ("scripts/test-production-environment-guardrails.py", "scripts/test-owner-unavailable-recovery-readiness.py", "scripts/test-production-bootstrap-reconciliation.py", "scripts/test-ers-op-materialize.py"):
    subprocess.run([sys.executable, "-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", str(ROOT / filename)], check=True)
print("Promotion readiness wiring and syntax PASS")
