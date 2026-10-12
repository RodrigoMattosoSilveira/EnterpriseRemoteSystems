#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECOVERY_ACCESS_ENVIRONMENT="${RECOVERY_ACCESS_ENVIRONMENT:-production}"
RECOVERY_ACCESS_ENV_DIR="${RECOVERY_ACCESS_ENV_DIR:-}"
RECOVERY_ACCESS_ENV_FILE="${RECOVERY_ACCESS_ENV_FILE:-.env.production}"
RECOVERY_ACCESS_MANIFEST_FILE="${RECOVERY_ACCESS_MANIFEST_FILE:-}"

case "$(printf '%s' "$RECOVERY_ACCESS_ENVIRONMENT" | tr '[:upper:]' '[:lower:]')" in
  production|prod) RECOVERY_ACCESS_ENVIRONMENT="production" ;;
  *)
    echo "Owner-unavailable recovery access preflight is a Production recovery contract; ENV must be production." >&2
    exit 2
    ;;
esac

[[ -n "$RECOVERY_ACCESS_ENV_DIR" ]] || { echo "RECOVERY_ACCESS_ENV_DIR is required." >&2; exit 2; }
RECOVERY_ACCESS_ENV_DIR="$(cd "$RECOVERY_ACCESS_ENV_DIR" && pwd -P)"
if [[ -z "$RECOVERY_ACCESS_MANIFEST_FILE" ]]; then
  RECOVERY_ACCESS_MANIFEST_FILE="$RECOVERY_ACCESS_ENV_DIR/ops/recovery-access.production.env"
fi
[[ -f "$RECOVERY_ACCESS_MANIFEST_FILE" ]] || {
  echo "Owner-unavailable recovery access manifest is missing: $RECOVERY_ACCESS_MANIFEST_FILE" >&2
  exit 2
}
ENV_PATH="$RECOVERY_ACCESS_ENV_DIR/$RECOVERY_ACCESS_ENV_FILE"
[[ -f "$ENV_PATH" ]] || {
  echo "Canonical restored Production environment file is missing: $ENV_PATH" >&2
  exit 2
}

read_value() {
  local file="$1" key="$2" count line value
  count="$(grep -Ec "^[[:space:]]*${key}=" "$file" || true)"
  if [[ "$count" -ne 1 ]]; then
    echo "Recovery access contract requires exactly one ${key}= entry in $file; found $count." >&2
    exit 2
  fi
  line="$(grep -E "^[[:space:]]*${key}=" "$file")"
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s\n' "$value"
}

required_manifest_keys=(
  RECOVERY_ACCESS_FORMAT_VERSION
  RECOVERY_OWNER_UNAVAILABLE_REQUIRED
  RECOVERY_SHARED_SECRETS_PROVIDER
  RECOVERY_SHARED_COLLECTION
  RECOVERY_REPOSITORY_SLUG
  RECOVERY_REPOSITORY_URL
  RECOVERY_REPOSITORY_SOURCE
  RECOVERY_PRODUCTION_ENV_SOURCE
  RECOVERY_S3_CREDENTIAL_SOURCE
  RECOVERY_HOST_ACCESS_SOURCE
  RECOVERY_HETZNER_CONSOLE_SOURCE
  RECOVERY_DNS_SOURCE
  RECOVERY_MFA_RECOVERY_SOURCE
  RECOVERY_EDGE_SOURCE
  RECOVERY_REPOSITORY_INSTALL_PATH
  RECOVERY_PRODUCTION_ENV_INSTALL_PATH
  RECOVERY_S3_CREDENTIAL_INSTALL_PATH
  RECOVERY_EDGE_INSTALL_PATH
  RECOVERY_PRODUCTION_DOMAIN
  RECOVERY_DNS_DOMAIN
  RECOVERY_S3_ENDPOINT
  RECOVERY_S3_REGION
  RECOVERY_S3_BUCKET
  RECOVERY_S3_PROFILE
  RECOVERY_SHARED_ACCESS_POLICY
  RECOVERY_MFA_POLICY
)
for key in "${required_manifest_keys[@]}"; do
  value="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" "$key")"
  [[ -n "$value" ]] || { echo "Recovery access manifest value is empty: $key" >&2; exit 2; }
done

