# Bite 33.5 — Migration / Deployment Recovery Gate

## Purpose

Bite 33.5 closes the gap between verified recovery artifacts (33.2–33.4) and an in-place deployment migration. A deployed ERS database is no longer implicitly migrated as a side effect of backend startup when `APP_AUTO_MIGRATE=false`.

For Test and Production deployment strategies that preserve an existing SQLite database, deployment now uses an explicit recovery gate:

1. create and verify a pre-migration backup;
2. replicate it off-host when off-host protection is enabled;
3. stage a verified 33.4 rollback candidate;
4. rehearse the repository migration chain against an isolated copy;
5. stop the deployed application stack;
6. migrate and verify the real SQLite volume while it is offline;
7. leave the recovery gate **armed** while the new application starts;
8. commit the gate only after backend health, SQLite integrity/foreign keys, and migrated-schema verification pass;
9. restore the pre-migration candidate and leave the stack stopped if live migration or post-deployment verification fails.

Development's disposable `replace-fresh` strategy continues to rebuild the database from the full current migration chain and does not require a rollback source.

## Explicit migration ownership

`backend/docker-entrypoint.sh` now honors `APP_AUTO_MIGRATE`:

- `true`: explicitly apply SQL migrations, intended only for deliberately selected environments/workflows;
- `false`: do **not** mutate schema; verify the database is already migrated before starting the API.

Deployed environment files already set `APP_AUTO_MIGRATE=false`, so Test/Production schema changes are owned by the 33.5 gate rather than container startup.

The migration implementation is `backend/apply-sql-migrations.sh`. It records a migration only after its SQL file succeeds, preserves the established `planning_availability` repair, and finishes with SQLite integrity and foreign-key verification.

## Preflight rehearsal

`make server-migration-recovery-gate ENV=<environment>` creates gate evidence under:

```text
<environment>/recovery/migration-gates/gate-<UTC>/
```

For an existing database, the gate creates a verified Bite 33.2 snapshot. If Bite 33.3 off-host protection is enabled, that snapshot must also successfully replicate before migration continues. A Bite 33.4 staged copy becomes the rollback source.

The gate then copies that source to `migration-probe.db`, applies the current repository migrations to the probe, and runs `verify-migrated-db.sh`. A deterministic migration failure on real production-shaped data therefore blocks deployment before the live database is touched.

On a first deployment where no prior SQLite volume exists, the probe starts empty and no rollback source is required because there is no prior database state to preserve.

## Offline live migration

After rehearsal succeeds, the complete deployed application stack is stopped. The gate applies migrations to `/app/data/app.db` through a one-off backend container sharing the real SQLite volume, then runs the full migrated-database verifier while the application remains offline.

If live migration or offline verification fails, the gate automatically restores the verified pre-migration candidate through the Bite 33.4 Go restore tool. The application remains stopped for operator inspection.

## Armed deployment state

A successful live migration writes:

```text
<environment>/recovery/migration-gates/current.state
```

with `status=armed` plus the gate directory, rollback candidate, source checksum, migration-probe checksum, expected final migration, and timestamps.

While the gate is armed, a second migration gate is refused.

The deployment workflow then starts the new revision. If stack startup, backend health, migrated-database verification, or environment/Caddy health fails, it runs:

```bash
make server-migration-recovery-rollback ENV=<environment>
```

That operation stops the stack, restores the exact staged pre-migration candidate, records rollback evidence, and intentionally leaves the stack stopped. Code/release recovery can then be performed deliberately without serving a mismatched application/database pair.

## Commit gate

Only a successful deployment runs:

```bash
make server-migration-recovery-commit ENV=<environment>
```

Commit independently requires:

- backend container running;
- `/healthz` success;
- `PRAGMA integrity_check = ok`;
- no `PRAGMA foreign_key_check` rows;
- the expected final migration and complete migrated-database contract.

The gate state then changes from `armed` to `committed`.

## Recovery boundary

33.5 protects database state during migration/deployment. It does not silently restart the new application after a rollback because the new code may require the migrated schema. A failed deployment that rolls the DB back therefore leaves services stopped.

The gate state also preserves the deployment code identities used by Bite 33.6 recovery operations:

```text
previous_revision=
previous_tree_sha=
target_revision=
target_tree_sha=
```

The deployment workflow captures the server revision/tree before checking out the target revision and supplies both previous and target identities to the gate. The deliberate code-revision recovery procedure is documented in `docs/database-recovery-runbook.md`.

## Automated regression

Run:

```bash
make migration-deployment-recovery-gate-check
```

The regression verifies the explicit migration runner, idempotence, failed-migration marker behavior, entrypoint no-implicit-migration contract, backup/off-host/stage/rehearsal/rollback/commit orchestration, CI wiring, and deployment workflow integration.

The check is included in `make local-check`, `make local-docker-check`, CI, and the deployment quality gate.
