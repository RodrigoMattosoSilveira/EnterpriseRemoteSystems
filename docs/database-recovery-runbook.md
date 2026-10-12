# ERS Database Recovery Operational Runbook

## 1. Scope

This runbook is the operator procedure for recovering the Enterprise Remote Systems SQLite database using the safeguards delivered in Bites 33.1–33.6.

It covers:

- routine non-destructive recovery rehearsal;
- database corruption or accidental data loss while the application host survives;
- loss of the application host/local backup directory/local off-host receipt;
- migration/deployment rollback;
- code revision recovery after a migration rollback;
- failed restore handling;
- recovery verification and evidence retention.

This runbook does **not** recover application secrets or environment configuration from the database backup. A host-loss recovery still requires the correct ERS repository revision, deployed `.env.<environment>` file, S3 credential material, TLS/edge configuration, and other secrets to be restored from their normal administrative sources.

## 2. Recovery objectives

The default Bite 33.6 objectives are:

```text
RPO <= 24 hours
RTO <= 4 hours
```

`server-recovery-rehearsal` records both objectives in seconds. For meaningful RPO evidence, rehearse the newest verified restore point that would be selected during a real incident.

Do not claim the objective was met merely because a backup exists. The rehearsal must reach an isolated healthy backend and pass database verification.

## 3. Non-negotiable safety rules

1. Explicitly identify `development`, `test`, or `production` before any backup, restore, migration, or destructive operation.
2. Never use a backup manifest from one environment to restore another environment.
3. Prefer exact-version off-host recovery evidence for Production incidents.
4. Do not use an S3 `ETag` as a SHA-256 checksum.
5. Do not bypass Hetzner Object Lock/Governance retention merely to clean up recovery evidence.
6. A Bite 33.5 rollback leaves the application stack stopped on purpose. Do not restart the new revision against the rolled-back database unless compatibility has been deliberately established.
7. If a restore fails after entering the destructive phase, keep the backend stopped until the live DB, recovery candidate, restore report, and pre-restore evidence have been reviewed.
8. Do not open preserved raw SQLite evidence directly with a writable SQLite client when associated WAL/SHM/journal sidecars are present. Clone the evidence first for logical inspection.
9. Do not delete pre-restore, migration-gate, or rehearsal evidence until the incident/rehearsal has been accepted.

## 4. Environment identity check

From the ERS repository directory on the server:

```bash
git rev-parse HEAD
git rev-parse HEAD^{tree}
```

For Production also run:

```bash
make server-environment-contract-check ENV=production
```

Do not continue if the selected environment contract fails.

## 5. Routine non-destructive Production recovery rehearsal

### 5.1 Choose the restore point

Use the newest verified Production backup that would be selected during an incident.

If the managed filename is known from Hetzner Object Storage, use the strongest host-loss rehearsal:

```bash
make server-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME=app-<timestamp>.db
```

If a surviving local off-host receipt is the intended source:

```bash
make server-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_RECEIPT_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-<timestamp>.db.offhost.json
```

For a verified local-only recovery test:

```bash
make server-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-<timestamp>.db
```

Exactly one source must be supplied.

### 5.2 Accept the rehearsal only when all gates pass

Expected terminal summary includes:

```text
Recovery rehearsal passed.
Selected restore-point age / RPO: ... true
Recovery rehearsal RTO: ... true
Evidence: .../rehearsal.json
```

Inspect:

```bash
jq . /opt/EnterpriseRemoteSystems/production/recovery/rehearsals/rehearsal-<UTC>/rehearsal.json
```

Required evidence:

- `status = passed`;
- `environment = production`;
- exact source SHA-256;
- exact remote DB/manifest VersionIds for S3 sources;
- recovered SHA equals source SHA;
- current-schema migration verification succeeded;
- `isolated_backend_health = passed`;
- post-boot integrity is `ok`;
- post-boot foreign keys are `clean`;
- `rpo_met = true`;
- `rto_met = true`.

