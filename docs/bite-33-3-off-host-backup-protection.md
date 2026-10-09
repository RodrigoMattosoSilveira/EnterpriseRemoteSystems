# Bite 33.3 — Off-Host Backup Protection

## Purpose

Bite 33.3 ensures a verified Bite 33.2 backup is not protected only by the same ERS deployment host. Production backups must be copied to a distinct SSH-accessible host and independently re-downloaded and verified before the off-host copy is accepted.

A successful Production `make server-backup ENV=production` now means:

1. Bite 33.2 creates and verifies the local SQLite backup/manifest pair;
2. ERS transfers that exact pair to the configured off-host SSH destination;
3. the remote pair is published as one backup directory after both files arrive;
4. ERS downloads the remote pair back into an isolated temporary directory;
5. the complete Bite 33.2 verification contract runs against the downloaded copy;
6. its backup and manifest SHA-256 values must match the original verified local pair;
7. ERS writes a local off-host receipt and a copy of that receipt beside the remote replica;
8. any replication/verification failure makes the overall backup command fail while preserving the already verified local backup.

## Production configuration

Production requires these keys in `.env.production`:

```ini
SERVER_OFFHOST_BACKUP_ENABLED=true
SERVER_OFFHOST_BACKUP_HOST=backup-host.example.com
SERVER_OFFHOST_BACKUP_USER=ers-backup
SERVER_OFFHOST_BACKUP_DIRECTORY=/srv/ers-backups
SERVER_OFFHOST_BACKUP_PORT=22
SERVER_OFFHOST_BACKUP_IDENTITY_FILE=/opt/EnterpriseRemoteSystems/secrets/backup-ssh-key
SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE=/opt/EnterpriseRemoteSystems/secrets/backup-known-hosts
```

The SSH private key and pinned `known_hosts` file live on the deployment host and must not be committed to source control. SSH uses batch mode, explicit identity selection, and strict host-key checking. Production build/up contract validation refuses `SERVER_OFFHOST_BACKUP_ENABLED=false` or missing off-host destination settings.

Development and Test default to off-host replication disabled, but may opt in by configuring the same keys.

## Remote layout

For a local managed backup:

```text
app-20261003T220000Z.db
app-20261003T220000Z.db.manifest.json
```

Production stores the off-host replica under:

```text
<SERVER_OFFHOST_BACKUP_DIRECTORY>/production/app-20261003T220000Z.db/
  app-20261003T220000Z.db
  app-20261003T220000Z.db.manifest.json
  app-20261003T220000Z.db.offhost.json
```

The pair is uploaded into a temporary staging directory and the directory is renamed into place only after both backup and manifest have transferred. An existing remote backup directory is never overwritten blindly; it is re-downloaded and must verify against the local pair.

## Receipt evidence

After round-trip verification, ERS creates:

```text
<local-backup>.offhost.json
```

The receipt records:

- environment;
- replication UTC timestamp;
- transport (`ssh`);
- backup SHA-256 and size;
- manifest SHA-256;
- remote host/user/port and directory;
- verification method.

It contains no SSH private key contents or application credentials.

## Operator commands

Create the normal verified backup and, when enabled, protect it off-host:

```bash
make server-backup ENV=production
```

Replicate an already-created verified backup explicitly:

```bash
make server-offhost-backup \
  ENV=production \
  BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db
```

Independently re-download and verify the off-host replica using its local receipt:

```bash
make server-offhost-backup-verify \
  ENV=production \
  BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db
```

Production aliases are also available:

```bash
make server-prod-offhost-backup BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db
make server-prod-offhost-backup-verify BACKUP_FILE=/opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db
```

## Failure behavior

If local Bite 33.2 backup creation fails, no off-host action starts.

If off-host configuration, SSH, transfer, publication, round-trip retrieval, checksum comparison, or full SQLite verification fails:

- the verified local backup remains intact;
- the overall backup command exits non-zero;
- a newly published remote pair that fails round-trip verification is removed rather than left as accepted recovery evidence;
- an existing remote pair that fails verification is not automatically destroyed, preserving evidence for investigation.

Off-host replication does not automatically prune remote replicas in Bite 33.3. That choice is intentionally conservative: local retention must never imply deletion of the only copy outside the application host.

## Automated regression

Run:

```bash
make off-host-backup-protection-check
```

The check uses a fake SSH endpoint and verifies:

- transfer of the verified database + manifest pair;
- round-trip re-download and Bite 33.2 verification;
- backup and manifest checksum equality with the source pair;
- local and remote receipt creation;
- independent later remote verification;
- remote tamper detection;
- Production refusal when off-host protection is disabled;
- Makefile, environment-contract, initialization, CI, and deployment integration.

The check is included in `make local-check`, CI, and the deployment quality gate.


## Production implementation language

Bite 33.3.1 moves off-host configuration, SSH transport, receipt generation, round-trip retrieval, and Bite 33.2 re-verification from `scripts/ers-offhost-backup.py` into the compiled Go command `/app/ers-offhost-backup`. The backend image contains both Go backup commands plus the SSH client required by the current transport. `scripts/run-backup-go-tool.sh` launches the compiled commands from the newly built backend image for deployed environments; Python remains only in regression/test harnesses and is not part of the Production backup runtime.
