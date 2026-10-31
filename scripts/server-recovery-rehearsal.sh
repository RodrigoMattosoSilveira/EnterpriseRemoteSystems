#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REHEARSAL_ENVIRONMENT="${REHEARSAL_ENVIRONMENT:-}"
REHEARSAL_ENV_DIR="${REHEARSAL_ENV_DIR:-}"
REHEARSAL_ENV_FILE="${REHEARSAL_ENV_FILE:-}"
REHEARSAL_COMPOSE_PROJECT="${REHEARSAL_COMPOSE_PROJECT:-}"
REHEARSAL_MIGRATION_STATE_FILE="${REHEARSAL_MIGRATION_STATE_FILE:-}"
REHEARSAL_EXPECTED_FINAL_MIGRATION="${REHEARSAL_EXPECTED_FINAL_MIGRATION:-}"
REHEARSAL_BACKUP_FILE="${REHEARSAL_BACKUP_FILE:-}"
REHEARSAL_RECEIPT_FILE="${REHEARSAL_RECEIPT_FILE:-}"
REHEARSAL_OFFHOST_BACKUP_NAME="${REHEARSAL_OFFHOST_BACKUP_NAME:-}"
REHEARSAL_MAX_RPO_SECONDS="${REHEARSAL_MAX_RPO_SECONDS:-86400}"
REHEARSAL_MAX_RTO_SECONDS="${REHEARSAL_MAX_RTO_SECONDS:-14400}"
REHEARSAL_REPORT_FILE="${REHEARSAL_REPORT_FILE:-}"
REHEARSAL_OWNER_UNAVAILABLE_MODE="${REHEARSAL_OWNER_UNAVAILABLE_MODE:-false}"
REHEARSAL_ACCESS_MANIFEST_FILE="${REHEARSAL_ACCESS_MANIFEST_FILE:-}"
REHEARSAL_TECHNICIAN_ID="${REHEARSAL_TECHNICIAN_ID:-}"
REHEARSAL_SHARED_ACCESS_CONFIRM="${REHEARSAL_SHARED_ACCESS_CONFIRM:-}"

for key in REHEARSAL_ENVIRONMENT REHEARSAL_ENV_DIR REHEARSAL_ENV_FILE REHEARSAL_COMPOSE_PROJECT; do
  [[ -n "${!key:-}" ]] || { echo "$key is required." >&2; exit 2; }
done

case "$(printf '%s' "$REHEARSAL_ENVIRONMENT" | tr '[:upper:]' '[:lower:]')" in
  development|dev|local) REHEARSAL_ENVIRONMENT="development" ;;
  test|testing|ci) REHEARSAL_ENVIRONMENT="test" ;;
  production|prod) REHEARSAL_ENVIRONMENT="production" ;;
  *) echo "REHEARSAL_ENVIRONMENT must identify development, test, or production." >&2; exit 2 ;;
esac

REHEARSAL_ENV_DIR="$(cd "$REHEARSAL_ENV_DIR" && pwd -P)"
[[ -f "$REHEARSAL_ENV_DIR/$REHEARSAL_ENV_FILE" ]] || {
  echo "Recovery rehearsal environment file does not exist: $REHEARSAL_ENV_DIR/$REHEARSAL_ENV_FILE" >&2
  exit 2
}
command -v jq >/dev/null 2>&1 || { echo "jq is required for recovery rehearsal evidence." >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "docker is required for recovery rehearsal." >&2; exit 2; }

for pair in "REHEARSAL_MAX_RPO_SECONDS:$REHEARSAL_MAX_RPO_SECONDS" "REHEARSAL_MAX_RTO_SECONDS:$REHEARSAL_MAX_RTO_SECONDS"; do
  key="${pair%%:*}"
  value="${pair#*:}"
  [[ "$value" =~ ^[0-9]+$ && "$value" -gt 0 ]] || { echo "$key must be a positive integer number of seconds." >&2; exit 2; }
done

source_count=0
[[ -n "$REHEARSAL_BACKUP_FILE" ]] && source_count=$((source_count + 1))
[[ -n "$REHEARSAL_RECEIPT_FILE" ]] && source_count=$((source_count + 1))
[[ -n "$REHEARSAL_OFFHOST_BACKUP_NAME" ]] && source_count=$((source_count + 1))
if [[ $source_count -ne 1 ]]; then
  echo "Exactly one recovery rehearsal source is required: REHEARSAL_BACKUP_FILE, REHEARSAL_RECEIPT_FILE, or REHEARSAL_OFFHOST_BACKUP_NAME." >&2
  exit 2
