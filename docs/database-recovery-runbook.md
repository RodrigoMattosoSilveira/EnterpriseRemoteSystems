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

## Owner-unavailable recovery contract

Production recovery must be executable by a qualified designated technician while the system owner is completely unavailable. No recovery step may depend on the owner's memory, laptop, phone, personal password vault, or approval of an MFA prompt.

The non-secret authoritative locator inventory is committed at:

```text
ops/recovery-access.production.env
```

This runbook is the **single canonical human-readable recovery document**. The machine-readable non-secret locator contract remains `ops/recovery-access.production.env`. The canonical shared secret collection is `ERS-Recovery` in LastPass. The exact required source locators are:

```text
lastpass-shared://ERS-Recovery/Production/.env.production
lastpass-shared://ERS-Recovery/Production/Hetzner-S3-ers-backup
lastpass-shared://ERS-Recovery/Production/Host-SSH
lastpass-shared://ERS-Recovery/Infrastructure/Hetzner-Console
lastpass-shared://ERS-Recovery/Infrastructure/DNS
technician-controlled://independent-mfa-and-recovery-codes
```

Repository/edge configuration is recovered from the shared GitHub repository, not from the failed host. GitHub Actions secrets are not an authoritative recovery source because secret values cannot be read back by an operator; the recoverable SSH/account material must exist in the shared LastPass collection.

A database backup does not contain `.env.production`, S3 credentials, SSH credentials, DNS/provider credentials, or MFA recovery material. Those prerequisites must be retrieved from the exact shared sources above. **Do not generate replacement Production secrets with `init-server-env.sh` and call that recovery.**

Before any owner-unavailable recovery or rehearsal, run:

```bash
make server-owner-unavailable-recovery-preflight ENV=production
```

The preflight validates the recovered canonical Production environment, shared S3 credential installation, repository identity, edge source files, and the explicit shared-source locator contract. If the technician has to contact the system owner, the owner-unavailable rehearsal fails.

### Owner-unavailable recovery access package

#### Operational standard

ERS Production recovery must not depend on the system owner being awake, reachable, or able to approve an MFA prompt.

The operational standard is:

> A qualified designated technician, using only this runbook, pre-authorized designated-technician GitHub access, the shared LastPass recovery collection, pre-authorized Hetzner project access, and DNS administrative access, can recover the Production database and prove the recovered service without information held only in the owner's memory, computer, phone, or personal password vault.

No personal vault, owner-only MFA device, owner-only SSH key, or undocumented credential source satisfies this requirement.

#### Canonical non-secret locator manifest

The repository contains:

```text
ops/recovery-access.production.env
```

It contains **no secret values**. It defines the exact authoritative locator for every recovery prerequisite. The canonical shared collection name is:

```text
ERS-Recovery
```

The required LastPass/shared-access items are:

```text
lastpass-shared://ERS-Recovery/Production/.env.production
lastpass-shared://ERS-Recovery/Production/Hetzner-S3-ers-backup
lastpass-shared://ERS-Recovery/Production/Host-SSH
lastpass-shared://ERS-Recovery/Infrastructure/Hetzner-Console
lastpass-shared://ERS-Recovery/Infrastructure/DNS
technician-controlled://independent-mfa-and-recovery-codes
```

The shared items may contain the corresponding secret/file/account material, but the Git repository manifest must never contain those values.

#### Required content of each shared source

| Locator | Required content | Installed/used as |
|---|---|---|
| `Production/.env.production` | Canonical current Production environment file, including current JWT/auth/application/S3 configuration | `/opt/EnterpriseRemoteSystems/production/.env.production`, mode 600 |
| `Production/Hetzner-S3-ers-backup` | Hetzner Object Storage S3 access key and secret for profile `ers-backup` | `/opt/EnterpriseRemoteSystems/secrets/aws-credentials`, mode 600 |
| `Production/Host-SSH` | Host SSH login material or documented replacement-host SSH bootstrap material | technician SSH access |
| `Infrastructure/Hetzner-Console` | Shared organizational Hetzner Console account/access procedure and ERS project identity | replacement-host provisioning and Object Storage inspection |
| `Infrastructure/DNS` | Shared organizational DNS provider account/access procedure for `enterpriseremotesystems.com` | DNS recovery/change |
| `technician-controlled://independent-mfa-and-recovery-codes` | Each designated technician maintains their own independent MFA/recovery capability for their individual LastPass/GitHub/provider account access | access continuity without owner approval |

