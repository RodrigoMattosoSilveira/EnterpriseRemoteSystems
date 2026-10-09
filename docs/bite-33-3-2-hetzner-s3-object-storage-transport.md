# Bite 33.3.2 — Hetzner S3 Object Storage Transport

## Scope

Bite 33.3.2 makes Hetzner Object Storage the required Production off-host destination for verified ERS database backups while preserving the Bite 33.2 and Bite 33.3 operator Make targets.

Production requirements:

- `SERVER_OFFHOST_BACKUP_ENABLED=true`;
- `SERVER_OFFHOST_BACKUP_TRANSPORT=s3`;
- Hetzner region `fsn1`, `nbg1`, or `hel1`;
- region-matching HTTPS `*.your-objectstorage.com` endpoint;
- private bucket configured by the operator;
- Object Lock/Versioning configured operationally on the bucket;
- external AWS-compatible credentials file and named profile.

## Exact-version recovery contract

A backup is accepted off-host only after:

1. local Bite 33.2 verification;
2. S3 upload of the database and manifest;
3. capture of non-null `VersionId`s for both objects;
4. download of those exact versions;
5. database and manifest SHA-256 comparison;
6. full Bite 33.2 verification of the downloaded pair;
7. creation of a receipt containing exact object keys and `VersionId`s;
8. upload of the receipt.

Later `server-offhost-backup-verify` operations use the `VersionId`s from the receipt, not the current/latest objects.

## Compatibility

SSH remains available only for explicitly enabled Development/Test environments. Production environment validation rejects SSH transport.

## Secrets

The S3 secret key is read from `AWS_SHARED_CREDENTIALS_FILE`. It is not copied into the ERS environment file, manifest, or off-host receipt. The deployed Go-tool runner mounts the credentials file individually read-only when it lives outside the selected ERS environment directory.
