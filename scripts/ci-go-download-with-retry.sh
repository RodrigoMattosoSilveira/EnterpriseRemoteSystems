#!/usr/bin/env bash
# CI-only: warm the Go module cache before migration and recovery regression tests.
# Allow transient module-proxy errors to recover, but fail closed after 3 attempts.
set -euo pipefail

if [[ ! -f go.mod || ! -f go.sum ]]; then
  echo 'FAIL: Run Go module prefetch from the backend directory.' >&2
  exit 2
fi

for attempt in 1 2 3; do
  if go mod download; then
    echo "PASS: Go module download completed (attempt $attempt/3)."
    exit 0
  fi

  if [[ "$attempt" -eq 3 ]]; then
    echo 'FAIL: Go module download failed on all 3 attempts; stopping before regression tests.' >&2
    exit 1
  fi

  echo "WARN: Go module download attempt $attempt/3 failed; retrying." >&2
  sleep "$((attempt * 5))"
done