Repository and edge configuration come from the shared GitHub repository:

```text
git@github.com:RodrigoMattosoSilveira/EnterpriseRemoteSystems.git
```

The edge source of truth is:

```text
edge/Caddyfile
edge/docker-compose.edge.yml
```

GitHub Actions secrets such as `DEPLOY_SSH_PRIVATE_KEY` are deployment inputs and are intentionally not readable back from GitHub. They are **not** an authoritative disaster-recovery source. The corresponding recoverable SSH material must exist in the shared LastPass recovery collection.

#### Canonical Production Object Storage identity

```text
Endpoint: https://hel1.your-objectstorage.com
Region:   hel1
Bucket:   ers
Profile:  ers-backup
Domain:   app.enterpriseremotesystems.com
```

The active object prefix is read from the recovered canonical `.env.production`. Do not guess it.

#### Required access policy

At least two qualified designated technicians should have independent access to the `ERS-Recovery` shared collection and pre-authorized GitHub/Hetzner/DNS access required by this runbook. Each technician must use an individual account where the provider supports it and maintain MFA/recovery material outside the shared vault they are trying to unlock; do not create a circular dependency where LastPass recovery material exists only inside LastPass.

Access must satisfy both rules encoded in the repository manifest:

```text
RECOVERY_SHARED_ACCESS_POLICY=technician-access-independent-of-owner
RECOVERY_MFA_POLICY=must-not-depend-on-owner-device-or-approval
```

If a technician must call, message, or wake the owner to obtain a password, MFA approval, file, hostname, key, account identity, or recovery decision, owner-unavailable readiness has failed.

#### Configuration-change discipline

Whenever `.env.production` changes, the canonical shared LastPass `Production/.env.production` item must be replaced with the deployed version as part of the same operational change. Do not treat `scripts/init-server-env.sh` or `scripts/init-prod-env.sh` as a backup of Production configuration; those initializers can generate/default values and cannot reconstruct the deployed secrets.

Whenever host SSH credentials, Hetzner access, or DNS access changes, update the corresponding `ERS-Recovery` item before closing the change. Whenever a technician's MFA/recovery capability changes, that technician must restore independent access before the recovery-readiness change is considered complete.

#### Quarterly owner-unavailable access rehearsal

At least quarterly, and after any administrator/access-provider change, a designated technician other than the primary system owner should perform the owner-unavailable recovery rehearsal from a clean operator workstation or replacement-host context.

The rehearsal is non-destructive to the live Production database:

```bash
make server-owner-unavailable-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME=app-<timestamp>.db \
  RECOVERY_TECHNICIAN_ID=<technician-identity> \
  RECOVERY_SHARED_ACCESS_CONFIRM=OWNER-UNAVAILABLE-RECOVERY-ACCESS-CONFIRMED
```

The designated technician must obtain the Production environment file and S3 credential material from the documented shared sources before setting the confirmation token.

The resulting `rehearsal.json` must record:

- `owner_unavailable.mode = true`;
- technician identity;
- shared-access confirmation;
- SHA-256 of the non-secret access manifest;
- source locators used;
- exact S3 database/manifest VersionIds;
- backup-compatible repository revision/tree;
- proof that the compatible revision can be resolved from Git;
- isolated backend health;
- SQLite integrity/foreign-key verification;
- RPO/RTO results.

A quarterly rehearsal is **failed** if any prerequisite comes from the owner's personal vault/device/memory, any shared source is inaccessible, the backup lacks compatible revision/tree evidence, or the technician needs owner assistance.

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

For the quarterly owner-unavailable readiness proof, a designated technician other than the primary owner must use the host-loss source mode and the shared-access confirmation:

```bash
make server-owner-unavailable-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME=app-<timestamp>.db \
  RECOVERY_TECHNICIAN_ID=<technician-identity> \
  RECOVERY_SHARED_ACCESS_CONFIRM=OWNER-UNAVAILABLE-RECOVERY-ACCESS-CONFIRMED
```

This mode refuses local backup/receipt input, requires the shared-access preflight, bootstraps the remote receipt from Hetzner, and requires the selected backup manifest to contain a Git-compatible application revision/tree that can be resolved from the shared GitHub repository.

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

For owner-unavailable evidence also require:

- `owner_unavailable.mode = true`;
- `owner_unavailable.shared_access_confirmed = true`;
- technician identity is recorded;
- access-manifest SHA-256 and explicit source locators are recorded;
- `.source.repository_revision` and `.source.repository_tree_sha` are full Git object IDs;
- `.source.compatible_revision_available = true`.

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

