#!/usr/bin/env bash
# Explicit, one-time OFFLINE enrollment of exactly two independent TRN human admins.
# No E2E identity, no SQL console, no password files or secret logging.
set -euo pipefail
umask 077
ROOT=/opt/EnterpriseRemoteSystems/training
[[ "$(pwd -P)" == "$ROOT" ]] || { echo 'BLOCKED: run only from the canonical TRN checkout on Hetzner' >&2; exit 2; }
[[ -t 0 ]] || { echo 'BLOCKED: administrator input requires an interactive terminal' >&2; exit 2; }
[[ "${TRN_ENROLL_CONFIRM:-}" == ENROLL-TRAINING-HUMANS-OFFLINE ]] || { echo 'BLOCKED: explicit TRN enrollment confirmation missing' >&2; exit 2; }
[[ "${TRN_ENROLL_APPROVAL:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{5,119}$ ]] || { echo 'BLOCKED: approval reference missing or invalid' >&2; exit 2; }
[[ "${TRN_ENROLL_OPERATOR:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]{5,119}$ ]] || { echo 'BLOCKED: operator reference missing or invalid' >&2; exit 2; }
[[ -n "${TRN_ENROLL_BACKUP_FILE:-}" ]] || { echo 'BLOCKED: verified TRN backup path required' >&2; exit 2; }
[[ "$TRN_ENROLL_BACKUP_FILE" == "$ROOT"/backups/app-*.db ]] || { echo 'BLOCKED: backup path must be an exact TRN backup file' >&2; exit 2; }
[[ -f "$TRN_ENROLL_BACKUP_FILE" && -f "$TRN_ENROLL_BACKUP_FILE.manifest.json" && -f "$TRN_ENROLL_BACKUP_FILE.offhost.json" ]] || { echo 'BLOCKED: TRN verified backup/manifest/off-host receipt missing' >&2; exit 2; }
make server-environment-contract-check ENV=training
make server-backup-verify ENV=training BACKUP_FILE="$TRN_ENROLL_BACKUP_FILE"
make server-offhost-backup-verify ENV=training BACKUP_FILE="$TRN_ENROLL_BACKUP_FILE"

compose=(docker compose -p ers-trn --env-file .env.training -f docker-compose.server.yml -f docker-compose.training.yml)
# Require only our three known services running in the exact TRN Compose project.
while IFS= read -r name; do
  case "$name" in ers-trn-backend|ers-trn-frontend|ers-trn-caddy) ;;
    *) echo "BLOCKED: an unexpected TRN writer/container is running: $name" >&2; exit 2 ;;
  esac
done < <(docker ps --filter label=com.docker.compose.project=ers-trn --format '{{.Names}}')
[[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' ers-trn-backend)" == ers-trn ]] || { echo 'BLOCKED: TRN backend Compose ownership mismatch' >&2; exit 2; }
[[ "$(docker inspect --format '{{.State.Running}}' ers-trn-backend)" == true ]] || { echo 'BLOCKED: TRN backend must be running to enter verified offline enrollment' >&2; exit 2; }

echo 'Stopping ONLY ers-trn-backend for offline administrator enrollment.'
"${compose[@]}" stop backend
if [[ "$(docker inspect --format '{{.State.Running}}' ers-trn-backend)" != false ]]; then
  echo 'BLOCKED: cannot confirm TRN backend is stopped' >&2
  exit 2
fi

# The source helper obtains both credentials interactively. The pipe passes
# JSON directly to the ephemeral image process, never to a file or shell args.
# Any failure leaves TRN backend stopped for investigation (fail closed).
if ! python3 -B scripts/ers-two-human-admin-input.py | "${compose[@]}" run --rm --no-deps -T \
  --entrypoint /app/enroll-human-admins backend \
  --db /app/data/app.db --environment training \
  --approval-reference "$TRN_ENROLL_APPROVAL" \
  --operator-reference "$TRN_ENROLL_OPERATOR" \
  --backup-evidence-reference "$(basename "$TRN_ENROLL_BACKUP_FILE").offhost.json" \
  --offline-confirmed; then
  echo 'STOP: enrollment failed. TRN backend remains stopped; inspect without resetting data.' >&2
  exit 1
fi

"${compose[@]}" start backend
make server-backend-health ENV=training
make server-backup ENV=training
printf '%s\n' 'PASS: two individually controlled TRN administrators enrolled; passwords not displayed or saved.'
