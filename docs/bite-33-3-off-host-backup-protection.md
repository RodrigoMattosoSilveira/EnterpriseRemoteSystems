# Bite 33.3 — Off-Host Backup Protection

## Purpose

Bite 33.3 ensures a verified Bite 33.2 backup is not protected only by the same ERS deployment host. Bite 33.3.2 makes Hetzner Object Storage, accessed through its S3-compatible API, the required Production off-host transport.

A successful Production `make server-backup ENV=production` means:

1. Bite 33.2 creates and verifies the local SQLite backup/manifest pair;
2. ERS uploads that exact pair to the configured Hetzner Object Storage bucket;
3. each upload must return a non-null S3 `VersionId`;
4. ERS downloads those exact database and manifest versions into an isolated temporary directory;
5. the complete Bite 33.2 verification contract runs against the downloaded copy;
6. database and manifest SHA-256 values must match the original verified local pair;
7. ERS writes a local off-host receipt containing the exact S3 object keys and `VersionId`s and uploads the same receipt to Object Storage;
8. any replication/verification failure makes the overall backup command fail while preserving the already verified local backup.

## Production configuration

Production requires:

```ini
SERVER_OFFHOST_BACKUP_ENABLED=true
SERVER_OFFHOST_BACKUP_TRANSPORT=s3
SERVER_OFFHOST_BACKUP_S3_ENDPOINT=https://hel1.your-objectstorage.com
SERVER_OFFHOST_BACKUP_S3_REGION=hel1
SERVER_OFFHOST_BACKUP_S3_BUCKET=<ers-backup-bucket>
SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups
AWS_SHARED_CREDENTIALS_FILE=/opt/EnterpriseRemoteSystems/secrets/aws-credentials
AWS_PROFILE=ers-backup
```

Supported Hetzner Object Storage regions are `fsn1`, `nbg1`, and `hel1`. Production validation requires the HTTPS endpoint to match the selected region exactly.

The credentials file lives on the deployment host outside source control and is mounted read-only into the one-off backup utility container. The Go implementation reads the named AWS-compatible credentials profile directly; neither Python nor AWS CLI is required in Production.

Development and Test default to off-host replication disabled. They may explicitly enable either the S3 transport or the legacy SSH transport for deterministic/local testing. Production cannot select SSH.

## S3 object layout

For a managed backup:

```text
app-20261009T220000Z.db
app-20261009T220000Z.db.manifest.json
```

with `SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups`, Production stores:

```text
ers-backups/
  production/
    app-20261009T220000Z.db/
      app-20261009T220000Z.db
      app-20261009T220000Z.db.manifest.json
      app-20261009T220000Z.db.offhost.json
```

The receipt records the exact database and manifest `VersionId`s. Later verification retrieves those exact versions, never merely the current/latest object at the key.

## Receipt evidence

After round-trip verification, ERS creates:

```text
<local-backup>.offhost.json
```

The S3 receipt records:

- environment and replication UTC timestamp;
- transport (`s3`);
- endpoint, region, bucket, and prefix;
- database object key, exact `VersionId`, size, and SHA-256;
- manifest object key, exact `VersionId`, and SHA-256;
- remote receipt object key;
- verification method.

The receipt contains no S3 access key or secret key.

## Retry behavior

If a local S3 receipt already exists for the same source backup and manifest, ERS does not upload replacement database or manifest versions. It re-downloads and verifies the exact versions recorded in the receipt. This makes operator retries idempotent for an already accepted backup pair.

If an upload fails before a verified receipt exists, Object Storage may contain incomplete/orphaned object versions. They are not accepted as recovery evidence because no verified receipt points to them. With Object Lock enabled, ERS does not attempt destructive cleanup of protected versions.

## Operator commands

```bash
make server-backup ENV=production
```

```bash
make server-offhost-backup \
  ENV=production \
  BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db
```

```bash
make server-offhost-backup-verify \
  ENV=production \
  BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db
```

Production aliases remain available.

## Failure behavior

If local Bite 33.2 backup creation fails, no S3 action starts.

If configuration, S3 authentication/signing, upload, exact-version retrieval, checksum comparison, or full SQLite verification fails:

- the verified local backup remains intact;
- the overall backup command exits non-zero;
- no local verified off-host receipt is published for a newly failed replication;
- already accepted exact S3 versions are never silently replaced during retry.

Off-host replication does not prune remote replicas in Bite 33.3. Object Storage retention/version lifecycle policy remains an explicit operational concern separate from local Bite 33.2 retention.

## Automated regression

Run:

```bash
make off-host-backup-protection-check
```

The regression builds the Go backup utilities and exercises an in-process S3-compatible test endpoint. It verifies:

- SigV4-authenticated PUT and exact-version GET requests;
- database + manifest upload and non-null `VersionId` capture;
- round-trip re-download and full Bite 33.2 verification;
- receipt object/version/checksum evidence;
- verification with the local backup pair temporarily unavailable;
- idempotent retry without replacement database/manifest versions;
- exact-version tamper detection;
- Production refusal when off-host protection is disabled;
- Production refusal of SSH transport;
- Production Hetzner endpoint/region matching and HTTPS enforcement;
- Makefile, initialization, CI, and deployment integration.

The check is included in `make local-check`, CI, and the deployment quality gate.

## Production implementation language

All Production backup/off-host behavior remains compiled Go. Python is used only by regression/test harnesses. The Production S3 client uses AWS Signature Version 4 over Go's standard HTTP/crypto libraries and therefore does not add an AWS CLI dependency to the Production runtime.