fi

owner_mode="$(printf '%s' "$REHEARSAL_OWNER_UNAVAILABLE_MODE" | tr '[:upper:]' '[:lower:]')"
case "$owner_mode" in
  true|1|yes) owner_mode=true ;;
  false|0|no|'') owner_mode=false ;;
  *) echo "REHEARSAL_OWNER_UNAVAILABLE_MODE must be true or false." >&2; exit 2 ;;
esac

read_manifest_value() {
  local file="$1" key="$2" line
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  local value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s\n' "$value"
}

access_manifest_sha256=""
access_repository_source=""
access_environment_source=""
access_s3_source=""
access_host_source=""
access_hetzner_source=""
access_dns_source=""
access_mfa_source=""
if [[ "$owner_mode" == true ]]; then
  [[ "$REHEARSAL_ENVIRONMENT" == "production" ]] || { echo "Owner-unavailable recovery rehearsal must run against ENV=production." >&2; exit 2; }
  [[ -n "$REHEARSAL_OFFHOST_BACKUP_NAME" && -z "$REHEARSAL_BACKUP_FILE" && -z "$REHEARSAL_RECEIPT_FILE" ]] || {
    echo "Owner-unavailable recovery rehearsal must start from RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME only; local backup/receipt evidence is intentionally not accepted." >&2
    exit 2
  }
  [[ -n "$REHEARSAL_TECHNICIAN_ID" ]] || { echo "REHEARSAL_TECHNICIAN_ID is required for owner-unavailable recovery evidence." >&2; exit 2; }
  [[ "$REHEARSAL_SHARED_ACCESS_CONFIRM" == "OWNER-UNAVAILABLE-RECOVERY-ACCESS-CONFIRMED" ]] || {
    echo "Owner-unavailable rehearsal requires REHEARSAL_SHARED_ACCESS_CONFIRM=OWNER-UNAVAILABLE-RECOVERY-ACCESS-CONFIRMED." >&2
    exit 2
  }
  if [[ -z "$REHEARSAL_ACCESS_MANIFEST_FILE" ]]; then
    REHEARSAL_ACCESS_MANIFEST_FILE="$REHEARSAL_ENV_DIR/ops/recovery-access.production.env"
  fi
  RECOVERY_ACCESS_ENVIRONMENT=production \
  RECOVERY_ACCESS_ENV_DIR="$REHEARSAL_ENV_DIR" \
  RECOVERY_ACCESS_ENV_FILE="$REHEARSAL_ENV_FILE" \
  RECOVERY_ACCESS_MANIFEST_FILE="$REHEARSAL_ACCESS_MANIFEST_FILE" \
    "$ROOT_DIR/scripts/server-owner-unavailable-recovery-preflight.sh"
  if command -v sha256sum >/dev/null 2>&1; then
    access_manifest_sha256="$(sha256sum "$REHEARSAL_ACCESS_MANIFEST_FILE" | awk '{print $1}')"
  else
    access_manifest_sha256="$(shasum -a 256 "$REHEARSAL_ACCESS_MANIFEST_FILE" | awk '{print $1}')"
  fi
  access_repository_source="$(read_manifest_value "$REHEARSAL_ACCESS_MANIFEST_FILE" RECOVERY_REPOSITORY_SOURCE)"
  access_environment_source="$(read_manifest_value "$REHEARSAL_ACCESS_MANIFEST_FILE" RECOVERY_PRODUCTION_ENV_SOURCE)"
  access_s3_source="$(read_manifest_value "$REHEARSAL_ACCESS_MANIFEST_FILE" RECOVERY_S3_CREDENTIAL_SOURCE)"
  access_host_source="$(read_manifest_value "$REHEARSAL_ACCESS_MANIFEST_FILE" RECOVERY_HOST_ACCESS_SOURCE)"
  access_hetzner_source="$(read_manifest_value "$REHEARSAL_ACCESS_MANIFEST_FILE" RECOVERY_HETZNER_CONSOLE_SOURCE)"
  access_dns_source="$(read_manifest_value "$REHEARSAL_ACCESS_MANIFEST_FILE" RECOVERY_DNS_SOURCE)"
  access_mfa_source="$(read_manifest_value "$REHEARSAL_ACCESS_MANIFEST_FILE" RECOVERY_MFA_RECOVERY_SOURCE)"