[[ "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_ACCESS_FORMAT_VERSION)" == "1" ]] || {
  echo "Unsupported recovery access manifest format version." >&2
  exit 2
}
[[ "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_OWNER_UNAVAILABLE_REQUIRED)" == "true" ]] || {
  echo "Recovery access manifest must explicitly require owner-unavailable recovery." >&2
  exit 2
}
[[ "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_SHARED_SECRETS_PROVIDER)" == "LastPass" ]] || {
  echo "Recovery access manifest must identify LastPass as the shared secret source for this ERS deployment." >&2
  exit 2
}
[[ "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_SHARED_ACCESS_POLICY)" == "technician-access-independent-of-owner" ]] || {
  echo "Recovery access policy must require technician access independent of the owner." >&2
  exit 2
}
[[ "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_MFA_POLICY)" == "must-not-depend-on-owner-device-or-approval" ]] || {
  echo "Recovery MFA policy must not depend on the owner's device or approval." >&2
  exit 2
}

source_keys=(
  RECOVERY_PRODUCTION_ENV_SOURCE
  RECOVERY_S3_CREDENTIAL_SOURCE
  RECOVERY_HOST_ACCESS_SOURCE
  RECOVERY_HETZNER_CONSOLE_SOURCE
  RECOVERY_DNS_SOURCE
)
for key in "${source_keys[@]}"; do
  value="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" "$key")"
  case "$value" in
    lastpass-shared://*) ;;
    *) echo "$key must identify an explicit lastpass-shared:// source; got: $value" >&2; exit 2 ;;
  esac
  lower="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  if [[ "$lower" == *"normal-administrative"* || "$lower" == *"normal administrative"* || "$lower" == *"personal-vault"* || "$lower" == *"tbd"* || "$lower" == *"todo"* || "$value" == *"<"* || "$value" == *">"* ]]; then
    echo "$key is too vague or depends on a personal/unconfigured source: $value" >&2
    exit 2
  fi
done

mfa_source="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_MFA_RECOVERY_SOURCE)"
case "$mfa_source" in
  technician-controlled://*) ;;
  *) echo "RECOVERY_MFA_RECOVERY_SOURCE must document technician-controlled independent MFA/recovery material; got: $mfa_source" >&2; exit 2 ;;
esac

expected_slug="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_REPOSITORY_SLUG)"
expected_repo_url="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_REPOSITORY_URL)"
remote_url="$(git -C "$RECOVERY_ACCESS_ENV_DIR" remote get-url origin 2>/dev/null || true)"
if [[ -z "$remote_url" || "$remote_url" != *"$expected_slug"* ]]; then
  echo "Repository origin does not match documented shared GitHub source. Expected repository: $expected_repo_url; actual origin: ${remote_url:-missing}." >&2
  exit 2
