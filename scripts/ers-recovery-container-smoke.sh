#!/usr/bin/env bash
# Gate B: build and exercise an isolated recovery-dependency image. Never mounts host Docker socket or databases.
set -euo pipefail
cd "$(dirname "$0")/.."
project_root="$PWD"
export ERS_RECOVERY_BASE_IMAGE="${ERS_RECOVERY_BASE_IMAGE:-}"
if [[ ! "$ERS_RECOVERY_BASE_IMAGE" =~ ^python:3\.12-slim-bookworm@sha256:[a-f0-9]{64}$ ]]; then
  echo 'ERS_GATEB BASE_IMAGE_PIN_INVALID FAIL' >&2; exit 2
fi
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo 'ERS_GATEB DOCKER_UNAVAILABLE FAIL' >&2; exit 2
fi
platform="${ERS_RECOVERY_PLATFORM:-linux/amd64}"
case "$platform" in linux/amd64|linux/arm64) ;; *) echo 'ERS_GATEB PLATFORM_INVALID FAIL' >&2; exit 2;; esac
# Verify digest can be retrieved using Docker's trusted content-addressed resolution.
# Docker build itself enforces that the base image bytes match this digest.
if ! docker buildx imagetools inspect "$ERS_RECOVERY_BASE_IMAGE" >/dev/null; then
  echo 'ERS_GATEB PIN_NOT_RESOLVABLE FAIL' >&2; exit 2
fi
run_id="$(python3 -c 'import secrets; print(secrets.token_hex(10))')"
image="ers-gateb-smoke:${run_id}"
container="ers-gateb-smoke-${run_id}"
created=0
cleanup() {
  result=$?
  trap - EXIT INT TERM
  docker rm -f "$container" >/dev/null 2>&1 || true
  if [[ "${ERS_GATEB_KEEP_IMAGE:-0}" != 1 ]]; then docker image rm -f "$image" >/dev/null 2>&1 || true; fi
  # Only target containers created by this invocation. Never remove unrelated containers.
  if docker container inspect "$container" >/dev/null 2>&1; then
    echo 'ERS_GATEB CONTAINER_CLEANUP FAIL' >&2
    exit 1
  fi
  if (( result == 0 )); then echo 'ERS_GATEB CONTAINER_CLEANUP PASS'; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# --pull=false is intentional: digest-addressed base image is fetched by Docker if absent.
docker build --platform "$platform" --build-arg "ERS_RECOVERY_BASE_IMAGE=$ERS_RECOVERY_BASE_IMAGE" \
  --label 'org.enterpriseremotesystems.gateb=smoke' -f ops/recovery/Dockerfile -t "$image" .
echo 'ERS_GATEB IMAGE_BUILD PASS'
# No volumes, host network, ports, privilege, or Docker socket are provided.
docker run --name "$container" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --platform "$platform" "$image" /usr/local/bin/ers-gateb-verify
created=1
echo 'ERS_GATEB CONTAINER_SMOKE PASS'
