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

The server Make workflow also removes safety-sensitive `APP_ENV`, `APP_AUTO_MIGRATE`, `AUTHZ_ACTOR_HEADER_MODE`, and `DEV_SEED_ADMIN` values from the ambient shell before invoking Docker Compose. This makes the selected `.env.<environment>` file authoritative for those settings instead of allowing an operator shell export to override a file that already passed the environment-contract guard.

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

The supported Make wrapper for an explicit disposable SQLite-file reset is:

```bash
APP_ENV=development ERS_DATABASE_PATH=/absolute/or/relative/disposable.db make reset-db
```

`reset-db` requires both `APP_ENV` and `ERS_DATABASE_PATH`. `APP_ENV=production`, a missing/unknown `APP_ENV`, or a missing `ERS_DATABASE_PATH` is refused before the database file or its SQLite sidecars are removed. This target is distinct from `local-db-reset`, which only clears legacy LOCAL session-data tables in `backend/data/app.db`.

For the Bite 33.1 Production-refusal manual probe, use a sentinel file and expect a non-zero exit **without changing its checksum**:

```bash
printf 'DO NOT DELETE\n' > /tmp/ers-331-manual/sentinel.db
shasum -a 256 /tmp/ers-331-manual/sentinel.db
APP_ENV=production ERS_DATABASE_PATH=/tmp/ers-331-manual/sentinel.db make reset-db
shasum -a 256 /tmp/ers-331-manual/sentinel.db
```

The two checksums must be identical. The expected refusal contains `Production data must not be modified by reset/demo/test tooling.`

### Deployed environment-file manual probe

Do not use raw `docker compose ... config` to prove that a particular environment file contains `APP_ENV`. Docker Compose resolves variables from multiple inputs and its rendered output proves the final value, not which source supplied it.

For a deterministic Bite 33.1 manual probe, validate the disposable file itself:

```bash
make server-environment-contract-probe \
  ENV=production \
  SERVER_ENV_PROBE_FILE=/tmp/ers-331-manual/no-app-env.env
```

If that file does not explicitly contain `APP_ENV=production`, the command must fail with an environment-contract violation even if the calling shell contains `APP_ENV=production`. A valid file containing the explicit Production identity and safe Production settings must pass. This probe is read-only and is not used by deployment targets.

### Production volume-deletion refusal

The supported manual probe for deployed Production volume deletion is:

```bash
make server-prod-down-volumes
```

This target intentionally delegates to the guarded `server-down-volumes` implementation with `ENV=production`. The expected result is a non-zero Make exit before Docker Compose is invoked, with a refusal containing `Production data must not be modified by reset/demo/test tooling.`

For Bite 33.1 Manual Test 08, **failure is the expected PASS path**: ERS must refuse the Production volume-deletion operation before `docker compose down -v` can run. The operator may compare `docker volume ls` before and after as an additional observation, but the guard itself must fire before any Docker volume deletion is attempted.

Development and Test retain their existing explicit aliases:

```bash
make server-dev-down-volumes
make server-test-down-volumes
```

Those are destructive non-Production operations and should only be used against disposable Development/Test data.

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

## Brazilian demo LOCAL backend contract

The deterministic Brazilian demo remains isolated from the normal LOCAL database. `make local-backend` uses the ordinary LOCAL database (normally `backend/data/app.db`) and therefore does **not** guarantee that the Brazilian demo presenter account exists.

After preparing the demo database with:

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
```

start the backend with the dedicated target:

```bash
make brazilian-demo-local-backend
```

That target verifies the deterministic demo fixture first, then starts `local-backend` with `APP_ENV=development` and an explicit absolute `ERS_DATABASE_PATH` pointing at `backend/data/brazilian-demo.db`. This preserves the normal LOCAL database while making the documented presenter credential deterministic:

```text
Login:    demo.tenant-admin@example.test
Password: Demo-31.4-Brasil!
```

For Bite 33.1 Manual Test 06, plain `make local-backend` is not the Brazilian demo startup command. The expected path is `make brazilian-demo-local-backend`.
