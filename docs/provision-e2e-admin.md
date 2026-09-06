# Provisioning the CI/CD Application Administrator

## Purpose

`provision-e2e-admin` is a database-internal, idempotent operation used by CI/CD to ensure that each deployed ERS environment has an authenticated application administrator.

It replaces the account-provisioning portion of `scripts/ers-b28c-prepare-test-data-final.sh` for deployed environments. It does not create People, Collaborators, secondary tenants, or other manual acceptance fixtures.

## Reconciled state

Each run ensures that:

- authorization actor `e2e-application-admin` exists and is active;
- the actor has an active `APPLICATION_ADMIN` grant at global control-plane scope `*`;
- `*` identifies the application control plane and does **not** authorize Tenant business-data access;
- one active authentication account is linked to that actor;
- the configured login is normalized and unique;
- the configured password is current;
- `must_change_password` is false; and
- existing sessions and password-reset tokens are invalidated when the login, password, or active state changes.

Running the operation again with unchanged input does not replace the password hash or revoke sessions.

## Secret handling

The operation reads one JSON object from standard input. The password is never accepted as a command-line argument and is never printed.

Example development invocation on the server:

```bash
payload="$(jq -cn \
    --arg actorKey "e2e-application-admin" \
    --arg displayName "Development E2E Administrator" \
    --arg login "e2e-admin-dev@enterpriseremotesystems.com" \
    --arg password "$E2E_ADMIN_PASSWORD" \
    '{actorKey: $actorKey, displayName: $displayName, login: $login, password: $password}')"

printf '%s' "$payload" |
  make server-dev-provision-e2e-admin
```

Production provisioning has an additional binary guard. The Make target supplies `--allow-production` only when `ENV=production`.

## GitHub environment configuration

Each GitHub environment must define this secret:

```text
E2E_ADMIN_PASSWORD
```

The password must satisfy the ERS authentication password requirements. No pre-existing administrator password is required: deployment creates the account or rotates it to this value.

Configure a unique password in each environment from a trusted local terminal:

```bash
gh secret set E2E_ADMIN_PASSWORD --env development
gh secret set E2E_ADMIN_PASSWORD --env test
gh secret set E2E_ADMIN_PASSWORD --env production
```

Each command prompts for the value without placing it in shell history.

An optional non-secret environment variable can override the default login:

```text
E2E_ADMIN_EMAIL
```

Defaults are:

| Environment | Default login |
|---|---|
| development | `e2e-admin-dev@enterpriseremotesystems.com` |
| test | `e2e-admin-tst@enterpriseremotesystems.com` |
| production | `e2e-admin@enterpriseremotesystems.com` |

## Deployment sequence

For development, test, and production, `deploy.yml` performs:

1. quality gates;
2. immutable revision checkout;
3. image build and application startup;
4. backend health verification;
5. administrator provisioning through the backend container; and
6. public smoke tests.

Development and test then run deployed Playwright using the provisioned login and the same environment secret. Production provisioning is performed, but deployed Playwright remains disabled.

## Failure behavior

Deployment stops before changing the server when `E2E_ADMIN_PASSWORD` is missing. Provisioning also stops on login ownership conflicts rather than relinking an account that belongs to another actor.
