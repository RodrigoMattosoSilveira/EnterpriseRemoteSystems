# Bite 33.6 — Recovery Rehearsal and Operational Runbook

## Purpose

Bite 33.6 closes Bite 33 by turning the backup, off-host, restore, and migration-recovery mechanisms from Bites 33.2–33.5 into a repeatable operational recovery practice.

It adds:

- a non-destructive server recovery rehearsal that can start from a verified local backup, a surviving off-host receipt, or only the managed S3 backup filename after host loss;
- evidence that the selected restore point can be materialized, restored, migrated to the current schema, and booted by the current backend revision without touching the live SQLite database;
- explicit default recovery objectives of **RPO <= 24 hours** and **RTO <= 4 hours** for the selected restore point;
- revision/tree evidence in the migration recovery gate so a database rollback identifies the pre-deployment code revision that can be deliberately rebuilt and restarted;
- repository revision/tree evidence in every new verified backup manifest so complete host loss still identifies the application revision compatible with the selected restore point;
- a committed non-secret recovery-access locator manifest at `ops/recovery-access.production.env`;
- an owner-unavailable Production preflight/rehearsal that requires shared LastPass/GitHub/Hetzner/DNS access independent of the primary owner;
- a single canonical operator runbook in `docs/database-recovery-runbook.md`, including the owner-unavailable access package; the machine-readable locator contract remains `ops/recovery-access.production.env`.


## Owner-unavailable recovery readiness

The Production readiness use case is stricter than ordinary database recovery:

> A qualified designated technician, with the system owner completely unavailable, can recover ERS and prove the recovery using only documented shared administrative sources.

The non-secret locator contract is `ops/recovery-access.production.env`. It standardizes the shared LastPass collection `ERS-Recovery`, GitHub repository source, Hetzner Object Storage identity, DNS/host/MFA source locators, and canonical install paths. Secret values are never committed.

Run the artifact/access preflight with:

```bash
make server-owner-unavailable-recovery-preflight ENV=production
```

Quarterly, a designated technician other than the primary owner should run the strongest host-loss rehearsal:

```bash
make server-owner-unavailable-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME=app-<timestamp>.db \
  RECOVERY_TECHNICIAN_ID=<technician-identity> \
  RECOVERY_SHARED_ACCESS_CONFIRM=OWNER-UNAVAILABLE-RECOVERY-ACCESS-CONFIRMED
```

This mode refuses local backup/receipt input, requires the shared-access preflight, and requires the selected backup manifest to identify a compatible Git revision/tree that can be resolved from the shared GitHub repository. If the technician must contact the owner for a password, MFA approval, file, key, hostname, or decision, the rehearsal fails.

## Recovery rehearsal

Run exactly one source through:

```bash
make server-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME=app-<timestamp>.db
```

or:

```bash
make server-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_RECEIPT_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-<timestamp>.db.offhost.json
```

or:

```bash
make server-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-<timestamp>.db
```

The off-host backup-name path is the strongest host-loss rehearsal because it does not depend on the original application host retaining the local `.offhost.json` receipt.

The rehearsal refuses to run while a Bite 33.5 migration/deployment recovery gate is still `armed`.

## Non-destructive execution contract

A rehearsal writes only under:

```text
<environment>/recovery/rehearsals/rehearsal-<UTC>/
```

It does not call `server-restore-apply` against the live database and does not stop the deployed application.

The sequence is:

1. stage a verified local Bite 33.2 backup, or materialize exact off-host evidence through Bite 33.3;
2. run the Bite 33.4 recovery-candidate verifier;
3. restore the candidate into a scratch `restored.db` using the same Go restore implementation used for real recovery;
4. prove the restored SHA-256 equals the source manifest;
5. copy that raw recovered DB to `migrated.db`;
6. run the current repository migration chain against that copy;
7. run the full migrated-database verifier;
8. copy the current-schema DB into a disposable `boot-data/app.db` directory;
9. start a one-off backend container with that scratch directory mounted at `/rehearsal-data`, `DATABASE_PATH=/rehearsal-data/app.db`, and `APP_AUTO_MIGRATE=false`;
10. require `/healthz`, `PRAGMA integrity_check = ok`, and a clean `PRAGMA foreign_key_check`;
11. remove the disposable backend container;
12. write `rehearsal.json` evidence.

The live `backend-data` SQLite file is never used as the rehearsal database.

## RPO and RTO evidence

Defaults:

```text
RECOVERY_REHEARSAL_MAX_RPO_SECONDS=86400   # 24 hours
RECOVERY_REHEARSAL_MAX_RTO_SECONDS=14400   # 4 hours
```

RPO evidence is the age of the **selected backup** at rehearsal start. To use the result as an operational RPO proof, select the newest verified restore point that would actually be chosen during an incident.

RTO evidence measures from rehearsal start until:

- the selected evidence has been recovered;
- the recovered database has been migrated/verified against the current repository;
- an isolated backend using that recovered database becomes healthy;
- post-boot SQLite integrity and foreign-key checks pass.

The thresholds can be overridden explicitly for a rehearsal, but changing them does not change the underlying recovery artifacts.

If recovery mechanics pass but either objective is exceeded, the report status is `objective_failed` and the command exits non-zero.

## Rehearsal evidence

The JSON evidence includes:

- selected environment;
- repository revision and tree SHA;
- source kind (`local-backup`, `offhost-receipt`, or `offhost-backup-name`);
- backup filename, creation timestamp, SHA-256, and compatible repository revision/tree when recorded;
- materialized receipt and exact S3 database/manifest object keys and VersionIds when available;
- raw scratch restore path/SHA-256 and Bite 33.4 restore report;
- current-schema migrated scratch path/SHA-256;
- expected final migration;
- isolated backend health result;
- post-boot SQLite integrity/foreign-key result;
- RPO/RTO seconds, thresholds, and pass/fail result.

Secrets are not written to the report.

## Migration rollback revision evidence

Bite 33.5 recovery state now also preserves:

```text
previous_revision=
previous_tree_sha=
target_revision=
target_tree_sha=
```

The deployment workflow captures the currently deployed server revision before checking out the target revision and supplies both identities to the migration gate.

If the gate later rolls the database back and intentionally leaves the application stopped, the operator therefore has explicit evidence for the code revision that preceded the failed deployment. The exact code-revision recovery procedure is documented in `docs/database-recovery-runbook.md`.

## Automated regression

Run:

```bash
make recovery-rehearsal-operational-runbook-check
```

The regression verifies the rehearsal safety/orchestration contract, RPO/RTO defaults, exact-version host-loss recovery path, isolated backend boot contract, migration-gate revision evidence, backup-compatible revision evidence, explicit shared-source recovery access, owner-unavailable preflight/rehearsal commands, runbook command coverage, CI wiring, and deployment quality-gate wiring.

Run the additional owner-unavailable contract regression with:

```bash
make owner-unavailable-recovery-readiness-check
```

It is included in `make local-check`, the containerized local check, CI, and the deployment quality gate.

## Bite 33.6.8 final integrated acceptance

For the exact-release, two-human-administrator, 1Password custody, off-host rehearsal, and RPO/RTO *evidence-consistency* checks, see [Bite 33.6.8 integrated acceptance](bite-3368/implementation-and-architecture.md) and its [manual acceptance procedure](bite-3368/manual-acceptance-tests.md). These do **not** replace the existing operational recovery script. Historical owner-unavailable/LastPass examples in this Bite 33.6 document are not evidence of 1Password access under the accepted two-human launch model; the discrepancy requires documented operational reconciliation before final Production approval. Deferred Gate C is not a launch condition.
