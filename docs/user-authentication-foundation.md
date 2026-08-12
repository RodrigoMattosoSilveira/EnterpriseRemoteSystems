# Bite 28B — User Authentication Foundation

## Scope

Bite 28B establishes login-backed identity without changing the authorization
transport used by existing business routes. Bite 27 authorization remains
authoritative through persisted actors and temporary actor headers until Bite
28C performs the authenticated authorization cutover.

## Data model

### `auth_user_accounts`

Each authentication account is linked one-to-one to an existing
`authz_actors` record.

- `login` is normalized to lowercase and is case-insensitively unique.
- only a bcrypt password hash is stored;
- account activation is independent from actor activation;
- either an inactive account or inactive actor prevents login;
- `must_change_password`, last-login, and password-change timestamps are
  retained for later authentication UX.

The actor link is immutable, and authentication accounts cannot be hard
deleted. Changing the authorization identity behind an account requires
creating a new account; access is removed by deactivation so history remains
auditable.

### `auth_sessions`

Sessions use a cryptographically random opaque cookie token. Only a SHA-256
hash of that high-entropy token is persisted. Session records include absolute
expiration, revocation, last-seen, user-agent, and IP metadata.

Password changes, password resets, and account deactivation revoke all sessions
for the account.

### `auth_password_reset_tokens`

An Application Administrator can issue a one-time reset token for an account.
Only the token hash is stored. Issuing a new token invalidates earlier unused
tokens. Tokens expire and are consumed atomically with the password update.

Bite 28B intentionally does not implement email delivery. The raw reset token
is returned once to the authorized administrator so it can be delivered through
an approved channel. Bite 28D adds the operational account and reset-token UX.

## Endpoints

Public authentication endpoints:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/password/reset`

Session-authenticated endpoints:

- `GET /api/v1/auth/session`
- `GET /api/v1/auth/tenant-options`
- `POST /api/v1/auth/password/change`

Successful login and current-session responses expose the account login in
`data.login`. The value is normalized to lowercase; there is no separate
`normalizedLogin` response property.

Successful password-reset responses return `data.accountId`, `data.login`, and
`data.passwordChangedAt` only after the server reloads the account and verifies
that the persisted bcrypt hash matches the submitted replacement password.
Reset-token issuance likewise returns the authoritative `accountId` and `login`
for the token target.

Application-scoped administration endpoints:

- `GET /api/v1/auth/accounts` — application-scoped `authz.read`
- `POST /api/v1/auth/accounts` — application-scoped `authz.manage`
- `PATCH /api/v1/auth/accounts/:id/active` — application-scoped `authz.manage`
- `POST /api/v1/auth/accounts/:id/password-reset-tokens` — application-scoped `authz.manage`

Tenant-scoped administrators cannot list or manage authentication accounts.
Account creation, activation/deactivation, and reset-token issuance are recorded
in the authorization audit log.

Creating an account requires the persisted authorization actor record ID, not
the external actor key.

## Cookie behavior

The default cookie is:

- name: `ers_session`;
- HTTP-only;
- path `/`;
- SameSite `Lax`;
- 12-hour absolute expiration;
- Secure by default in test and production, false by default in local
  development.

Configuration:

- `AUTH_SESSION_TTL_MINUTES`
- `AUTH_PASSWORD_RESET_TTL_MINUTES`
- `AUTH_PASSWORD_HASH_COST`
- `AUTH_SESSION_COOKIE_NAME`
- `AUTH_SESSION_COOKIE_SECURE`
- `AUTH_SESSION_COOKIE_SAME_SITE`

## Security behavior

- Login failures use a generic response and perform a bcrypt comparison even
  when the login does not exist.
- Passwords must contain at least 12 characters and no more than 72 UTF-8
  bytes, matching bcrypt's input boundary.
- Raw passwords, session tokens, and reset tokens are never persisted.
- Logout is idempotent.
- Expired and revoked sessions are rejected.
- Inactive accounts and actors cannot authenticate.
- Administrators cannot deactivate the authentication account linked to their
  own persisted actor.
- Password changes require the current password and invalidate every session.
- Password-reset tokens are short-lived and single-use.

## Bite 28C cutover

Bite 28C now derives protected-route actor identity from the authentication
session. `X-Tenant-ID` remains only a tenant-selection hint whose grants are
validated for the session actor. Actor headers are restricted to explicit local
bootstrap and isolated test modes. See `authenticated-authorization-cutover.md`.