### 7.1 Rebuild prerequisites from the documented shared sources

Assume the old host and all of `/opt/EnterpriseRemoteSystems` are gone. The technician must not use a file from the owner's workstation or personal vault.

1. Use the shared GitHub organizational account/access path to clone:

```bash
sudo mkdir -p /opt/EnterpriseRemoteSystems
sudo chown "$USER" /opt/EnterpriseRemoteSystems
git clone git@github.com:RodrigoMattosoSilveira/EnterpriseRemoteSystems.git \
  /opt/EnterpriseRemoteSystems/production
cd /opt/EnterpriseRemoteSystems/production
git fetch origin --prune
```

2. From `lastpass-shared://ERS-Recovery/Production/.env.production`, retrieve the canonical current `.env.production` file and install it exactly at:

```text
/opt/EnterpriseRemoteSystems/production/.env.production
```

Set mode `600`. Do **not** run `init-server-env.sh` as a substitute for retrieving the canonical Production configuration.

3. From `lastpass-shared://ERS-Recovery/Production/Hetzner-S3-ers-backup`, install the S3 credential file at:

```text
/opt/EnterpriseRemoteSystems/secrets/aws-credentials
```

Set mode `600`; it must contain profile `[ers-backup]`.

4. Obtain host/replacement-host access from `lastpass-shared://ERS-Recovery/Production/Host-SSH`, pre-authorized Hetzner project access from `lastpass-shared://ERS-Recovery/Infrastructure/Hetzner-Console`, and DNS access from `lastpass-shared://ERS-Recovery/Infrastructure/DNS`. Use the technician's own independent MFA/recovery capability documented as `technician-controlled://independent-mfa-and-recovery-codes`; do not depend on the owner's device and do not store the only LastPass recovery factor inside LastPass itself.

5. Verify the recovered prerequisites before touching a database:

```bash
make server-owner-unavailable-recovery-preflight ENV=production
make server-environment-contract-check ENV=production
```

6. Sync/start the repository-managed TLS edge when rebuilding the entire host:

```bash
make edge-init
```

Do not start the application yet. First identify and verify the database-compatible application revision from the selected backup manifest as described below.

### 7.2 Recover using only the managed backup filename and identify compatible code

Using Hetzner organizational access, inspect bucket `ers` under the Production prefix declared by the recovered `.env.production`. Managed objects are grouped as `<prefix>/production/app-<timestamp>.db/...`. Select the newest verified recovery point consistent with the incident and RPO objective; record its managed filename `app-<timestamp>.db`.

Materialize it without any local receipt:

```bash
make server-restore-materialize-offhost \
  ENV=production \
  OFFHOST_BACKUP_NAME=app-<timestamp>.db
```

This fetches the protected remote receipt, records its receipt VersionId, then downloads the exact DB and manifest VersionIds named by that receipt. Never substitute an S3 ETag for SHA-256 evidence.

Set the materialized manifest path and read the application compatibility evidence:

```bash
MANIFEST=/opt/EnterpriseRemoteSystems/production/recovery/<candidate>/app-<timestamp>.db.manifest.json
BACKUP_REVISION="$(jq -er '.repository.revision' "$MANIFEST")"
BACKUP_TREE_SHA="$(jq -er '.repository.tree_sha' "$MANIFEST")"

git fetch origin --prune
git cat-file -e "${BACKUP_REVISION}^{commit}"
test "$(git rev-parse "${BACKUP_REVISION}^{tree}")" = "$BACKUP_TREE_SHA"
```

If either repository field is absent, not a full Git object ID, unavailable from GitHub, or does not match the recorded tree, **stop and escalate**. Owner-unavailable recovery is not proven for that restore point. New Bite 33.6 backups record these fields automatically.

Switch to the exact compatible application revision before build/restore:

```bash
git checkout --detach "$BACKUP_REVISION"
test "$(git rev-parse HEAD)" = "$BACKUP_REVISION"
test "$(git rev-parse HEAD^{tree})" = "$BACKUP_TREE_SHA"
make server-prod-build
```

Verify and apply as in Sections 6.3–6.4. The restore now starts the application revision explicitly recorded as compatible with that backup. After service recovery is accepted, return to the normal Production deployment process to move forward through the migration/recovery gate.

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

Stop and escalate immediately if any owner-unavailable prerequisite can only be obtained from the system owner, an owner-only MFA device, a personal vault, or an undocumented source.

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