fi
revision="$(git -C "$RECOVERY_ACCESS_ENV_DIR" rev-parse HEAD)"
tree_sha="$(git -C "$RECOVERY_ACCESS_ENV_DIR" rev-parse HEAD^{tree})"
[[ "$revision" =~ ^[0-9a-f]{40}$ && "$tree_sha" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Repository revision/tree evidence is not a full Git object ID." >&2
  exit 2
}

for repo_file in edge/Caddyfile edge/docker-compose.edge.yml deploy/Caddyfile docker-compose.server.yml; do
  [[ -f "$RECOVERY_ACCESS_ENV_DIR/$repo_file" ]] || {
    echo "Repository recovery prerequisite is missing: $repo_file" >&2
    exit 2
  }
done

manifest_repository_install_path="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_REPOSITORY_INSTALL_PATH)"
manifest_env_install_path="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_PRODUCTION_ENV_INSTALL_PATH)"
manifest_domain="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_PRODUCTION_DOMAIN)"
manifest_endpoint="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_S3_ENDPOINT)"
manifest_region="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_S3_REGION)"
manifest_bucket="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_S3_BUCKET)"
manifest_profile="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_S3_PROFILE)"
manifest_credential_path="$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_S3_CREDENTIAL_INSTALL_PATH)"

"$ROOT_DIR/scripts/ers-environment-guard.sh" require-server-contract production "$ENV_PATH"

[[ "$RECOVERY_ACCESS_ENV_DIR" == "$manifest_repository_install_path" ]] || { echo "Production repository install path does not match recovery access manifest: expected $manifest_repository_install_path, got $RECOVERY_ACCESS_ENV_DIR." >&2; exit 2; }
[[ "$ENV_PATH" == "$manifest_env_install_path" ]] || { echo "Production environment install path does not match recovery access manifest: expected $manifest_env_install_path, got $ENV_PATH." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" APP_ENV)" == "production" ]] || { echo "Restored environment file must declare APP_ENV=production." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" APP_DOMAIN)" == "$manifest_domain" ]] || { echo "Restored APP_DOMAIN does not match recovery access manifest." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" APP_AUTO_MIGRATE)" == "false" ]] || { echo "Restored Production APP_AUTO_MIGRATE must be false." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" DATABASE_PATH)" == "/app/data/app.db" ]] || { echo "Restored Production DATABASE_PATH must be /app/data/app.db." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" CONTAINER_PREFIX)" == "ers-prd" ]] || { echo "Restored Production CONTAINER_PREFIX must be ers-prd." >&2; exit 2; }
[[ -n "$(read_value "$ENV_PATH" JWT_SECRET)" ]] || { echo "Restored canonical Production JWT_SECRET is missing; do not generate a replacement as recovery." >&2; exit 2; }
[[ -n "$(read_value "$ENV_PATH" JWT_ISSUER)" ]] || { echo "Restored canonical Production JWT_ISSUER is missing." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" CORS_ALLOW_ORIGINS)" == "https://$manifest_domain" ]] || { echo "Restored Production CORS_ALLOW_ORIGINS must match https://$manifest_domain." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" SERVER_OFFHOST_BACKUP_ENABLED)" == "true" ]] || { echo "Restored Production off-host backup must be enabled." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" SERVER_OFFHOST_BACKUP_TRANSPORT)" == "s3" ]] || { echo "Restored Production off-host transport must be s3." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" SERVER_OFFHOST_BACKUP_S3_ENDPOINT)" == "$manifest_endpoint" ]] || { echo "Restored S3 endpoint does not match recovery access manifest." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" SERVER_OFFHOST_BACKUP_S3_REGION)" == "$manifest_region" ]] || { echo "Restored S3 region does not match recovery access manifest." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" SERVER_OFFHOST_BACKUP_S3_BUCKET)" == "$manifest_bucket" ]] || { echo "Restored S3 bucket does not match recovery access manifest." >&2; exit 2; }
[[ "$(read_value "$ENV_PATH" AWS_PROFILE)" == "$manifest_profile" ]] || { echo "Restored AWS profile does not match recovery access manifest." >&2; exit 2; }
credential_path="$(read_value "$ENV_PATH" AWS_SHARED_CREDENTIALS_FILE)"
[[ "$credential_path" == "$manifest_credential_path" ]] || { echo "Restored AWS credentials path does not match recovery access manifest." >&2; exit 2; }
[[ -f "$credential_path" ]] || { echo "Restored shared S3 credentials file is missing: $credential_path" >&2; exit 2; }
grep -q "^\[$manifest_profile\]$" "$credential_path" || { echo "Restored S3 credentials file does not contain profile [$manifest_profile]." >&2; exit 2; }

credential_mode="$(stat -f '%Lp' "$credential_path" 2>/dev/null || stat -c '%a' "$credential_path" 2>/dev/null || true)"
if [[ -n "$credential_mode" ]]; then
  case "$credential_mode" in
    *00) ;;
    *)
      echo "S3 credentials file must not be group/world accessible; mode is $credential_mode." >&2
      exit 2
      ;;
  esac
fi

printf 'Owner-unavailable recovery access preflight passed.\n'
printf 'Repository source: %s\n' "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_REPOSITORY_SOURCE)"
printf 'Repository revision: %s\n' "$revision"
printf 'Repository tree: %s\n' "$tree_sha"
printf 'Production environment source: %s\n' "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_PRODUCTION_ENV_SOURCE)"
printf 'S3 credential source: %s\n' "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_S3_CREDENTIAL_SOURCE)"
printf 'Host access source: %s\n' "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_HOST_ACCESS_SOURCE)"
printf 'Hetzner console source: %s\n' "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_HETZNER_CONSOLE_SOURCE)"
printf 'DNS source: %s\n' "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_DNS_SOURCE)"
printf 'MFA recovery source: %s\n' "$(read_value "$RECOVERY_ACCESS_MANIFEST_FILE" RECOVERY_MFA_RECOVERY_SOURCE)"
printf 'S3 target: %s / %s / %s\n' "$manifest_endpoint" "$manifest_region" "$manifest_bucket"
printf 'This preflight validates restored artifacts and documented shared locators. The owner-unavailable rehearsal additionally proves exact-version S3 database recovery and application boot.\n'
