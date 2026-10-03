#!/usr/bin/env python3
"""Regression checks for Bite 33.1 Production environment/destructive-operation guards."""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHELL_GUARD = ROOT / "scripts" / "ers-environment-guard.sh"
RESET_SQLITE = ROOT / "scripts" / "reset-sqlite-database.sh"
MUTATING_PYTHON_TOOLS = (
    "reset-bite30c2-aline-authentication.py",
    "reset-bite30c2-aline-to-not-enabled.py",
    "seed-bite30c-byte28a-manual-testdata.py",
    "seed-bite30c2-manual-test-people.py",
    "seed-bite30d-manual-test-identities.py",
    "seed-bite30e-manual-test-identities.py",
    "seed-bite30g-final-manual-testdata.py",
    "seed-brazilian-demo.py",
    "seed-manual-testdata.py",
)


def run(cmd: list[str], *, env: dict[str, str] | None = None, cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )


def require_success(proc: subprocess.CompletedProcess[str], context: str) -> None:
    if proc.returncode != 0:
        raise AssertionError(f"{context} failed ({proc.returncode}):\n{proc.stdout}")


def require_failure(proc: subprocess.CompletedProcess[str], context: str, needle: str) -> None:
    if proc.returncode == 0:
        raise AssertionError(f"{context} unexpectedly succeeded:\n{proc.stdout}")
    if needle not in proc.stdout:
        raise AssertionError(f"{context} did not explain the refusal with {needle!r}:\n{proc.stdout}")


def test_shared_shell_guard() -> None:
    for value in ("development", "dev", "local", "test", "testing", "ci"):
        proc = run([str(SHELL_GUARD), "require-non-production", value, "regression probe"])
        require_success(proc, f"non-Production guard for {value}")

    for value in ("production", "prod"):
        proc = run([str(SHELL_GUARD), "require-non-production", value, "regression probe"])
        require_failure(proc, f"Production guard for {value}", "Production data must not be modified")

    for value in ("", "staging", "prodution"):
        proc = run([str(SHELL_GUARD), "require-non-production", value, "regression probe"])
        require_failure(proc, f"unknown guard for {value!r}", "must explicitly identify")


def test_reset_helper_cannot_touch_production() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-1-reset-") as tmp:
        db = Path(tmp) / "app.db"
        sidecars = [db, Path(str(db) + "-wal"), Path(str(db) + "-shm"), Path(str(db) + "-journal")]
        for path in sidecars:
            path.write_text("sentinel", encoding="utf-8")

        prod_env = {**os.environ, "APP_ENV": "production"}
        proc = run([str(RESET_SQLITE), str(db)], env=prod_env)
        require_failure(proc, "Production SQLite reset", "Production data must not be modified")
        missing = [str(path) for path in sidecars if not path.exists()]
        if missing:
            raise AssertionError(f"Production refusal happened after deleting files: {missing}")

        dev_env = {**os.environ, "APP_ENV": "development"}
        proc = run([str(RESET_SQLITE), str(db)], env=dev_env)
        require_success(proc, "Development SQLite reset")
        remaining = [str(path) for path in sidecars if path.exists()]
        if remaining:
            raise AssertionError(f"Development reset left SQLite files behind: {remaining}")


def test_make_reset_db_target() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-1-make-reset-") as tmp:
        db = Path(tmp) / "sentinel.db"
        sidecars = [db, Path(str(db) + "-wal"), Path(str(db) + "-shm"), Path(str(db) + "-journal")]
        for path in sidecars:
            path.write_text("sentinel", encoding="utf-8")

        prod_env = {
            **os.environ,
            "APP_ENV": "production",
            "ERS_DATABASE_PATH": str(db),
        }
        proc = run(["make", "reset-db"], env=prod_env)
        require_failure(proc, "Production make reset-db", "Production data must not be modified")
        changed = [str(path) for path in sidecars if not path.exists() or path.read_text(encoding="utf-8") != "sentinel"]
        if changed:
            raise AssertionError(f"make reset-db modified Production sentinel files before refusing: {changed}")

        missing_env = {**os.environ, "ERS_DATABASE_PATH": str(db)}
        missing_env.pop("APP_ENV", None)
        proc = run(["make", "reset-db"], env=missing_env)
        require_failure(proc, "make reset-db without APP_ENV", "must explicitly identify")
        changed = [str(path) for path in sidecars if not path.exists() or path.read_text(encoding="utf-8") != "sentinel"]
        if changed:
            raise AssertionError(f"make reset-db modified files without an explicit environment: {changed}")

        no_path_env = {**os.environ, "APP_ENV": "development"}
        no_path_env.pop("ERS_DATABASE_PATH", None)
        proc = run(["make", "reset-db"], env=no_path_env)
        require_failure(proc, "make reset-db without ERS_DATABASE_PATH", "ERS_DATABASE_PATH must explicitly identify")

        dev_env = {
            **os.environ,
            "APP_ENV": "development",
            "ERS_DATABASE_PATH": str(db),
        }
        proc = run(["make", "reset-db"], env=dev_env)
        require_success(proc, "Development make reset-db")
        remaining = [str(path) for path in sidecars if path.exists()]
        if remaining:
            raise AssertionError(f"Development make reset-db left SQLite files behind: {remaining}")


