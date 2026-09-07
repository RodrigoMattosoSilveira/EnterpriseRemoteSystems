# Database Promotion Strategy

ERS uses different database lifecycle rules for Development, Test, and Production.

## Environment contract

| Environment | Database strategy | Purpose |
|---|---|---|
| Local | Resettable; migration fixtures exercise fresh and historical upgrades | Development and migration verification |
| Development | Replaced from the complete current migration chain on every deployment | Current-state functional integration |
| Test | Preserved and migrated in place on ordinary deployments | Durable release candidate validation |
| Test release rehearsal | Restore a known pre-release baseline, then migrate it in place | Production migration rehearsal |
| Production | Preserved and migrated in place | Execute an upgrade already rehearsed in Test |

Production must never be the first environment in which a historical database upgrade is exercised.

## Local migration verification

`make local-check` continues to run all backend tests, including migration tests. For a focused migration-only run use:

```bash
make migration-check
```

The Bite 30H migration tests include both a valid pre-30H upgrade and explicit rejection cases for historical data that violates the new Tenant Administrator cardinality rules.

## Development deployment

Development is disposable. Deployment builds the backend image, removes only the Development `backend-data` volume, and uses that exact image to create a fresh SQLite database from every checked-in `.up.sql` migration. Integrity and foreign-key checks must pass before the normal application stack starts.

Development never copies a workstation `app.db` and never carries historical Development test debris across deployments.

## Ordinary Test deployment

Test is not reset during an ordinary deployment. Its existing `backend-data` volume remains in place and the backend entrypoint applies only migrations not already recorded in `schema_migrations`.

This lets Test behave like Production for in-place upgrades without making Production the first durable-data execution.

The existing Bite 30H offline Tenant Administrator reconciliation utility is not part of the normal Development or Test deployment path. It remains available for explicit diagnosis/remediation when an intentionally preserved database cannot satisfy the migration preconditions; no deployment target invokes it automatically.

## Test release rehearsal

A normal branch promotion into `test` is automatically treated as the release rehearsal. This keeps the promotion path safe by default: the exact source tree promoted from Development is rehearsed against a known pre-release baseline and must pass deployed Playwright before a Production gate can be recorded.

`workflow_dispatch` remains available for an explicit ordinary Test redeploy with **Test release rehearsal** disabled. When rehearsal is enabled, deployed Playwright must also remain enabled.

The rehearsal uses the known baseline:

```text
/opt/EnterpriseRemoteSystems/test/rehearsal-baselines/pre-bite30h.db
```

If a previously captured baseline exists, it is reused and never overwritten. If no baseline was captured before Bite 30H reached Test, deployment creates a deterministic pre-30H baseline from the repository migrations through `000061`. That generated baseline contains the upper valid Bite 30H boundary—two active Tenant Administrators in one Tenant, held by two distinct global Persons—and is probed with `000062` before it is accepted. One of those two valid slots is deliberately the deterministic `e2e-default-tenant-admin` / `tenant-admin@example.com` identity used by deployed Playwright. After the historical migration succeeds, E2E provisioning therefore reconciles that existing slot and password instead of attempting to create a prohibited third Tenant Administrator. The other slot remains a release-rehearsal-only Person so the two-Person upper boundary is still exercised. The local migration suite continues to exercise all deliberate legacy rejection cases.

For Bite 30H that baseline must contain migrations through:

```text
000061_expand_final_settlement_database_checks.up.sql
```

and must not already contain:

```text
000062_tenant_administrator_cardinality.up.sql
```

The restore step validates the baseline, replaces only the Test SQLite volume with that known snapshot, and then starts the normal Test backend. The backend therefore exercises the real in-place `000062` upgrade path.

After deployment, the normal health/smoke checks, administrator provisioning, and the complete deployed Playwright suite run against the migrated database.

Only after all of those checks succeed is a release-rehearsal marker recorded for the deployed **Git source-tree hash**.

## Capturing the Bite 30H Test baseline

A captured pre-30H Test snapshot is preferred when one is available because it preserves a real historical Test state. Capture it while Test is still running the pre-30H database:

```bash
cd /opt/EnterpriseRemoteSystems/test
make server-test-rehearsal-capture-baseline ENV=test
```

The command refuses to overwrite an existing baseline and refuses to capture a database that does not contain migration `000061` or already contains `000062`.

If the new Make target is not yet present in the currently checked-out pre-30H Test revision, use the existing backup target before promoting Bite 30H:

```bash
cd /opt/EnterpriseRemoteSystems/test
make server-test-backup
mkdir -p rehearsal-baselines
cp backups/app-<timestamp>.db rehearsal-baselines/pre-bite30h.db
```

The Bite 30H rehearsal restore validates that copied snapshot before it can replace the Test database. If no snapshot was captured, `make server-test-rehearsal-ensure-baseline ENV=test` generates and validates the deterministic fallback baseline automatically.

## Production release gate

Production deployment computes the immutable Git tree hash for the production revision and requires a successful Test rehearsal marker for that exact tree before it builds or starts the Production stack.

If Test has not successfully rehearsed the exact source tree, Production deployment stops with no Production database change.

This permits branch promotion to use a fast-forward or a merge commit: the commit SHA may differ, but the deployed source tree must be identical to the tree that passed the Test migration rehearsal.