A failed RPO/RTO objective is an operational finding even when recovery mechanics succeed.

## 6. Database corruption or accidental data loss — host survives

### 6.1 Preserve the current state

If the backend is healthy enough to take a verified backup, run:

```bash
make server-backup ENV=production
```

If the backend/database is too damaged to produce a verified backup, do not force a new backup. The restore flow will preserve the existing target as raw pre-restore evidence.

### 6.2 Materialize a known-good off-host restore point

Preferred Production path:

```bash
make server-restore-materialize-offhost \
  ENV=production \
  OFFHOST_BACKUP_NAME=app-<timestamp>.db
```

Record the printed `Recovery candidate directory` and derive the candidate path:

```text
/opt/EnterpriseRemoteSystems/production/recovery/offhost-.../app-<timestamp>.db
```

### 6.3 Verify before apply

```bash
make server-restore-verify \
  ENV=production \
  RECOVERY_BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/recovery/<candidate>/app-<timestamp>.db
```

Do not continue unless verification passes.

### 6.4 Apply with the exact Production confirmation

```bash
make server-restore-apply \
  ENV=production \
  RECOVERY_BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/recovery/<candidate>/app-<timestamp>.db \
  RESTORE_CONFIRM=RESTORE-PRODUCTION
```

The workflow re-verifies the candidate, stops the backend before SQLite replacement, preserves the previous target, installs the candidate atomically, restarts the backend, and requires health/integrity/foreign-key verification.

### 6.5 Post-recovery checks

```bash
make server-prod-backend-health
make server-migrated-db-verify ENV=production
make server-prod-env-caddy-health
make server-prod-smoke
```

If the restored backup predates the currently deployed schema and the current application cannot start, do **not** silently migrate during restore. Follow the migration/code compatibility procedure in Sections 8–9.

## 7. Host loss — local DB, backups, and receipts unavailable

### 7.1 Rebuild the server prerequisites first

Before database recovery, restore/provision:

- `/opt/EnterpriseRemoteSystems/production` repository checkout;
- `.env.production`;
- Hetzner S3 credentials/profile referenced by that env file;
- Docker/Compose runtime;
- required edge/TLS configuration and secrets.

The database backup does not contain those secrets/configuration files.

Build the selected ERS revision before materialization/apply:

```bash
make server-prod-build
```

### 7.2 Recover using only the managed backup filename

```bash
make server-restore-materialize-offhost \
  ENV=production \
  OFFHOST_BACKUP_NAME=app-<timestamp>.db
```

This fetches the protected remote receipt, obtains its receipt VersionId, then downloads the exact DB and manifest VersionIds named by that receipt.

Verify and apply as in Sections 6.3–6.4.

### 7.3 Verify service recovery

```bash
make server-prod-backend-health
make server-migrated-db-verify ENV=production
make server-prod-env-caddy-health
make server-prod-smoke
```

Record incident RPO from the selected backup's `created_at` and incident RTO from incident/recovery timestamps. A later non-destructive rehearsal may validate mechanics, but it does not replace the actual incident timing record.

## 8. Migration/deployment failure while the 33.5 gate is armed

Inspect:

```bash
cat /opt/EnterpriseRemoteSystems/production/recovery/migration-gates/current.state
```

If `status=armed`, roll the database back:

```bash
make server-migration-recovery-rollback ENV=production
```

Expected outcome:

- exact verified pre-migration DB restored;
- rollback evidence written under the gate directory;
- state becomes `rolled_back`;
- **application stack remains stopped**.

Do not immediately run `server-prod-up` using the failed target revision.

## 9. Recover the compatible code revision after migration rollback

The 33.5 state now records:

```text
previous_revision=
previous_tree_sha=
target_revision=
target_tree_sha=
```

After database rollback, read the previous code identity:

```bash
STATE=/opt/EnterpriseRemoteSystems/production/recovery/migration-gates/current.state
PREVIOUS_REVISION="$(grep '^previous_revision=' "$STATE" | cut -d= -f2-)"
PREVIOUS_TREE_SHA="$(grep '^previous_tree_sha=' "$STATE" | cut -d= -f2-)"
printf 'Previous revision: %s\nPrevious tree: %s\n' "$PREVIOUS_REVISION" "$PREVIOUS_TREE_SHA"
```

Both must be 40-character Git SHAs and must correspond to the deployment that was running before the failed target revision.

Verify the commit is available:

```bash
git cat-file -e "${PREVIOUS_REVISION}^{commit}"
```

Switch to the exact previous revision without moving the Production branch reference:

```bash
git checkout --detach "$PREVIOUS_REVISION"
test "$(git rev-parse HEAD)" = "$PREVIOUS_REVISION"
test "$(git rev-parse HEAD^{tree})" = "$PREVIOUS_TREE_SHA"
```

Build the previous application revision:

```bash
make server-prod-build
```

Verify the rolled-back database against the migration contract of that previous revision before starting service:

```bash
make server-migrated-db-verify ENV=production
```

Start and verify:

```bash
make server-prod-up
make server-prod-backend-health
make server-prod-env-caddy-health
make server-prod-smoke
```

Only after these checks pass is service recovery complete.

A later normal deployment may check out the Production branch/target revision again. Do not manually mark the failed migration gate as committed.

## 10. Live migration fails before an armed state is reached

The 33.5 gate automatically attempts to restore the verified pre-migration candidate.

Inspect:

```bash
cat /opt/EnterpriseRemoteSystems/production/recovery/migration-gates/current.state
```

Possible statuses:

```text
rolled_back_after_migration_failure
rollback_failed
failed_first_deployment
```

For `rolled_back_after_migration_failure`, keep services stopped and recover the previous code revision using Section 9.

For `rollback_failed`, treat the database as an unresolved recovery incident. Do not restart application containers. Use the gate's `recovery_backup` path or rematerialize the exact off-host source and follow Section 6.

## 11. Restore fails after destructive recovery begins

`server-sqlite-restore.sh` intentionally leaves the backend stopped.

Do not restart until reviewing:

- selected recovery candidate and manifest;
- restore report (including an `applying` report if the operation failed mid-flight);
- preserved pre-restore DB and sidecars;
- `/app/data/app.db` state;
- backend logs/diagnostics.

Useful commands:

```bash
make server-diagnostics ENV=production
make server-ps ENV=production
```

Re-verify the recovery candidate:

```bash
make server-restore-verify \
  ENV=production \
  RECOVERY_BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/recovery/<candidate>/app-<timestamp>.db
```

If candidate verification fails, select/rematerialize a different known-good restore point. If the candidate verifies, resolve the specific install/configuration failure before retrying restore.

## 12. Recovery evidence to retain

For every Production rehearsal or incident retain, without secrets:

- environment;
- incident/rehearsal start and completion timestamps;
- repository revision/tree;
- selected backup filename and `created_at`;
- backup/manifest SHA-256;
- S3 receipt/object VersionIds when off-host recovery is used;
- recovery candidate path;
- Bite 33.4 restore report;
- Bite 33.5 migration gate state and rollback report when applicable;
- previous/target revision/tree evidence for migration incidents;
- health, integrity, foreign-key, migration-verification results;
- RPO/RTO calculations;
- operator decision/outcome.

Never retain S3 secret keys, JWT secrets, ledger keys, passwords, or API keys in recovery evidence.

## 13. When to stop and escalate

Keep the application stopped and do not improvise if any of these occur:

- exact off-host VersionIds cannot be retrieved;
- backup SHA/manifest verification fails;
- SQLite integrity or foreign-key verification fails;
- the restore report cannot be reconciled with the selected evidence;
- migration rollback status is `rollback_failed`;
- previous compatible code revision cannot be identified/verified;
- recovered DB verifies but the compatible backend cannot become healthy;
- RPO/RTO objective is missed and business acceptance has not been obtained.

The safest state during ambiguity is preserved evidence plus stopped application services, not traffic against an uncertain database/code pairing.
