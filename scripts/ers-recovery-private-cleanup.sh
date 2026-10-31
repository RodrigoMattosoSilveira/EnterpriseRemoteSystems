#!/usr/bin/env bash
# Delete only the disposable SQLite copies from one ERS recovery rehearsal.
# Keep non-secret reports and logs for audit; no Docker prune or volume removal.
set -euo pipefail
[[ $# -eq 4 ]] || { echo 'cleanup requires root, run directory, container name, ownership flag' >&2; exit 2; }
root="$1"; run="$2"; container="$3"; owned="$4"
[[ "$owned" == true || "$owned" == false ]] || { echo 'Invalid owned flag' >&2; exit 2; }
[[ -d "$root" && ! -L "$root" && -d "$run" && ! -L "$run" ]] || { echo 'Unsafe cleanup directory or symlink' >&2; exit 2; }
root="$(cd "$root" && pwd -P)"
run="$(cd "$run" && pwd -P)"
[[ "$run" == "$root"/rehearsal-* && "$run" != "$root" ]] || {
  echo 'Refusing cleanup outside unique rehearsal directory' >&2; exit 2;
}
if [[ "$owned" == true ]]; then
  [[ "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo 'Unsafe container name' >&2; exit 2; }
  docker rm -f "$container" >/dev/null || { echo 'Unable to remove test-created container' >&2; exit 1; }
  if docker container inspect "$container" >/dev/null 2>&1; then
    echo 'Rehearsal container still exists after removal' >&2; exit 1
  fi
fi
find "$run" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' \) -delete
if find "$run" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' \) | grep -q .; then
  echo 'Private recovered SQLite files remain after disposal' >&2; exit 1
fi
printf 'PASS: rehearsal container removed and private SQLite copies disposed\n' > "$run/cleanup.txt"
chmod 600 "$run/cleanup.txt"
