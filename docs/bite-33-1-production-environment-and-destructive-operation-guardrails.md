# Bite 33.1 — Production Environment and Destructive-Operation Guardrails

## Purpose

Bite 33.1 establishes the environment identity and fail-closed safety boundary required before ERS Production backup and recovery work proceeds. Reset, demo, fixture, test-data, and E2E provisioning tools must never mutate Production data, and a deployed server must not silently identify itself as Development when its environment configuration is missing or inconsistent.

This Bite does **not** implement Production backup/retention/restore. Those are later Bite 33 deliveries. It protects the runtime and operational commands that those deliveries will rely on.

## Canonical environment contract

Application runtime environment aliases are normalized as follows:

| Input | Canonical runtime environment |
|---|---|
| `local`, `dev`, `development` | `development` |
| `test`, `testing`, `ci` | `test` |
| `production`, `prod` | `production` |

Any other non-empty `APP_ENV` is rejected by backend configuration loading. LOCAL continues to default to Development when the backend is started directly without `APP_ENV`; deployed server startup does not use that fallback.

For deployed server Make targets, `ENV` must be exactly `development`, `test`, or `production`, and the matching `.env.<environment>` file must explicitly contain the same `APP_ENV`. `docker-compose.server.yml` requires `APP_ENV`; it no longer substitutes `development` when the value is absent.

The deployed database path, when declared through `DATABASE_PATH`, must be `/app/data/app.db`. Server startup/build uses the full safety contract. The non-destructive backup target uses the identity portion only, so an operator can still take a recovery copy before repairing an unsafe Production setting.

## Production runtime safeguards

Production configuration rejects the following unsafe runtime switches:

- `APP_AUTO_MIGRATE=true`;
- `AUTHZ_DISABLE_ROUTE_AUTHORIZATION=true`.

The server environment contract also requires any configured Production actor-header mode to be `disabled` and any configured `DEV_SEED_ADMIN` value to be false. Production environment initializers and the committed Production example write the safe values explicitly.

## Destructive and test-tooling safeguards

`scripts/ers-environment-guard.sh` is the shared shell guard. `scripts/ers_environment.py` provides the equivalent check for Python fixture/reset tools.

The following operations refuse Production before mutating data:

- SQLite/database reset helpers;
- LOCAL backend/test reset tooling when pointed at a Production environment;
- local and server test-data reset flows;
- Brazilian demo reset/seed flows;
- manual-test fixture seed/reset scripts;
- disposable Development database construction;
- deployed Docker volume deletion;
- server administrator reset tooling; and
- E2E/test Application Administrator provisioning.

Unknown or missing environment identity is also refused by destructive shared tooling. There is intentionally no `--allow-production` bypass for E2E provisioning.

The legacy `scripts/init-env.sh` is now explicitly Development/Test-only. It refuses a Production template instead of creating a Production file containing Development administrator seed settings. Production environment initialization must use the Production-safe server initializer.

## Deployment behavior

Development and Test deployments retain the E2E administrator provisioning workflow required by deployed automated testing.

Production deployment skips E2E/test administrator provisioning entirely. Production Administrator lifecycle is not performed by demo/test provisioning commands. Deployed Playwright remains disabled for Production.

The Bite 33.1 regression check runs in:

- `make local-check`;
- `make local-docker-check`;
- normal CI; and
- the deployment quality gate.

## Regression command

Run:

```bash
make production-environment-guardrails-check
```

The check verifies both behavior and integration, including:

- Production reset refusal occurs before SQLite files are removed;
- Development reset still works;
- server environment mismatch/missing identity is rejected;
- unsafe Production seed/runtime settings are rejected;
- Production environment initialization emits safe settings;
- Production deployment skips E2E/test provisioning;
- CI/deployment gates execute the 33.1 regression; and
- every repository-owned manual/demo Python mutator uses the shared non-Production guard.

## Operational invariant

> No command whose primary purpose is reset, demo preparation, fixture generation, deterministic test setup, or E2E/test administrator provisioning may mutate a Production database.

Environment uncertainty is treated as a refusal condition for destructive tooling.
