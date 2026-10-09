# Bite 33.3.1 — Production Backup Machinery Go Cutover

## Purpose

Bite 33.3.1 removes Python from the deployed ERS backup runtime while preserving the Bite 33.2 and 33.3 operator contracts.

The removed Production implementations are:

```text
scripts/ers-backup.py
scripts/ers-offhost-backup.py
```

They are replaced by compiled Go commands:

```text
/app/ers-backup
/app/ers-offhost-backup
```

The implementation is organized under:

```text
backend/internal/backup/
backend/internal/offhost/
backend/cmd/ers-backup/
backend/cmd/ers-offhost-backup/
```

## Preserved operator interfaces

The following commands remain the supported interface:

```bash
make server-backup ENV=development|test|production
make server-backup-verify ENV=<env> BACKUP_FILE=<path>
make server-backup-retention ENV=<env>
make server-offhost-backup ENV=<env> BACKUP_FILE=<path>
make server-offhost-backup-verify ENV=<env> BACKUP_FILE=<path>
```

No operator needs to invoke the Go binaries directly.

## Deployment execution model

The backend Docker build compiles both backup commands with the same Go toolchain used by the ERS backend. Deployed backup Make targets invoke `scripts/run-backup-go-tool.sh`, which runs the compiled command in a one-off container from the newly built backend service image.

This deliberately avoids both of these Production host dependencies:

```text
python3
Go compiler / go run
```

The one-off utility container bind-mounts only the selected deployed environment read/write at the same absolute path. Referenced SSH/S3 credential/config files that live outside that environment are mounted individually read-only. This preserves the existing absolute-path contract without granting the backup utility write access to every ERS environment.

Bite 33.3.2 reuses this Go command boundary for Hetzner S3 in Production. `openssh-client` remains only for optional Development/Test SSH compatibility; Production off-host backup uses the compiled Go S3 implementation and does not require Python or AWS CLI.

## Behavior preserved from Bite 33.2

The Go backup command preserves:

- explicit environment normalization;
- required canonical-table verification;
- `PRAGMA integrity_check`;
- `PRAGMA foreign_key_check`;
- schema migration count/latest migration evidence;
- representative record counts;
- backup size and SHA-256 evidence;
- atomic JSON manifest writes;
- independent re-verification after manifest creation;
- fail-closed retention verification before any deletion;
- minimum-count plus age-window retention semantics.

## Behavior preserved from Bite 33.3

The Go off-host command preserves the transport-independent contract: verified local source pair, round-trip re-download, full Bite 33.2 verification, SHA-256 equality, local/remote receipt evidence, and tamper detection. Bite 33.3.2 selects Hetzner S3 as the mandatory Production transport while retaining SSH only for Development/Test compatibility.

## Tests

The existing Bite 33.2 and 33.3 regression entry points remain:

```bash
make backup-creation-retention-verification-check
make off-host-backup-protection-check
```

Their Python files are test harnesses only. They compile the Go commands and exercise the binaries as black boxes. Repository contract checks reject reintroduction of the removed Production Python tools.
