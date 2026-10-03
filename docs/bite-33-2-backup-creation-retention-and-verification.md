# Bite 33.2 — Backup Creation, Retention, and Verification

## Purpose

Bite 33.2 turns the existing pre-migration SQLite copy into a reusable, verified backup subsystem for deployed ERS environments.

The Bite covers:

- transactionally consistent SQLite snapshot creation from the running backend;
- discovery of the database path actually configured in the backend container;
- verification before and after the snapshot leaves the container;
- a durable JSON manifest beside each managed backup;
- independent re-verification of a retained backup;
- configurable retention that never intentionally removes every verified backup;
- explicit CI/deployment regression coverage.

Off-host replication is implemented by Bite 33.3. The verified 33.2 pair is the source artifact that 33.3 replicates and re-verifies outside the application host.

## Managed backup pair

A successful managed backup consists of two files in the environment's `backups/` directory:

```text
app-YYYYMMDDTHHMMSSZ.db
app-YYYYMMDDTHHMMSSZ.db.manifest.json
```

If more than one backup is created during the same UTC second, a numeric suffix is added rather than overwriting an existing snapshot.

A `.db` file without a valid adjacent manifest is not counted as a 33.2 verified backup. Legacy/unmanaged backup files are not automatically deleted by the retention operation.

## Creation contract

The deployed command remains:

```bash
make server-backup ENV=development|test|production
```

Convenience aliases remain available, including:

```bash
make server-prod-backup
```

When a backend container is running, backup creation:

1. verifies the selected deployed environment identity;
2. asks the running backend container for its actual `DATABASE_PATH`;
3. uses SQLite's online `.backup` operation inside the running container;
4. runs `PRAGMA integrity_check` inside the container snapshot;
5. runs `PRAGMA foreign_key_check` inside the container snapshot;
6. copies the snapshot to the host backup directory through a temporary file;
7. independently opens the copied database read-only with Python's SQLite library;
8. repeats integrity and foreign-key verification;
9. verifies required canonical ERS tables are readable;
10. records migration state and representative core record counts;
11. calculates the backup size and SHA-256;
12. atomically writes the adjacent manifest;
13. re-verifies the backup/manifest pair;
14. applies retention only after the new backup has been accepted.

The backup path is therefore not hard-coded to `/app/data/app.db`; the source path recorded in the manifest is the value actually configured in the running backend container.

If the environment has an existing SQLite Docker volume but the backend container is not running, `server-backup` refuses to guess or copy mutable volume files directly. The environment must be repaired/started or handled through a deliberate offline recovery procedure.

If no SQLite volume exists, `server-backup` reports that no backup is required for that first deployment and exits successfully.

## Verification contract

A retained managed backup can be re-verified independently:

```bash
make server-backup-verify \
  ENV=production \
  BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db
```

Verification fails if any of the following is true:

- the backup file or manifest is missing;
- the manifest format/status is invalid;
- the manifest belongs to a different selected environment;
- file size differs from the manifest;
- SHA-256 differs from the manifest;
- `PRAGMA integrity_check` does not return `ok`;
- `PRAGMA foreign_key_check` returns rows;
- required canonical ERS tables are missing;
- `schema_migrations` is missing/empty;
- latest migration/count differs from the manifest;
- representative core record counts differ from the manifest.

This means existence alone is never sufficient backup evidence.

## Manifest evidence

The JSON manifest records, at minimum:

- manifest format version;
- `status=verified`;
- UTC backup creation time;
- environment (`development`, `test`, or `production`);
- source container;
- configured source database path;
- backup filename;
- file size;
- SHA-256;
- verification timestamp;
- integrity-check result;
- foreign-key-check result;
- required canonical table set;
- schema migration count;
- latest schema migration;
- representative core row counts.

The manifest contains operational metadata, not application credentials or secrets.

## Retention policy

Defaults:

```text
SERVER_BACKUP_RETENTION_COUNT=14
SERVER_BACKUP_RETENTION_DAYS=30
```

The policy means:

> Keep at least the newest 14 verified managed backups, and also keep every verified managed backup created within the last 30 days.

A backup is removed only when it is both:

- older than the configured retention-day window; and
- outside the newest configured minimum-count set.

Both values must be integers greater than or equal to `1`.

They may be overridden per invocation/environment, for example:

```bash
make server-prod-backup \
  SERVER_BACKUP_RETENTION_COUNT=30 \
  SERVER_BACKUP_RETENTION_DAYS=90
```

Retention may also be executed explicitly:

```bash
make server-backup-retention \
  ENV=production \
  SERVER_BACKUP_RETENTION_COUNT=30 \
  SERVER_BACKUP_RETENTION_DAYS=90
```

Before retention deletes anything, every managed backup/manifest pair it considers is re-verified. If any managed pair is corrupted or inconsistent, retention fails before deleting another backup. This is intentionally fail-closed.

The minimum-count rule is never allowed to be zero, so automatic retention cannot intentionally delete every verified backup.

## Failure behavior

A backup is not accepted merely because `docker cp` succeeded.

If creation or verification fails before the managed pair is committed:

- the partial host copy is removed;
- the unaccepted target/manifest are removed;
- temporary container snapshot files are removed;
- the command exits non-zero.

If the new backup has already been independently verified and retention subsequently fails, the new verified backup is preserved and the overall command exits non-zero. This preserves recovery evidence while still requiring operator attention.

## Deployment integration

The existing preserved-database deployment path still invokes:

```bash
make server-backup ENV=<selected-environment>
```

before in-place migration.

Under 33.2 that gate now receives the full verified backup/manifest/retention behavior described above.

## Legacy convenience script

`scripts/prod-backup-sqlite.sh` remains available for operators who already use it, but it now delegates to the same 33.2 implementation. It no longer creates an unverified parallel class of Production backups.

## Automated regression

Run:

```bash
make backup-creation-retention-verification-check
```

The regression verifies:

- manifest creation and independent re-verification;
- SHA/size tamper detection;
- environment mismatch detection;
- schema/record evidence;
- retention minimum-count + age behavior;
- fail-closed retention when a managed backup is corrupted;
- transactionally consistent `.backup` use;
- discovery of configured container `DATABASE_PATH`;
- failed backup cleanup;
- Make/deployment integration;
- legacy Production backup routing through the hardened implementation.

The check is included in `make local-check`, CI, and the deployment quality gate.
