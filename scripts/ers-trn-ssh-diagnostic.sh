#!/usr/bin/env bash
# Diagnostic only: no deployment, server writes, or credential changes.
# All secret values remain in GitHub environment variables / disposable runner files.
set -euo pipefail
umask 077

blocked() {
  printf 'BLOCKED: %s\n' "$1" >&2
  exit 2
}

[[ "${TRN_DIAGNOSTIC_CONFIRMATION:-}" == 'DIAGNOSE-TRAINING-SSH-ONLY' ]] || blocked 'Explicit diagnostic confirmation is missing.'
[[ -n "${TRN_SSH_PRIVATE_KEY:-}" ]] || blocked 'DEPLOY_SSH_PRIVATE_KEY is missing from the effective Training secret scope.'
[[ -f "${TRN_TEST_STYLE_KEY_FILE:-}" ]] || blocked 'Test-style secret materialization file missing.'
[[ -n "${TRN_SSH_KNOWN_HOSTS:-}" ]] || blocked 'DEPLOY_KNOWN_HOSTS is missing.'
[[ -n "${TRN_DEPLOY_HOST:-}" && "${TRN_DEPLOY_HOST}" != deploy_host ]] || blocked 'DEPLOY_HOST is missing or a placeholder.'
[[ "${TRN_DEPLOY_HOST}" =~ ^[a-zA-Z0-9][a-zA-Z0-9._:-]*$ ]] || blocked 'DEPLOY_HOST is not a plain DNS name or numeric address.'
[[ "${TRN_DEPLOY_USER:-}" =~ ^[a-z_][a-z0-9_-]*\$?$ ]] || blocked 'DEPLOY_USER has an unsupported format.'
command -v ssh-keygen >/dev/null 2>&1 || blocked 'OpenSSH ssh-keygen is unavailable on the runner.'
command -v ssh >/dev/null 2>&1 || blocked 'OpenSSH ssh is unavailable on the runner.'

case "${TRN_SSH_PRIVATE_KEY}" in
  ops_*) blocked 'DEPLOY_SSH_PRIVATE_KEY contains a 1Password service-account token, not an SSH private key.' ;;
  ssh-*) blocked 'DEPLOY_SSH_PRIVATE_KEY contains an SSH public key, not a private key.' ;;
esac

scratch="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ers-trn-ssh-diagnostic.XXXXXXXX")" || blocked 'Could not create disposable credential storage.'
cleanup() {
  # Only our own temporary directory, never ~/.ssh or any server path.
  rm -f -- "$scratch/id_ed25519" "$scratch/known_hosts"
  rmdir -- "$scratch" 2>/dev/null || true
}
trap cleanup EXIT

key="$scratch/id_ed25519"
known_hosts="$scratch/known_hosts"
printf '%s\n' "$TRN_SSH_PRIVATE_KEY" > "$key"
printf '%s\n' "$TRN_SSH_KNOWN_HOSTS" > "$known_hosts"
chmod 600 "$key" "$known_hosts"

# Compare real OpenSSH parsing of the two ways GitHub workflows materialize
# the same effective secret. Never print key contents, fingerprints, or errors.
# The second file is created by the workflow using Test's existing heredoc syntax.
env_ok=false
inline_ok=false
if ssh-keygen -y -P '' -f "$key" >/dev/null 2>&1; then env_ok=true; fi
if ssh-keygen -y -P '' -f "$TRN_TEST_STYLE_KEY_FILE" >/dev/null 2>&1; then inline_ok=true; fi
if [[ "$env_ok" == false && "$inline_ok" == true ]]; then
  blocked 'Test-style heredoc key loads, but Training environment-variable key does not. No SSH connection was attempted.'
fi
if [[ "$env_ok" == true && "$inline_ok" == false ]]; then
  blocked 'Training environment-variable key loads, but Test-style heredoc key does not. No SSH connection was attempted.'
fi
if [[ "$env_ok" == false && "$inline_ok" == false ]]; then
  blocked 'Both key-writing methods produce keys OpenSSH cannot load with an empty passphrase. The value may be invalid, incomplete, or encrypted. No SSH connection was attempted.'
fi
if ! cmp -s -- "$key" "$TRN_TEST_STYLE_KEY_FILE"; then
  blocked 'Both keys load but their bytes differ between writing methods. No SSH connection was attempted.'
fi
printf 'PASS: Test-style and environment-variable SSH key files both load and are byte-identical.\n'

# The pin must name the exact destination; ssh-keyscan alone is not a trusted pin.
if ! ssh-keygen -F "$TRN_DEPLOY_HOST" -f "$known_hosts" >/dev/null 2>&1; then
  blocked 'DEPLOY_KNOWN_HOSTS has no pinned entry for the configured Training host. No SSH connection was attempted.'
fi
printf 'PASS: Training host has a known_hosts entry (independent fingerprint provenance remains required).\n'

# The remote command is exactly `true`: no repository change, DB operation,
# Docker invocation, release marker read, migration, backup, or deployment.
# Agent use and password prompts are explicitly disabled.
if ! ssh -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none \
    -o PreferredAuthentications=publickey -o PasswordAuthentication=no \
    -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null \
    -o "UserKnownHostsFile=$known_hosts" -o ConnectTimeout=10 \
    -o ConnectionAttempts=1 -o NumberOfPasswordPrompts=0 \
    -i "$key" -- "${TRN_DEPLOY_USER}@${TRN_DEPLOY_HOST}" true \
    >/dev/null 2>&1; then
  blocked 'Read-only SSH login failed with this key and pinned host. No deployment occurred; check authorized_keys, destination or host pin through approved custody.'
fi
printf 'PASS: Noninteractive, pinned, read-only SSH authentication succeeded. No deployment was performed.\n'
