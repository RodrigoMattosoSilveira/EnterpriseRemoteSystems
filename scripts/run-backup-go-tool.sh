#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 ers-backup|ers-offhost-backup|ers-restore [arguments...]" >&2
  exit 2
fi

tool="$1"
shift
case "$tool" in
  ers-backup|ers-offhost-backup|ers-restore) ;;
  *)
    echo "unsupported ERS backup/recovery Go tool: $tool" >&2
    exit 2
    ;;
esac

# Regression/local callers may supply already-built native binaries. This keeps
# test-only Python harnesses independent from Production execution mechanics.
if [[ -n "${ERS_BACKUP_TOOL_BINARY_DIR:-}" ]]; then
  binary="${ERS_BACKUP_TOOL_BINARY_DIR%/}/$tool"
  if [[ ! -x "$binary" ]]; then
    echo "ERS backup/recovery Go binary is missing or not executable: $binary" >&2
    exit 2
  fi
  exec "$binary" "$@"
fi

# Deployed server targets run the tool compiled into the newly built backend
# image. No Python or Go compiler is required on the Production host.
if [[ -n "${ERS_BACKUP_ENV_DIR:-}" ]]; then
  : "${ERS_BACKUP_ENV_FILE:?ERS_BACKUP_ENV_FILE is required in deployed mode}"
  : "${ERS_BACKUP_COMPOSE_PROJECT:?ERS_BACKUP_COMPOSE_PROJECT is required in deployed mode}"
  if [[ ! -d "$ERS_BACKUP_ENV_DIR" ]]; then
    echo "ERS backup environment directory does not exist: $ERS_BACKUP_ENV_DIR" >&2
    exit 2
  fi
  env_path="$ERS_BACKUP_ENV_DIR/$ERS_BACKUP_ENV_FILE"
  if [[ ! -f "$env_path" ]]; then
    echo "ERS backup environment file does not exist: $env_path" >&2
    exit 2
  fi

  # Give the utility write access only to the selected deployed environment.
  # Secret/config files outside that directory are mounted individually read-only.
  mount_args=(-v "$ERS_BACKUP_ENV_DIR:$ERS_BACKUP_ENV_DIR")
  for key in SERVER_OFFHOST_BACKUP_IDENTITY_FILE SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE AWS_SHARED_CREDENTIALS_FILE AWS_CONFIG_FILE; do
    value="$(grep -E "^${key}=" "$env_path" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
    if [[ -n "$value" && "$value" = /* && -e "$value" && "$value" != "$ERS_BACKUP_ENV_DIR"/* ]]; then
      mount_args+=(-v "$value:$value:ro")
    fi
  done

  cd "$ERS_BACKUP_ENV_DIR"
  exec env \
    -u APP_ENV \
    -u APP_AUTO_MIGRATE \
    -u AUTHZ_ACTOR_HEADER_MODE \
    -u DEV_SEED_ADMIN \
    AUTHZ_BOOTSTRAP_ENABLED=false \
    docker compose \
      -p "$ERS_BACKUP_COMPOSE_PROJECT" \
      --env-file "$ERS_BACKUP_ENV_FILE" \
      -f docker-compose.server.yml \
      run --rm --no-deps \
      "${mount_args[@]}" \
      --entrypoint "/app/$tool" \
      backend \
      "$@"
fi

# Developer fallback. Production server targets never use this path.
if ! command -v go >/dev/null 2>&1; then
  echo "Go is required for local backup-tool execution; deployed targets use the compiled backend image." >&2
  exit 2
fi
cd "$ROOT_DIR/backend"
exec go run "./cmd/$tool" "$@"