def test_server_environment_contract() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-1-env-") as tmp:
        env_file = Path(tmp) / ".env.production"
        env_file.write_text(
            "\n".join(
                [
                    "APP_ENV=production",
                    "DATABASE_PATH=/app/data/app.db",
                    "APP_AUTO_MIGRATE=false",
                    "AUTHZ_ACTOR_HEADER_MODE=disabled",
                    "DEV_SEED_ADMIN=false",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        proc = run([str(SHELL_GUARD), "require-server-contract", "production", str(env_file)])
        require_success(proc, "valid Production environment contract")

        proc = run([str(SHELL_GUARD), "require-server-contract", "test", str(env_file)])
        require_failure(proc, "mismatched selected/deployed environment", "selected ENV=test")

        env_file.write_text(
            "APP_ENV=production\nDATABASE_PATH=/app/data/app.db\nAUTHZ_ACTOR_HEADER_MODE=disabled\nDEV_SEED_ADMIN=true\n",
            encoding="utf-8",
        )
        proc = run([str(SHELL_GUARD), "require-server-contract", "production", str(env_file)])
        require_failure(proc, "Production DEV_SEED_ADMIN", "DEV_SEED_ADMIN must be false")

        proc = run([str(SHELL_GUARD), "require-server-identity", "production", str(env_file)])
        require_success(proc, "Production backup identity check despite unsafe runtime switch")

        env_file.write_text("DATABASE_PATH=/app/data/app.db\n", encoding="utf-8")
        proc = run([str(SHELL_GUARD), "require-server-contract", "production", str(env_file)])
        require_failure(proc, "missing Production APP_ENV", "must explicitly define APP_ENV=production")


def test_environment_initializers_are_production_safe() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-1-init-") as tmp:
        tmp_path = Path(tmp)
        proc = run([str(ROOT / "scripts" / "init-server-env.sh"), "production"], cwd=tmp_path)
        require_success(proc, "server Production env initializer")
        text = (tmp_path / ".env.production").read_text(encoding="utf-8")
        for expected in (
            "APP_ENV=production",
            "DATABASE_PATH=/app/data/app.db",
            "DEV_SEED_ADMIN=false",
            "APP_AUTO_MIGRATE=false",
            "AUTHZ_DISABLE_ROUTE_AUTHORIZATION=false",
            "AUTHZ_ACTOR_HEADER_MODE=disabled",
        ):
            if expected not in text:
                raise AssertionError(f"Production env initializer missing {expected!r}")


def test_legacy_environment_initializer_refuses_production() -> None:
    with tempfile.TemporaryDirectory(prefix="ers-33-1-legacy-init-") as tmp:
        output = Path(tmp) / ".env.production"
        proc = run(
            [
                str(ROOT / "scripts" / "init-env.sh"),
                str(ROOT / "backend" / ".env.production.example"),
                str(output),
            ]
        )
        require_failure(proc, "legacy Production environment initializer", "Production data must not be modified")
        if output.exists():
            raise AssertionError("legacy Production initializer created a file before refusing")


def test_static_production_barriers() -> None:
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
    compose = (ROOT / "docker-compose.server.yml").read_text(encoding="utf-8")
    deploy = (ROOT / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    init_env = (ROOT / "scripts" / "init-env.sh").read_text(encoding="utf-8")
    production_example = (ROOT / "backend" / ".env.production.example").read_text(encoding="utf-8")
    provision = (ROOT / "backend" / "cmd" / "provision-e2e-admin" / "main.go").read_text(encoding="utf-8")
    dev_backend = (ROOT / "scripts" / "dev-backend.sh").read_text(encoding="utf-8")

    required_make_fragments = (
        '.PHONY: server-environment-identity-check',
        'ers-environment-guard.sh require-server-identity "$(ENV)" "$(ENV_DIR)/$(ENV_FILE)"',
        '.PHONY: server-environment-contract-check',
        'ers-environment-guard.sh require-server-contract "$(ENV)" "$(ENV_DIR)/$(ENV_FILE)"',
        'ers-environment-guard.sh require-non-production "$(ENV)" "server volume deletion"',
        'ers-environment-guard.sh require-non-production "$(ENV)" "E2E/test administrator provisioning"',
        'ers-environment-guard.sh require-non-production "$(ENV)" "server administrator reset"',
        'Refusing E2E/test administrator provisioning in Production.',
        'Refusing administrator reset tooling in Production.',
    )
    for fragment in required_make_fragments:
        if fragment not in makefile:
            raise AssertionError(f"Makefile is missing Production barrier {fragment!r}")
    if "server-backup:\n\t@$(MAKE) server-environment-identity-check ENV=$(ENV)" not in makefile:
        raise AssertionError("server backup must verify environment identity without blocking recovery on unsafe runtime switches")

    if '${APP_ENV:?APP_ENV is required for deployed environments}' not in compose:
        raise AssertionError("deployed Compose still permits an implicit APP_ENV")
    if '--allow-production' in provision or '--allow-production' in makefile:
        raise AssertionError("E2E provisioning still contains a Production bypass")
    if "only local/development/test environments are permitted" not in provision:
        raise AssertionError("E2E provisioning does not fail closed by environment")
    if 'if: ${{ steps.target.outputs.env_name != \'production\' }}' not in deploy:
        raise AssertionError("deployment workflow still provisions the E2E administrator in Production")
    if 'Production deployment intentionally skips E2E/test administrator provisioning.' not in deploy:
        raise AssertionError("deployment workflow does not document Production provisioning refusal")
    if 'make production-environment-guardrails-check' not in deploy:
        raise AssertionError("deployment quality gate does not execute the Bite 33.1 guardrail regression")
    if 'make production-environment-guardrails-check' not in ci:
        raise AssertionError("CI does not execute the Bite 33.1 guardrail regression")
    if 'require-non-production "$APP_ENV_VALUE" "legacy development/test environment initialization"' not in init_env:
        raise AssertionError("legacy environment initializer can still seed an arbitrary/Production environment")
    for expected in ("APP_AUTO_MIGRATE=false", "AUTHZ_DISABLE_ROUTE_AUTHORIZATION=false", "DEV_SEED_ADMIN=false"):
        if expected not in production_example:
            raise AssertionError(f"Production environment example is missing safe setting {expected!r}")
    if 'require-non-production "${APP_ENV:-}" "local backend/test tooling"' not in dev_backend:
        raise AssertionError("local backend wrapper can still be pointed at Production")

    for filename in MUTATING_PYTHON_TOOLS:
        text = (ROOT / "scripts" / filename).read_text(encoding="utf-8")
        if "require_non_production_data_mutation" not in text:
            raise AssertionError(f"{filename} is missing the shared Production mutation guard")


def test_brazilian_demo_local_backend_contract() -> None:
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
    expected = (
        "brazilian-demo-local-backend: brazilian-demo-local-verify\n"
        "\t@echo \"Starting LOCAL backend against deterministic Brazilian demo database: "
        "$(abspath $(BRAZILIAN_DEMO_DB))\"\n"
        "\tAPP_ENV=development ERS_DATABASE_PATH=\"$(abspath $(BRAZILIAN_DEMO_DB))\" "
        "$(MAKE) local-backend"
    )
    if expected not in makefile:
        raise AssertionError(
            "Brazilian demo LOCAL backend must verify the fixture and pin local-backend "
            "to the deterministic demo database with an explicit Development environment."
        )


def test_python_guard() -> None:
    sys.path.insert(0, str(ROOT / "scripts"))
    try:
        from ers_environment import require_non_production_data_mutation
    finally:
        sys.path.pop(0)

    for value in ("local", "development", "test", "ci"):
        normalized = require_non_production_data_mutation("regression probe", value)
        if normalized not in {"development", "test"}:
            raise AssertionError(f"unexpected normalized environment {normalized!r}")
    for value in ("production", "prod", "", "staging"):
        try:
            require_non_production_data_mutation("regression probe", value)
        except SystemExit:
            pass
        else:
            raise AssertionError(f"Python guard unexpectedly allowed {value!r}")


def main() -> int:
    test_shared_shell_guard()
    test_reset_helper_cannot_touch_production()
    test_make_reset_db_target()
    test_server_environment_contract()
    test_environment_initializers_are_production_safe()
    test_legacy_environment_initializer_refuses_production()
    test_static_production_barriers()
    test_brazilian_demo_local_backend_contract()
    test_python_guard()
    print("Bite 33.1 Production environment/destructive-operation guardrails verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