fi

read_state_value() {
  local key="$1" file="$2"
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2- || true
}
if [[ -n "$REHEARSAL_MIGRATION_STATE_FILE" && -f "$REHEARSAL_MIGRATION_STATE_FILE" ]]; then
  gate_status="$(read_state_value status "$REHEARSAL_MIGRATION_STATE_FILE")"
  if [[ "$gate_status" == "armed" ]]; then
    echo "Refusing recovery rehearsal while a migration/deployment recovery gate remains armed: $REHEARSAL_MIGRATION_STATE_FILE" >&2
    echo "Commit or roll back the migration gate before starting a separate recovery rehearsal." >&2
    exit 2
  fi
fi

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    shasum -a 256 "$path" | awk '{print $1}'
  fi
}

compose() {
  (
    cd "$REHEARSAL_ENV_DIR"
    env \
      -u APP_ENV \
      -u APP_AUTO_MIGRATE \
      -u AUTHZ_ACTOR_HEADER_MODE \
      -u DEV_SEED_ADMIN \
      AUTHZ_BOOTSTRAP_ENABLED=false \
      docker compose \
        -p "$REHEARSAL_COMPOSE_PROJECT" \
        --env-file "$REHEARSAL_ENV_FILE" \
        -f docker-compose.server.yml \
        "$@"
  )
}

# Resolve the deployed image once. No rehearsal process may inherit the
# backend service's named SQLite volume via `docker compose run backend`.
rehearsal_image_ref="$(compose images -q backend)"
[[ -n "$rehearsal_image_ref" && "$rehearsal_image_ref" != *$'\n'* ]] || {
  echo 'BLOCKED: expected one deployed backend image for recovery rehearsal' >&2; exit 2;
}
rehearsal_image="$(docker image inspect "$rehearsal_image_ref" --format '{{.Id}}')"
[[ "$rehearsal_image" == sha256:* ]] || { echo 'BLOCKED: unable to resolve backend image ID' >&2; exit 2; }

