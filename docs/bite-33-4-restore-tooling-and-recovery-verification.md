# Bite 33.4 — Restore Tooling and Recovery Verification

## Purpose

Bite 33.4 turns the verified backup artifacts from Bite 33.2 and the exact-version off-host evidence from Bite 33.3 into an explicit, fail-closed recovery workflow.

The restore path is intentionally split into two phases:

1. **Prepare/materialize and verify a recovery candidate.**
2. **Apply only that verified candidate to the selected deployed SQLite volume under an explicit environment-specific confirmation gate.**

Production backup, off-host recovery materialization, restore application, and restore verification remain compiled Go. Python is used only by regression harnesses.

## Recovery candidates

A restore may begin from either:

- a verified local Bite 33.2 backup pair; or
- a Bite 33.3 off-host receipt whose exact S3 database and manifest `VersionId`s can be retrieved and re-verified.

A local source is staged with:

```bash
make server-restore-prepare-local \
  ENV=production \
  BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-<timestamp>.db
```

An off-host source can be materialized from a surviving local receipt:

```bash
make server-restore-materialize-offhost \
  ENV=production \
  RECEIPT_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-<timestamp>.db.offhost.json
```

If the application host and its local receipt are lost, S3 recovery can instead bootstrap from the managed backup filename visible in Hetzner Object Storage:

```bash
make server-restore-materialize-offhost \
  ENV=production \
  OFFHOST_BACKUP_NAME=app-<timestamp>.db
```

The bootstrap path retrieves the protected receipt object from the configured S3 bucket/prefix, records the receipt object's `VersionId`, validates the receipt environment/transport/object-key contract, and then downloads and verifies the exact database and manifest `VersionId`s named by that receipt. This avoids making a surviving local `.offhost.json` file a hidden disaster-recovery dependency.

Both operations write a verified pair under the selected environment's:

```text
recovery/
```

directory while preserving the managed backup filename required by the 33.2 manifest contract.

For S3, materialization downloads the exact database and manifest versions recorded in the receipt; it does not substitute the current/latest object version.

## Verification before apply

Before touching the live database, operators can re-run:

```bash
make server-restore-verify \
  ENV=production \
  RECOVERY_BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/recovery/<candidate>/app-<timestamp>.db
```

Verification reuses the full Bite 33.2 contract:

- manifest status and environment identity;
- file size and SHA-256;
- `PRAGMA integrity_check`;
- `PRAGMA foreign_key_check`;
- required canonical ERS tables;
- schema migration count/latest migration evidence;
- representative record counts.

## Apply safety contract

Restore application is deliberately destructive and requires an exact confirmation token:

```text
ENV=development → RESTORE-DEVELOPMENT
ENV=test        → RESTORE-TEST
ENV=production  → RESTORE-PRODUCTION
```

For example:

```bash
make server-restore-apply \
  ENV=production \
  RECOVERY_BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/recovery/<candidate>/app-<timestamp>.db \
  RESTORE_CONFIRM=RESTORE-PRODUCTION
```

The server target refuses candidates outside the selected environment's `recovery/` directory.

If the backend is running, the workflow first creates a fresh verified Bite 33.2 backup of the current live database. In Production this also exercises the configured Bite 33.3 off-host protection before the restore continues.

The backend is then stopped before SQLite replacement. The Go restore utility:

1. re-verifies the recovery pair;
2. preserves the current `/app/data/app.db` to `recovery/pre-restore/` when it exists;
3. stages the replacement in the live database directory;
4. re-verifies the staged copy against the source manifest;
5. removes stale `-wal`, `-shm`, and `-journal` sidecars;
6. atomically renames the staged database into `/app/data/app.db`;
7. re-verifies the installed database;
8. writes a structured recovery report under `recovery/reports/`.

The previous-target copy is intentionally preserved even if it cannot pass the 33.2 verification contract. This allows recovery from a damaged database while retaining forensic evidence of the pre-restore state.

## Post-restart verification

After replacement, the server workflow starts the backend and waits for `/healthz` to recover. It then independently runs:

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

against the live `/app/data/app.db`.

A restore that installs successfully but cannot recover backend health exits non-zero and preserves both the restore report and the pre-restore database copy for investigation.

## Recovery report

A successful apply writes JSON evidence containing:

- environment;
- source backup filename and SHA-256;
- source manifest filename and SHA-256;
- whether a previous target existed;
- preserved previous-target path and SHA-256;
- installed target path, size, and SHA-256;
- SQLite integrity/foreign-key result;
- schema migration count/latest migration;
- representative ERS record counts;
- UTC application timestamp.

The report contains no application passwords or S3 secret credentials.

## Migration boundary

Bite 33.4 restores the exact verified database state represented by the selected backup. It does **not** automatically migrate an older backup to the current application schema.

Migration/deployment recovery gates belong to Bite 33.5. If a restored database is not compatible with the currently deployed application image, the post-restart health gate will fail rather than silently mutating the restored evidence.

## Automated regression

Run:

```bash
make restore-tooling-recovery-verification-check
```

The regression builds the Go backup and restore commands and verifies:

- local recovery-candidate verification;
- environment mismatch refusal;
- safe candidate staging with byte-for-byte preservation;
- staging overwrite refusal;
- environment-specific confirmation refusal;
- preservation of the pre-restore target;
- stale SQLite sidecar removal;
- atomic replacement result matching the source SHA-256;
- post-install full database verification;
- structured restore report evidence;
- source-equals-target refusal;
- repository/Docker/Make/server orchestration integration.

Bite 33.3 regression coverage additionally verifies exact-version S3 recovery materialization, overwrite refusal, and recovery bootstrap by managed backup filename when the local receipt is unavailable.

The 33.4 regression is included in `make local-check`, the containerized local check, CI, and the deployment quality gate.
