#!/usr/bin/env bash
# IT-03 one-time Test storage provisioning and repeatable Test preflight.
# Deployed Test Linux/bash only. Never operates on Production.
set -euo pipefail
umask 077
TEST_DIR=/opt/EnterpriseRemoteSystems/test
SECRET_DIR=/opt/EnterpriseRemoteSystems/test-secrets
CRED_FILE="$SECRET_DIR/aws-credentials-test"
ENV_FILE="$TEST_DIR/.env.test"
PROFILE=ers-test-backup

blocked() { printf 'BLOCKED: %s\n' "$*" >&2; exit 2; }
privileged() { if (( EUID == 0 )); then "$@"; else command -v sudo >/dev/null || blocked 'sudo is required'; sudo "$@"; fi; }
checkout_guard() {
  [[ "$(pwd -P)" == "$TEST_DIR" ]] || blocked "run from the deployed Test checkout: $TEST_DIR"
  [[ "$(git branch --show-current 2>/dev/null)" == test ]] || blocked 'the current branch is not test'
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || blocked 'missing or symlinked .env.test'
  [[ "$(env_count APP_ENV)" == 1 && "$(env_value APP_ENV)" == test ]] || blocked 'APP_ENV is not exactly test'
}
env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { x=substr($0,index($0,"=")+1); n++ } END { if(n==1) print x }' "$ENV_FILE"
}
env_count() { grep -Ec "^${1}=" "$ENV_FILE" || :; }
require_key() {
  local key="$1" expected="$2" got
  [[ "$(env_count "$key")" == 1 ]] || blocked "missing or duplicate $key in .env.test"
  got="$(env_value "$key")"
  [[ "$got" == "$expected" ]] || blocked "$key is not the required Test value"
}
preflight() {
  checkout_guard
  require_key APP_ENV test
  require_key SERVER_OFFHOST_BACKUP_ENABLED true
  require_key SERVER_OFFHOST_BACKUP_TRANSPORT s3
  require_key AWS_SHARED_CREDENTIALS_FILE "$CRED_FILE"
  require_key AWS_PROFILE "$PROFILE"
  local region endpoint bucket prefix
  for key in SERVER_OFFHOST_BACKUP_S3_ENDPOINT SERVER_OFFHOST_BACKUP_S3_REGION SERVER_OFFHOST_BACKUP_S3_BUCKET SERVER_OFFHOST_BACKUP_S3_PREFIX; do
    [[ "$(env_count "$key")" == 1 ]] || blocked "missing or duplicate $key"
  done
  region="$(env_value SERVER_OFFHOST_BACKUP_S3_REGION)"
  [[ "$region" =~ ^(fsn1|nbg1|hel1)$ ]] || blocked 'unapproved Hetzner region'
  endpoint="$(env_value SERVER_OFFHOST_BACKUP_S3_ENDPOINT)"
  [[ "$endpoint" == "https://${region}.your-objectstorage.com" ]] || blocked 'Hetzner HTTPS endpoint does not match region'
  bucket="$(env_value SERVER_OFFHOST_BACKUP_S3_BUCKET)"
  [[ "$bucket" =~ ^[a-z0-9][a-z0-9-]{2,62}$ && "$bucket" != *- ]] || blocked 'invalid bucket name'
  prefix="$(env_value SERVER_OFFHOST_BACKUP_S3_PREFIX)"
  [[ "$prefix" =~ ^[a-zA-Z0-9_/-]+$ && "$prefix" != /* && "$prefix" != */ && "$prefix" != *//* ]] || blocked 'invalid object prefix'
  [[ -f "$CRED_FILE" && ! -L "$CRED_FILE" ]] || blocked 'Test S3 credentials file missing/not regular or symlinked'
  [[ "$(stat -c %a "$CRED_FILE")" == 600 ]] || blocked 'Test S3 credential file permissions must be 600'
  [[ "$(stat -c %U "$CRED_FILE")" == root ]] || blocked 'Test S3 credential file must be root owned'
  [[ "$(stat -c %a "$SECRET_DIR")" == 711 && "$(stat -c %U "$SECRET_DIR")" == root ]] || blocked 'secret directory must be root owned and mode 711'
  [[ ! -L "$SECRET_DIR" ]] || blocked 'secret directory may not be a symlink'
  printf 'PASS: IT-03 Test configuration, external credential location, and host permissions verified\n'
  ERS_BACKUP_ENV_DIR="$TEST_DIR" ERS_BACKUP_ENV_FILE=.env.test ERS_BACKUP_COMPOSE_PROJECT=ers-tst \
    ./scripts/run-backup-go-tool.sh ers-offhost-backup check-config \
    --environment test --env-file "$ENV_FILE" --runtime-files \
    || blocked 'deployed Go off-host check-config failed'
  printf 'PASS: IT-03 Test Go off-host configuration and credentials profile validated\n'
  printf 'READY FOR AUTHORIZED TEST BACKUP (NOT YET A BACKUP OR REMOTE RESTORE PASS)\n'
}
install_credentials() {
  checkout_guard
  [[ -t 0 ]] || blocked 'interactive terminal required to enter secrets privately'
  [[ ! -e "$CRED_FILE" && ! -L "$CRED_FILE" ]] || blocked 'Test credential file already exists; refuse overwrite/rotation'
  local approval access secret staging
  read -r -p 'Approved Test storage/credential change reference (empty cancels): ' approval
  [[ -n "${approval//[[:space:]]/}" ]] || blocked 'approval reference required'
  privileged install -d -m 711 -o root -g root "$SECRET_DIR"
  staging="$(mktemp)" || blocked 'cannot prepare private temporary file'
  chmod 600 "$staging"
  trap 'rm -f -- "${staging:-}"; unset access secret' EXIT
  read -r -s -p 'Paste TEST S3 access key (hidden): ' access; printf '\n'
  read -r -s -p 'Paste TEST S3 secret key (hidden): ' secret; printf '\n'
  [[ -n "$access" && -n "$secret" && "$access" != *$'\n'* && "$secret" != *$'\n'* && "$access" != *=* && "$secret" != *=* ]] || blocked 'invalid or empty key input'
  printf '[%s]\naws_access_key_id=%s\naws_secret_access_key=%s\n' "$PROFILE" "$access" "$secret" > "$staging"
  unset access secret
  privileged install -m 600 -o root -g root "$staging" "$CRED_FILE"
  printf 'PASS: new Test-only credential file installed outside Git (reference %s); secrets not printed\n' "$approval"
  printf 'STOP: complete configuration and run preflight before using storage\n'
}
configure() {
  checkout_guard
  [[ -t 0 ]] || blocked 'interactive Test operator required for configuration change'
  [[ -w "$ENV_FILE" && -w "$TEST_DIR" ]] || blocked 'Test .env.test or directory is not writable; use approved change-control procedure'
  local approval region bucket prefix endpoint backup tmp
  read -r -p 'Approved Test S3 configuration change reference (empty cancels): ' approval
  [[ -n "${approval//[[:space:]]/}" ]] || blocked 'approval reference required'
  read -r -p 'Approved Hetzner Test region (fsn1/nbg1/hel1): ' region
  [[ "$region" =~ ^(fsn1|nbg1|hel1)$ ]] || blocked 'invalid Test region'
  read -r -p 'Approved dedicated Test bucket (NOT Production): ' bucket
  [[ "$bucket" =~ ^[a-z0-9][a-z0-9-]{2,62}$ && "$bucket" != *- ]] || blocked 'invalid Test bucket'
  read -r -p 'Approved Test-only prefix (e.g. ers-backups): ' prefix
  [[ "$prefix" =~ ^[a-zA-Z0-9_/-]+$ && "$prefix" != /* && "$prefix" != */ && "$prefix" != *//* ]] || blocked 'invalid Test prefix'
  read -r -p "Confirm bucket '$bucket' is NOT Production, isolated by project/policy, versioned, and approved? Type APPROVED-TEST: " answer
  [[ "$answer" == APPROVED-TEST ]] || blocked 'Test bucket separation/versioning not confirmed'
  endpoint="https://${region}.your-objectstorage.com"
  privileged install -d -m 711 -o root -g root "$SECRET_DIR"
  backup="$SECRET_DIR/env-test-pre-it03-$(date -u +%Y%m%dT%H%M%SZ)-$$.bak"
  privileged install -m 600 -o root -g root "$ENV_FILE" "$backup"
  tmp="$(mktemp "$TEST_DIR/.env.test.it03.XXXXXXXX")"
  trap 'rm -f -- "${tmp:-}"' EXIT
  awk -v region="$region" -v bucket="$bucket" -v prefix="$prefix" -v endpoint="$endpoint" \
    -v cred="$CRED_FILE" -v profile="$PROFILE" '
  BEGIN {
    split("SERVER_OFFHOST_BACKUP_ENABLED SERVER_OFFHOST_BACKUP_TRANSPORT SERVER_OFFHOST_BACKUP_S3_ENDPOINT SERVER_OFFHOST_BACKUP_S3_REGION SERVER_OFFHOST_BACKUP_S3_BUCKET SERVER_OFFHOST_BACKUP_S3_PREFIX AWS_SHARED_CREDENTIALS_FILE AWS_PROFILE", names, " ")
    for (i in names) replace[names[i]]=1
  }
  { x=$0; sub(/=.*/, "", x); if (!(x in replace)) print $0 }
  END {
    print "SERVER_OFFHOST_BACKUP_ENABLED=true"
    print "SERVER_OFFHOST_BACKUP_TRANSPORT=s3"
    print "SERVER_OFFHOST_BACKUP_S3_ENDPOINT=" endpoint
    print "SERVER_OFFHOST_BACKUP_S3_REGION=" region
    print "SERVER_OFFHOST_BACKUP_S3_BUCKET=" bucket
    print "SERVER_OFFHOST_BACKUP_S3_PREFIX=" prefix
    print "AWS_SHARED_CREDENTIALS_FILE=" cred
    print "AWS_PROFILE=" profile
  }' "$ENV_FILE" > "$tmp"
  chmod 600 "$tmp"
  mv -f -- "$tmp" "$ENV_FILE"
  printf 'PASS: Test off-host configuration updated under %s\n' "$approval"
  printf 'PRIVATE ROLLBACK COPY (contains all .env.test values; do not share): %s\n' "$backup"
  printf 'STOP: run preflight; do not assume bucket access is proven\n'
}
case "${1:-}" in
  preflight) preflight ;;
  install-credentials) install_credentials ;;
  configure) configure ;;
  *) printf 'usage: %s preflight|install-credentials|configure (Test Linux/bash only)\n' "$0" >&2; exit 2 ;;
esac