# Tools need a read-only view of backup receipts and the deployment environment;
# only the new private rehearsal workspace is writable. Off-host materialization
# needs S3 egress; local restore/stage/verify must have no network.
run_tool() {
  local tool="$1" key value
  shift
  case "$tool" in ers-restore|ers-offhost-backup) ;; *) echo 'Unexpected recovery tool' >&2; return 2 ;; esac
  local network=(--network none)
  if [[ "$tool" == ers-offhost-backup ]]; then network=(--network bridge); fi
  local args=(run --rm "${network[@]}" --read-only --tmpfs /tmp:rw,nosuid,nodev
    --cap-drop ALL --security-opt no-new-privileges
    --mount "type=bind,src=$REHEARSAL_ENV_DIR,dst=$REHEARSAL_ENV_DIR,readonly"
    --mount "type=bind,src=$rehearsal_dir,dst=$rehearsal_dir"
    --env-file "$REHEARSAL_ENV_DIR/$REHEARSAL_ENV_FILE")
  for key in SERVER_OFFHOST_BACKUP_IDENTITY_FILE SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE AWS_SHARED_CREDENTIALS_FILE AWS_CONFIG_FILE; do
    value="$(grep -E "^${key}=" "$REHEARSAL_ENV_DIR/$REHEARSAL_ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
    if [[ -n "$value" && "$value" == /* && -f "$value" && "$value" != "$REHEARSAL_ENV_DIR"/* ]]; then
      args+=(--mount "type=bind,src=$value,dst=$value,readonly")
    fi
  done
  docker "${args[@]}" --entrypoint "/app/$tool" "$rehearsal_image" "$@"
}

# All newly created rehearsal data uses restrictive permissions regardless of
# the caller's umask. Cleanup is scoped to this invocation's unique workspace.
umask 077
rehearsal_container=""
container_owned=false
rehearsal_dir=""
cleanup_rehearsal() {
  local original_exit="$1"
  trap - EXIT INT TERM
  if [[ -n "$rehearsal_dir" && -d "$rehearsal_dir" ]]; then
    if ! "$ROOT_DIR/scripts/ers-recovery-private-cleanup.sh" \
      "$rehearsal_root" "$rehearsal_dir" "$rehearsal_container" "$container_owned"; then
      echo 'BLOCKED: rehearsal cleanup is incomplete; investigate this run only' >&2
      exit 1
    fi
  fi
  exit "$original_exit"
}
trap 'cleanup_rehearsal "$?"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

started_epoch="$(date +%s)"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
rehearsal_root="$REHEARSAL_ENV_DIR/recovery/rehearsals"
rehearsal_dir="$rehearsal_root/rehearsal-$stamp"
sequence=1
while [[ -e "$rehearsal_dir" ]]; do
  rehearsal_dir="$rehearsal_root/rehearsal-$stamp-$sequence"
  sequence=$((sequence + 1))
done
for protected in "$REHEARSAL_ENV_DIR/recovery" "$rehearsal_root" "$rehearsal_dir"; do
  [[ ! -L "$protected" ]] || { echo "Refusing symlinked recovery workspace: $protected" >&2; exit 2; }
done
mkdir -p "$rehearsal_dir/source" "$rehearsal_dir/boot-data"
for protected in "$REHEARSAL_ENV_DIR/recovery" "$rehearsal_root" "$rehearsal_dir" "$rehearsal_dir/source" "$rehearsal_dir/boot-data"; do
  [[ ! -L "$protected" ]] || { echo "Refusing symlinked recovery workspace: $protected" >&2; exit 2; }
  chmod 700 "$protected" || { echo "Cannot secure private recovery directory: $protected" >&2; exit 2; }
  [[ "$(stat -c %a "$protected")" == 700 ]] || { echo "Unexpected recovery directory mode: $protected" >&2; exit 2; }
done

if [[ -z "$REHEARSAL_REPORT_FILE" ]]; then
  REHEARSAL_REPORT_FILE="$rehearsal_dir/rehearsal.json"
fi
case "$REHEARSAL_REPORT_FILE" in
  "$REHEARSAL_ENV_DIR"/recovery/*) ;;
  *) echo "Recovery rehearsal report must be written beneath $REHEARSAL_ENV_DIR/recovery/: $REHEARSAL_REPORT_FILE" >&2; exit 2 ;;
esac
if [[ -e "$REHEARSAL_REPORT_FILE" ]]; then
  echo "Refusing to overwrite existing recovery rehearsal report: $REHEARSAL_REPORT_FILE" >&2
  exit 2
fi

source_kind=""
source_receipt=""
receipt_version_id=""
materialize_log="$rehearsal_dir/materialize.log"

if [[ -n "$REHEARSAL_BACKUP_FILE" ]]; then
  backup_dir="$(cd "$(dirname "$REHEARSAL_BACKUP_FILE")" && pwd -P)"
  source_backup="$backup_dir/$(basename "$REHEARSAL_BACKUP_FILE")"
  case "$source_backup" in
    "$REHEARSAL_ENV_DIR"/*) ;;
    *) echo "Local rehearsal backup must be beneath the selected deployed environment so the compiled recovery tool can read it: $source_backup" >&2; exit 2 ;;
  esac
  [[ -f "$source_backup" && -f "$source_backup.manifest.json" ]] || { echo "Local rehearsal backup pair is incomplete: $source_backup" >&2; exit 2; }
  source_kind="local-backup"
  run_tool ers-restore stage \
    --backup "$source_backup" \
    --manifest "$source_backup.manifest.json" \
    --expected-environment "$REHEARSAL_ENVIRONMENT" \
    --output-dir "$rehearsal_dir/source"
  candidate="$rehearsal_dir/source/$(basename "$source_backup")"
elif [[ -n "$REHEARSAL_RECEIPT_FILE" ]]; then
  receipt_dir="$(cd "$(dirname "$REHEARSAL_RECEIPT_FILE")" && pwd -P)"
  receipt_input="$receipt_dir/$(basename "$REHEARSAL_RECEIPT_FILE")"
  case "$receipt_input" in
    "$REHEARSAL_ENV_DIR"/*) ;;
    *) echo "Local off-host receipt must be beneath the selected deployed environment: $receipt_input" >&2; exit 2 ;;
  esac
  [[ -f "$receipt_input" ]] || { echo "Off-host receipt does not exist: $receipt_input" >&2; exit 2; }
  backup_name="$(jq -er '.source.backup_file' "$receipt_input")"
  [[ "$(basename "$backup_name")" == "$backup_name" ]] || { echo "Off-host receipt contains an invalid managed backup filename: $backup_name" >&2; exit 2; }
  source_kind="offhost-receipt"
  run_tool ers-offhost-backup materialize \
    --environment "$REHEARSAL_ENVIRONMENT" \
    --env-file "$REHEARSAL_ENV_DIR/$REHEARSAL_ENV_FILE" \
    --receipt "$receipt_input" \
    --output-dir "$rehearsal_dir/source" | tee "$materialize_log"
  candidate="$rehearsal_dir/source/$backup_name"
  source_receipt="$candidate.offhost.json"
else
  backup_name="$REHEARSAL_OFFHOST_BACKUP_NAME"
  [[ "$(basename "$backup_name")" == "$backup_name" && "$backup_name" == app-*.db ]] || {
    echo "REHEARSAL_OFFHOST_BACKUP_NAME must be a managed app-*.db filename without a path." >&2
    exit 2
  }
  source_kind="offhost-backup-name"
  run_tool ers-offhost-backup materialize \
    --environment "$REHEARSAL_ENVIRONMENT" \
    --env-file "$REHEARSAL_ENV_DIR/$REHEARSAL_ENV_FILE" \
    --backup-name "$backup_name" \
    --output-dir "$rehearsal_dir/source" | tee "$materialize_log"
  candidate="$rehearsal_dir/source/$backup_name"
  source_receipt="$candidate.offhost.json"
  receipt_version_id="$(sed -n 's/^Receipt VersionId: //p' "$materialize_log" | tail -n 1)"
fi

manifest="$candidate.manifest.json"
[[ -f "$candidate" && -f "$manifest" ]] || { echo "Recovery rehearsal candidate pair is incomplete: $candidate" >&2; exit 2; }
run_tool ers-restore verify \
  --backup "$candidate" \
  --manifest "$manifest" \
  --expected-environment "$REHEARSAL_ENVIRONMENT"

backup_created_at="$(jq -er '.created_at' "$manifest")"
backup_created_epoch="$(jq -nr --arg value "$backup_created_at" '$value | fromdateiso8601')"
if [[ "$backup_created_epoch" -gt "$started_epoch" ]]; then
  echo "Backup creation timestamp is later than rehearsal start; check host clocks: $backup_created_at" >&2
  exit 2
fi
rpo_seconds=$((started_epoch - backup_created_epoch))
source_sha256="$(jq -er '.backup.sha256' "$manifest")"
actual_source_sha256="$(sha256_file "$candidate")"
[[ "$source_sha256" == "$actual_source_sha256" ]] || { echo "Materialized/staged source SHA-256 differs from manifest evidence." >&2; exit 2; }
backup_repository_revision="$(jq -r '.repository.revision // ""' "$manifest")"
backup_repository_tree_sha="$(jq -r '.repository.tree_sha // ""' "$manifest")"
compatible_revision_available=false
if [[ -n "$backup_repository_revision" && -n "$backup_repository_tree_sha" ]]; then
  if git -C "$REHEARSAL_ENV_DIR" cat-file -e "${backup_repository_revision}^{commit}" >/dev/null 2>&1 \
    && [[ "$(git -C "$REHEARSAL_ENV_DIR" rev-parse "${backup_repository_revision}^{tree}")" == "$backup_repository_tree_sha" ]]; then
    compatible_revision_available=true
  fi
fi
if [[ "$owner_mode" == true && "$compatible_revision_available" != true ]]; then
  echo "Owner-unavailable recovery requires backup manifest repository revision/tree evidence that can be resolved from GitHub." >&2
  echo "Fetching shared GitHub repository history before the final compatibility check." >&2
  git -C "$REHEARSAL_ENV_DIR" fetch --quiet origin --prune
  git -C "$REHEARSAL_ENV_DIR" cat-file -e "${backup_repository_revision}^{commit}" >/dev/null 2>&1 || {
    echo "Compatible backup repository revision is unavailable after GitHub fetch: ${backup_repository_revision:-missing}" >&2
    exit 2
  }
  actual_backup_tree="$(git -C "$REHEARSAL_ENV_DIR" rev-parse "${backup_repository_revision}^{tree}")"
  [[ "$actual_backup_tree" == "$backup_repository_tree_sha" ]] || {
    echo "Backup repository tree evidence does not match compatible revision." >&2
    exit 2
  }
  compatible_revision_available=true
fi

confirm="RESTORE-$(printf '%s' "$REHEARSAL_ENVIRONMENT" | tr '[:lower:]' '[:upper:]')"
restored_db="$rehearsal_dir/restored.db"
restore_report="$rehearsal_dir/restore-application.json"
run_tool ers-restore apply \
  --backup "$candidate" \
  --manifest "$manifest" \
  --target "$restored_db" \
  --environment "$REHEARSAL_ENVIRONMENT" \
  --confirm "$confirm" \
  --report "$restore_report"

restored_sha256="$(sha256_file "$restored_db")"
[[ "$restored_sha256" == "$source_sha256" ]] || { echo "Rehearsal restore target differs from selected source SHA-256." >&2; exit 2; }

migrated_db="$rehearsal_dir/migrated.db"

# The same exact deployed backend image powers migrations and application boot.
export ERS_RECOVERY_IMAGE="$rehearsal_image"
export ERS_RECOVERY_WORKDIR="$rehearsal_dir"
export ERS_RECOVERY_BOOT_DIR="$rehearsal_dir/boot-data"
export ERS_RECOVERY_ENV_FILE="$REHEARSAL_ENV_DIR/$REHEARSAL_ENV_FILE"
export ERS_RECOVERY_ENVIRONMENT="$REHEARSAL_ENVIRONMENT"
export ERS_RECOVERY_EXPECTED_MIGRATION="$REHEARSAL_EXPECTED_FINAL_MIGRATION"
isolated="$ROOT_DIR/scripts/ers-recovery-isolated-container.sh"

chmod 600 "$restored_db"
cp "$restored_db" "$migrated_db"
chmod 600 "$migrated_db"
echo 'Rehearsing migrations in a volume-free, network-isolated container.'
"$isolated" migrate
"$isolated" verify
migrated_sha256="$(sha256_file "$migrated_db")"
cp "$migrated_db" "$rehearsal_dir/boot-data/app.db"
chmod 600 "$rehearsal_dir/boot-data/app.db"
[[ "$(sha256_file "$rehearsal_dir/boot-data/app.db")" == "$migrated_sha256" ]] || {
  echo 'BLOCKED: isolated boot database differs from migrated candidate' >&2; exit 1;
}
rehearsal_stamp="$(printf '%s' "$stamp" | tr '[:upper:]' '[:lower:]')"
rehearsal_container="${REHEARSAL_COMPOSE_PROJECT}-recovery-rehearsal-${rehearsal_stamp}"
rehearsal_container="${rehearsal_container//_/-}"
export ERS_RECOVERY_CONTAINER="$rehearsal_container"
if docker container inspect "$rehearsal_container" >/dev/null 2>&1; then
  echo 'BLOCKED: rehearsal container name is already in use; refusing to remove it' >&2
  exit 2
fi
echo 'Starting a backend using only the private recovered database, without Test volumes.'
"$isolated" start >/dev/null
container_owned=true
"$isolated" inspect
healthy=0
for ((attempt=1; attempt<=12; attempt++)); do
  if docker exec "$rehearsal_container" curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then
    healthy=1; break
  fi
  sleep 5
done
if [[ $healthy -ne 1 ]]; then
  echo 'Recovered database backend did not become healthy; preserving no live volume access.' >&2
  docker logs "$rehearsal_container" >&2 || true
  exit 1
fi
"$isolated" inspect
"$isolated" check-db
post_boot_integrity=ok
"$isolated" stop
container_owned=false
# Dispose private database copies before recording a successful rehearsal.
find "$rehearsal_dir" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' \) -delete
if find "$rehearsal_dir" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' \) | grep -q .; then
  echo 'BLOCKED: private recovered SQLite copies remain after cleanup' >&2; exit 1
fi

completed_epoch="$(date +%s)"
completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rto_seconds=$((completed_epoch - started_epoch))
rpo_met=false
rto_met=false
[[ $rpo_seconds -le $REHEARSAL_MAX_RPO_SECONDS ]] && rpo_met=true
[[ $rto_seconds -le $REHEARSAL_MAX_RTO_SECONDS ]] && rto_met=true
status="passed"
[[ "$rpo_met" == true && "$rto_met" == true ]] || status="objective_failed"

remote_db_key=""
remote_db_version=""
remote_manifest_key=""
remote_manifest_version=""
if [[ -n "$source_receipt" && -f "$source_receipt" ]]; then
  remote_db_key="$(jq -r '.remote.backup.key // ""' "$source_receipt")"
  remote_db_version="$(jq -r '.remote.backup.version_id // ""' "$source_receipt")"
  remote_manifest_key="$(jq -r '.remote.manifest.key // ""' "$source_receipt")"
  remote_manifest_version="$(jq -r '.remote.manifest.version_id // ""' "$source_receipt")"
fi

repository_revision="unknown"
repository_tree_sha="unknown"
if git -C "$REHEARSAL_ENV_DIR" rev-parse HEAD >/dev/null 2>&1; then
  repository_revision="$(git -C "$REHEARSAL_ENV_DIR" rev-parse HEAD)"
  repository_tree_sha="$(git -C "$REHEARSAL_ENV_DIR" rev-parse HEAD^{tree})"
fi

mkdir -p "$(dirname "$REHEARSAL_REPORT_FILE")"
jq -n \
  --arg status "$status" \
  --arg environment "$REHEARSAL_ENVIRONMENT" \
  --arg started_at "$started_at" \
  --arg completed_at "$completed_at" \
  --arg source_kind "$source_kind" \
  --arg backup_file "$(basename "$candidate")" \
  --arg backup_created_at "$backup_created_at" \
  --arg backup_sha256 "$source_sha256" \
  --arg backup_repository_revision "$backup_repository_revision" \
  --arg backup_repository_tree_sha "$backup_repository_tree_sha" \
  --argjson compatible_revision_available "$compatible_revision_available" \
  --arg manifest_file "$(basename "$manifest")" \
  --arg receipt_file "${source_receipt:+$(basename "$source_receipt")}" \
  --arg receipt_version_id "$receipt_version_id" \
  --arg remote_db_key "$remote_db_key" \
  --arg remote_db_version "$remote_db_version" \
  --arg remote_manifest_key "$remote_manifest_key" \
  --arg remote_manifest_version "$remote_manifest_version" \
  --arg restored_path "$restored_db" \
  --arg restored_sha256 "$restored_sha256" \
  --arg restore_report "$restore_report" \
  --arg migrated_path "$migrated_db" \
  --arg migrated_sha256 "$migrated_sha256" \
  --arg expected_final_migration "$REHEARSAL_EXPECTED_FINAL_MIGRATION" \
  --arg post_boot_integrity "$post_boot_integrity" \
  --arg repository_revision "$repository_revision" \
  --arg repository_tree_sha "$repository_tree_sha" \
  --argjson owner_unavailable_mode "$owner_mode" \
  --arg technician_id "$REHEARSAL_TECHNICIAN_ID" \
  --arg access_manifest_file "${REHEARSAL_ACCESS_MANIFEST_FILE:+$(basename "$REHEARSAL_ACCESS_MANIFEST_FILE")}" \
  --arg access_manifest_sha256 "$access_manifest_sha256" \
  --arg access_repository_source "$access_repository_source" \
  --arg access_environment_source "$access_environment_source" \
  --arg access_s3_source "$access_s3_source" \
  --arg access_host_source "$access_host_source" \
  --arg access_hetzner_source "$access_hetzner_source" \
  --arg access_dns_source "$access_dns_source" \
  --arg access_mfa_source "$access_mfa_source" \
  --argjson rpo_seconds "$rpo_seconds" \
  --argjson max_rpo_seconds "$REHEARSAL_MAX_RPO_SECONDS" \
  --argjson rpo_met "$rpo_met" \
  --argjson rto_seconds "$rto_seconds" \
  --argjson max_rto_seconds "$REHEARSAL_MAX_RTO_SECONDS" \
  --argjson rto_met "$rto_met" \
  '{
    format_version: 1,
    status: $status,
    environment: $environment,
    started_at: $started_at,
    completed_at: $completed_at,
    repository: {
      revision: $repository_revision,
      tree_sha: $repository_tree_sha
    },
    owner_unavailable: {
      mode: $owner_unavailable_mode,
      technician_id: $technician_id,
      shared_access_confirmed: $owner_unavailable_mode,
      access_manifest_file: $access_manifest_file,
      access_manifest_sha256: $access_manifest_sha256,
      sources: {
        repository: $access_repository_source,
        production_environment: $access_environment_source,
        s3_credentials: $access_s3_source,
        host_access: $access_host_source,
        hetzner_console: $access_hetzner_source,
        dns: $access_dns_source,
        mfa_recovery: $access_mfa_source
      }
    },
    source: {
      kind: $source_kind,
      backup_file: $backup_file,
      backup_created_at: $backup_created_at,
      backup_sha256: $backup_sha256,
      repository_revision: $backup_repository_revision,
      repository_tree_sha: $backup_repository_tree_sha,
      compatible_revision_available: $compatible_revision_available,
      manifest_file: $manifest_file,
      receipt_file: $receipt_file,
      receipt_version_id: $receipt_version_id,
      remote: {
        backup_key: $remote_db_key,
        backup_version_id: $remote_db_version,
        manifest_key: $remote_manifest_key,
        manifest_version_id: $remote_manifest_version
      }
    },
    recovery: {
      restored_path: $restored_path,
      restored_sha256: $restored_sha256,
      restore_report: $restore_report,
      migrated_path: $migrated_path,
      migrated_sha256: $migrated_sha256,
      expected_final_migration: $expected_final_migration,
      isolated_backend_health: "passed",
      isolation: {
        docker_effective_mounts_verified: true,
        named_volumes_present: false,
        network_disabled: true,
        backend_database_path: "/rehearsal-data/app.db",
        database_checked_path: "/rehearsal-data/app.db",
        private_database_copies_disposed: true,
        rehearsal_container_removed: true
      },
      post_boot_integrity_check: $post_boot_integrity,
      post_boot_foreign_key_check: "clean"
    },
    objectives: {
      rpo_basis: "selected_backup_age_at_rehearsal_start",
      rpo_seconds: $rpo_seconds,
      max_rpo_seconds: $max_rpo_seconds,
      rpo_met: $rpo_met,
      rto_basis: "rehearsal_start_to_isolated_backend_health_and_database_verification",
      rto_seconds: $rto_seconds,
      max_rto_seconds: $max_rto_seconds,
      rto_met: $rto_met
    }
  }' > "$REHEARSAL_REPORT_FILE.tmp"
mv "$REHEARSAL_REPORT_FILE.tmp" "$REHEARSAL_REPORT_FILE"
chmod 600 "$REHEARSAL_REPORT_FILE"

printf 'Recovery rehearsal %s.\n' "$status"
printf 'Environment: %s\n' "$REHEARSAL_ENVIRONMENT"
printf 'Source: %s (%s)\n' "$(basename "$candidate")" "$source_kind"
printf 'Selected restore-point age / RPO: %ss (objective <= %ss): %s\n' "$rpo_seconds" "$REHEARSAL_MAX_RPO_SECONDS" "$rpo_met"
printf 'Recovery rehearsal RTO: %ss (objective <= %ss): %s\n' "$rto_seconds" "$REHEARSAL_MAX_RTO_SECONDS" "$rto_met"
printf 'Evidence: %s\n' "$REHEARSAL_REPORT_FILE"
if [[ "$owner_mode" == true ]]; then
  printf 'Owner-unavailable technician: %s\n' "$REHEARSAL_TECHNICIAN_ID"
  printf 'Compatible backup revision: %s (tree %s)\n' "$backup_repository_revision" "$backup_repository_tree_sha"
  printf 'Shared recovery access manifest: %s (SHA-256 %s)\n' "$REHEARSAL_ACCESS_MANIFEST_FILE" "$access_manifest_sha256"
fi

if [[ "$status" != "passed" ]]; then
  echo "Recovery mechanics verified, but one or more RPO/RTO objectives were not met. Review the evidence before accepting the rehearsal." >&2
  exit 1
fi
