#!/usr/bin/env bash
set -euo pipefail
for tool in python3 openssl sqlite3 docker sha256sum stat bash; do
  command -v "$tool" >/dev/null || { echo "ERS_GATEB DEPENDENCY_MISSING $tool FAIL" >&2; exit 1; }
done
python3 - <<'PY'
import hashlib, json, secrets, sqlite3, ssl, sys
assert sys.version_info[:2] == (3, 12), sys.version
with sqlite3.connect(':memory:') as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert len(secrets.token_bytes(32)) == 32
assert hashlib.sha256(b'ERS').hexdigest()
PY
openssl version >/dev/null
# Test the algorithm the two-owner approval protocol requires.
openssl genpkey -algorithm ED25519 -out /tmp/gateb-key.pem 2>/dev/null
openssl pkey -in /tmp/gateb-key.pem -pubout -out /tmp/gateb-pub.pem 2>/dev/null
printf 'ERS gate B test' >/tmp/gateb-message
openssl pkeyutl -sign -rawin -inkey /tmp/gateb-key.pem -in /tmp/gateb-message -out /tmp/gateb-signature 2>/dev/null
openssl pkeyutl -verify -rawin -pubin -inkey /tmp/gateb-pub.pem -in /tmp/gateb-message -sigfile /tmp/gateb-signature >/dev/null 2>&1
rm -f /tmp/gateb-key.pem /tmp/gateb-pub.pem /tmp/gateb-message /tmp/gateb-signature
python3 - <<'PYAST'
import ast, pathlib
for path in pathlib.Path("/opt/ers/scripts").glob("*.py"):
    ast.parse(path.read_text(), filename=str(path))
PYAST
echo 'ERS_GATEB DEPENDENCIES PASS'
