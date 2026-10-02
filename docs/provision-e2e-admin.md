# Provisioning the CI/CD Application Administrator

## Purpose

`provision-e2e-admin` is a database-internal, idempotent **Development/Test-only** operation used by CI/CD to ensure that non-Production ERS environments have an authenticated application administrator and the E2E tenant fixtures required by automated verification.

Bite 33.1 makes this command unavailable in Production. It is test provisioning, not a Production administrator-lifecycle mechanism.

## Reconciled state

In Development or Test, each run ensures that:

- authorization actor `e2e-application-admin` exists and is active;
- the actor has an active `APPLICATION_ADMIN` grant at global control-plane scope `*`;
- `*` identifies the application control plane and does **not** authorize Tenant business-data access;
- one active authentication account is linked to that actor;
- the configured login is normalized and unique;
- the configured password is current;
- `must_change_password` is false;
- existing sessions and password-reset tokens are invalidated when login, password, or active state changes; and
- the deterministic E2E Tenant fixtures required by deployed tests are present.

Running the operation again with unchanged input does not replace the password hash or revoke sessions.

## Environment guard

`APP_ENV` must explicitly identify a non-Production environment:

```text
local | dev | development | test | testing | ci
```

`production`, `prod`, missing values, and unknown values are refused before the provisioning input is read or a database is opened. There is no Production override flag.

The generic Make target is therefore limited to:

```bash
make server-provision-e2e-admin ENV=development < provision.json
make server-provision-e2e-admin ENV=test < provision.json
```

`make server-prod-provision-e2e-admin` exists only as an explicit refusal target so an old operational command cannot silently become destructive.

## Secret handling

The operation reads one JSON object from standard input. The password is never accepted as a command-line argument and is never printed.

Example Development invocation on the server:

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

## GitHub environment configuration

Development and Test GitHub environments require:

```text
E2E_ADMIN_PASSWORD
```

An optional non-secret `E2E_ADMIN_EMAIL` may override the default Development/Test login.

Production deployment does not resolve or use an E2E administrator password or login. Production administrator lifecycle must use an operationally controlled non-test workflow.

## Deployment sequence

For Development and Test, `deploy.yml` performs the quality gates, immutable revision checkout, image build/startup, health and migration verification, E2E administrator/fixture provisioning, and public/deployed automated checks.

For Production, the deployment workflow performs the Production deployment and verification steps but **skips E2E/test administrator provisioning**. Deployed Playwright also remains disabled in Production.

## Failure behavior

Provisioning stops immediately when environment identity is missing, unknown, or Production. Development/Test deployment also stops when its required E2E administrator secret is missing. Login ownership conflicts continue to fail rather than relinking an account that belongs to another actor.
