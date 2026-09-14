#!/usr/bin/env bash
set -euo pipefail

domain="${1:-}"
if [[ -z "$domain" ]]; then
  echo "Usage: $0 <domain>" >&2
  exit 2
fi

attempts="${SERVER_SMOKE_ATTEMPTS:-12}"
delay_seconds="${SERVER_SMOKE_DELAY_SECONDS:-5}"
connect_timeout_seconds="${SERVER_SMOKE_CONNECT_TIMEOUT_SECONDS:-5}"
max_time_seconds="${SERVER_SMOKE_MAX_TIME_SECONDS:-15}"
curl_bin="${CURL_BIN:-curl}"
sleep_bin="${SLEEP_BIN:-sleep}"

if ! [[ "$attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "SERVER_SMOKE_ATTEMPTS must be a positive integer; got '$attempts'." >&2
  exit 2
fi
for value_name in SERVER_SMOKE_DELAY_SECONDS SERVER_SMOKE_CONNECT_TIMEOUT_SECONDS SERVER_SMOKE_MAX_TIME_SECONDS; do
  value="${!value_name:-}"
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "$value_name must be a non-negative integer; got '$value'." >&2
    exit 2
  fi
done

url="https://${domain}/healthz"
last_rc=1

for ((attempt = 1; attempt <= attempts; attempt++)); do
  echo "Public smoke attempt ${attempt}/${attempts}: ${url}"

  set +e
  "$curl_bin" \
    -fsS \
    --connect-timeout "$connect_timeout_seconds" \
    --max-time "$max_time_seconds" \
    "$url" >/dev/null
  rc=$?
  set -e

  if (( rc == 0 )); then
    echo "${domain} public smoke tests passed on attempt ${attempt}/${attempts}."
    exit 0
  fi

  last_rc=$rc
  case "$rc" in
    6) reason="DNS resolution failed" ;;
    7) reason="connection failed" ;;
    22) reason="HTTP response was 400 or greater" ;;
    28) reason="request timed out" ;;
    35) reason="TLS handshake failed" ;;
    *) reason="curl failed" ;;
  esac
  echo "Public smoke attempt ${attempt}/${attempts} failed: ${reason} (curl exit ${rc})." >&2

  if (( attempt < attempts )); then
    echo "Retrying in ${delay_seconds}s..."
    "$sleep_bin" "$delay_seconds"
  fi
done

echo "Public smoke failed after ${attempts} attempts for ${url}." >&2
echo "Resolver diagnostics for ${domain}:" >&2

if command -v getent >/dev/null 2>&1; then
  getent ahosts "$domain" >&2 || true
fi
if command -v resolvectl >/dev/null 2>&1; then
  resolvectl query "$domain" >&2 || true
fi
if [[ -r /etc/resolv.conf ]]; then
  echo "--- /etc/resolv.conf ---" >&2
  cat /etc/resolv.conf >&2
fi

exit "$last_rc"
