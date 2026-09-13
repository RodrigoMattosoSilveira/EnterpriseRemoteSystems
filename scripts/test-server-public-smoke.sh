#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
smoke_script="${repo_root}/scripts/server-public-smoke.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT INT TERM

fake_curl="${tmpdir}/fake-curl"
cat > "$fake_curl" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
state_file="${FAKE_CURL_STATE_FILE:?}"
failures_before_success="${FAKE_CURL_FAILURES_BEFORE_SUCCESS:?}"
count=0
if [[ -f "$state_file" ]]; then
  count="$(cat "$state_file")"
fi
count=$((count + 1))
printf '%s\n' "$count" > "$state_file"
if (( count <= failures_before_success )); then
  echo "curl: (6) Could not resolve host: example.invalid" >&2
  exit 6
fi
exit 0
FAKE
chmod +x "$fake_curl"

state_file="${tmpdir}/transient-state"
FAKE_CURL_STATE_FILE="$state_file" \
FAKE_CURL_FAILURES_BEFORE_SUCCESS=2 \
CURL_BIN="$fake_curl" \
SERVER_SMOKE_ATTEMPTS=3 \
SERVER_SMOKE_DELAY_SECONDS=0 \
SERVER_SMOKE_CONNECT_TIMEOUT_SECONDS=1 \
SERVER_SMOKE_MAX_TIME_SECONDS=1 \
bash "$smoke_script" example.invalid >/dev/null 2>&1

if [[ "$(cat "$state_file")" != "3" ]]; then
  echo "Transient DNS smoke test did not retry exactly twice before succeeding." >&2
  exit 1
fi

state_file="${tmpdir}/persistent-state"
if FAKE_CURL_STATE_FILE="$state_file" \
  FAKE_CURL_FAILURES_BEFORE_SUCCESS=99 \
  CURL_BIN="$fake_curl" \
  SERVER_SMOKE_ATTEMPTS=2 \
  SERVER_SMOKE_DELAY_SECONDS=0 \
  SERVER_SMOKE_CONNECT_TIMEOUT_SECONDS=1 \
  SERVER_SMOKE_MAX_TIME_SECONDS=1 \
  bash "$smoke_script" example.invalid >/dev/null 2>&1; then
  echo "Persistent DNS failure unexpectedly passed the public smoke check." >&2
  exit 1
fi

if [[ "$(cat "$state_file")" != "2" ]]; then
  echo "Persistent DNS smoke test did not stop after the configured attempt count." >&2
  exit 1
fi

echo "Server public smoke retry checks passed."
