#!/usr/bin/env bash
# Bite 33.6.8A: never inherit the deployed backend's persistent volumes.
set -euo pipefail
: "${ERS_RECOVERY_IMAGE:?ERS_RECOVERY_IMAGE required}"
: "${ERS_RECOVERY_WORKDIR:?ERS_RECOVERY_WORKDIR required}"
: "${ERS_RECOVERY_BOOT_DIR:?ERS_RECOVERY_BOOT_DIR required}"
: "${ERS_RECOVERY_CONTAINER:?ERS_RECOVERY_CONTAINER required}"
: "${ERS_RECOVERY_ENV_FILE:?ERS_RECOVERY_ENV_FILE required}"
: "${ERS_RECOVERY_ENVIRONMENT:?ERS_RECOVERY_ENVIRONMENT required}"
: "${ERS_RECOVERY_EXPECTED_MIGRATION:?ERS_RECOVERY_EXPECTED_MIGRATION required}"
[[ $# -eq 1 ]] || { echo 'Expected operation: migrate, verify, start, inspect, check-db, or stop' >&2; exit 2; }
operation="$1"
command -v docker >/dev/null || { echo 'Docker required' >&2; exit 2; }
command -v jq >/dev/null || { echo 'jq required for effective-mount verification' >&2; exit 2; }
[[ -f "$ERS_RECOVERY_ENV_FILE" && -d "$ERS_RECOVERY_WORKDIR" && -d "$ERS_RECOVERY_BOOT_DIR" ]] || {
  echo 'Rehearsal file or directories absent' >&2; exit 2;
}
workdir="$(cd "$ERS_RECOVERY_WORKDIR" && pwd -P)"
bootdir="$(cd "$ERS_RECOVERY_BOOT_DIR" && pwd -P)"
[[ "$bootdir" == "$workdir/boot-data" ]] || { echo 'Rehearsal boot directory is outside its private workspace' >&2; exit 2; }
[[ "$ERS_RECOVERY_IMAGE" == sha256:* ]] || { echo 'A resolved immutable backend image ID is required' >&2; exit 2; }
[[ "$ERS_RECOVERY_CONTAINER" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo 'Unsafe container name' >&2; exit 2; }
image_id="$(docker image inspect "$ERS_RECOVERY_IMAGE" --format '{{.Id}}')"
[[ "$image_id" == "$ERS_RECOVERY_IMAGE" ]] || { echo 'Image identity mismatch' >&2; exit 2; }

# Every transient process has no network, a read-only root, and precisely one
# private bind mount. In particular, no Compose backend-data named volume.
common=(--network none --read-only --tmpfs /tmp:rw,nosuid,nodev --cap-drop ALL --security-opt no-new-privileges)
case "$operation" in
  migrate|verify)
    db=/rehearsal/migrated.db
    [[ -f "$workdir/migrated.db" ]] || { echo 'Migrated candidate is absent' >&2; exit 2; }
    if [[ "$operation" == migrate ]]; then entry=/app/apply-sql-migrations.sh; else entry=/app/verify-migrated-db.sh; fi
    docker run --rm "${common[@]}" \
      --mount "type=bind,src=$workdir,dst=/rehearsal" \
      -e "DATABASE_PATH=$db" -e "DB_PATH=$db" \
      -e "EXPECTED_FINAL_MIGRATION=$ERS_RECOVERY_EXPECTED_MIGRATION" \
      --entrypoint "$entry" "$image_id"
    ;;
  start)
    [[ -f "$bootdir/app.db" ]] || { echo 'Recovered boot database missing' >&2; exit 2; }
    if docker container inspect "$ERS_RECOVERY_CONTAINER" >/dev/null 2>&1; then
      echo 'Refusing to replace an existing container with the rehearsal name' >&2; exit 2
    fi
    docker run -d "${common[@]}" --name "$ERS_RECOVERY_CONTAINER" \
      --mount "type=bind,src=$bootdir,dst=/rehearsal-data" \
      --env-file "$ERS_RECOVERY_ENV_FILE" \
      -e "APP_ENV=$ERS_RECOVERY_ENVIRONMENT" \
      -e DATABASE_PATH=/rehearsal-data/app.db \
      -e DB_PATH=/rehearsal-data/app.db \
      -e APP_AUTO_MIGRATE=false -e AUTHZ_BOOTSTRAP_ENABLED=false \
      -e DEV_SEED_ADMIN=false -e AUTHZ_ACTOR_HEADER_MODE=disabled \
      -e AUTH_LOCAL_SESSION_HEADER_ENABLED=false -e LLM_COACHING_ENABLED=false \
      "$image_id"
    ;;
  inspect)
    # Fail before any health or data-integrity check when effective mounts,
    # network, image identity, or database environment differ.
    docker inspect "$ERS_RECOVERY_CONTAINER" | jq -e \
      --arg boot "$bootdir" --arg image "$image_id" --arg app "$ERS_RECOVERY_ENVIRONMENT" '
      length == 1 and
      .[0].Image == $image and
      .[0].HostConfig.NetworkMode == "none" and
      .[0].HostConfig.ReadonlyRootfs == true and
      (.[0].HostConfig.VolumesFrom // [] | length) == 0 and
      (.[0].Mounts | length) == 1 and
      .[0].Mounts[0].Type == "bind" and
      .[0].Mounts[0].Source == $boot and
      .[0].Mounts[0].Destination == "/rehearsal-data" and
      .[0].Mounts[0].RW == true and
      ((.[0].Config.Env | index("DATABASE_PATH=/rehearsal-data/app.db")) != null) and
      ((.[0].Config.Env | index("DB_PATH=/rehearsal-data/app.db")) != null) and
      ((.[0].Config.Env | index("APP_ENV=" + $app)) != null) and
      ((.[0].Config.Env | index("APP_AUTO_MIGRATE=false")) != null) and
      ((.[0].Config.Env | index("AUTHZ_BOOTSTRAP_ENABLED=false")) != null)
      ' >/dev/null || { echo 'BLOCKED: effective Docker container is not isolated from persistent data' >&2; exit 1; }
    printf 'PASS: effective recovery container has one private bind mount and no live volumes or network\n'
    ;;
  check-db)
    # Not /app/data/app.db: that path belongs to the live Compose backend.
    integrity="$(docker exec "$ERS_RECOVERY_CONTAINER" sqlite3 -bail /rehearsal-data/app.db 'PRAGMA integrity_check;')"
    [[ "$integrity" == ok ]] || { echo "Recovered DB integrity failed: $integrity" >&2; exit 1; }
    keys="$(docker exec "$ERS_RECOVERY_CONTAINER" sqlite3 -bail /rehearsal-data/app.db 'PRAGMA foreign_key_check;')"
    [[ -z "$keys" ]] || { echo 'Recovered DB foreign-key violations' >&2; exit 1; }
    printf 'PASS: the recovered database passed post-boot integrity and foreign-key checks\n'
    ;;
  stop)
    if docker container inspect "$ERS_RECOVERY_CONTAINER" >/dev/null 2>&1; then
      docker rm -f "$ERS_RECOVERY_CONTAINER" >/dev/null
    fi
    if docker container inspect "$ERS_RECOVERY_CONTAINER" >/dev/null 2>&1; then
      echo 'Recovery test container remains after cleanup' >&2; exit 1
    fi
    ;;
  *) echo 'Unsupported isolated container operation' >&2; exit 2 ;;
esac
