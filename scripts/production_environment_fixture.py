"""Single non-secret Production environment-contract baseline for regression tests."""

PRODUCTION_ENV_VALUES = {
    "APP_ENV": "production",
    "DATABASE_PATH": "/app/data/app.db",
    "APP_AUTO_MIGRATE": "false",
    "AUTHZ_ACTOR_HEADER_MODE": "disabled",
    "AUTHZ_BOOTSTRAP_ENABLED": "false",
    "DEV_SEED_ADMIN": "false",
    "SERVER_OFFHOST_BACKUP_ENABLED": "true",
    "SERVER_OFFHOST_BACKUP_TRANSPORT": "s3",
    "SERVER_OFFHOST_BACKUP_S3_ENDPOINT": "https://hel1.your-objectstorage.com",
    "SERVER_OFFHOST_BACKUP_S3_REGION": "hel1",
    "SERVER_OFFHOST_BACKUP_S3_BUCKET": "ers",
    "SERVER_OFFHOST_BACKUP_S3_PREFIX": "ers-backups",
    "AWS_SHARED_CREDENTIALS_FILE": "/opt/EnterpriseRemoteSystems/secrets/aws-credentials",
    "AWS_PROFILE": "ers-backup",
}

def production_env_text(**overrides: str) -> str:
    values = {**PRODUCTION_ENV_VALUES, **overrides}
    return "".join(f"{key}={value}\n" for key, value in values.items())
