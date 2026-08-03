# Bite 28C — Authenticated Authorization Cutover

## Purpose

Bite 28C makes the login-backed HTTP session established in Bite 28B the
authoritative identity for protected ERS application requests.

Before this cutover, the browser selected an authorization actor through
`X-Actor-ID`. After this cutover, the browser sends the HTTP-only session cookie
and a selected-tenant hint. The backend resolves the session's persisted actor
and loads that actor's persisted grants for the selected tenant.

Authentication and authorization remain separate concerns:

- authentication determines which persisted actor owns the session;
- authorization determines what that actor may do for the selected tenant.

## Protected-request flow

For a protected API request, ERS performs the following sequence:

1. Resolve the `ers_session` cookie through the authentication service.
2. Reject expired, revoked, inactive-account, or inactive-actor sessions.
3. Read `X-Tenant-ID` as a tenant-selection hint.
4. Load the session actor from `authz_actors` using the selected tenant.
5. Confirm the persisted actor record matches the actor linked to the session.
6. Load active role grants and permissions from the authorization store.
7. Store the resulting actor in request context.
8. Reuse that same actor for route guards, sensitive handlers, and audit
   attribution.

A valid session always takes precedence over actor-related request headers.

## Browser request contract

Normal browser requests send:

- the same-origin HTTP-only session cookie;
- `X-Tenant-ID` when a tenant has been selected.

The shared frontend API client strips these headers if a caller attempts to
supply them:

- `X-Actor-ID`
- `X-Actor-Permissions`
- `X-Authorized-By`

The browser stores only the selected tenant under:

```text
ers.auth.selectedTenantId
```

During upgrade, the frontend may read the tenant ID from the former
`ers.authzAdmin.requestActor` object. It does not retain or reuse the actor ID,
and it removes the legacy object after migration.

## Tenant selection

`X-Tenant-ID` is not proof of access. It identifies the tenant in which the
session actor wants to operate. The backend validates that tenant against the
actor's active persisted grants.

Expected outcomes include:

- no tenant selected: `403 tenant_selection_required`;
- no applicable grant: `403 forbidden`;
- active tenant or application grant: authorization continues.

An `APPLICATION_ADMIN` grant scoped to `*` remains valid across tenants.
Tenant-scoped roles apply only to their persisted tenant.

## Request actor context

`backend/internal/authz/request_context.go` provides the shared request-actor
boundary:

- `SetRequestActor` stores the authoritative actor;
- `SetRequestActorError` stores the authoritative resolution failure;
- `RequestActorFromContext` reads the middleware result;
- `ResolveRequestActor` reuses that result in handler-authorized operations.

A stored session-resolution error cannot fall back to request headers.
`ResolveRequestActor` reads headers only for isolated handler tests and explicit
compatibility execution that does not run through normal route middleware.

This keeps route authorization, handler authorization, self-protection checks,
and audit attribution on the same identity.

## Actor-header compatibility modes

`AUTHZ_ACTOR_HEADER_MODE` controls the temporary compatibility boundary.

### `disabled`

Normal production mode. Actor headers cannot establish identity. An
authenticated session is required.

### `bootstrap`

Local-development recovery mode. Only the configured
`AUTHZ_BOOTSTRAP_ACTOR_KEY` may be supplied through `X-Actor-ID`.

Bootstrap mode rejects:

- `X-Actor-Permissions`;
- `X-Authorized-By`;
- actor IDs other than the configured bootstrap actor.

Permissions still come from the persisted bootstrap actor grant.

### `test`

Isolated test and CI compatibility mode. Header impersonation remains available
for authorization boundary tests and Playwright setup.

The application refuses to start with `test` mode unless `APP_ENV` is `test`,
`testing`, or `ci`.

## Local development before Bite 28D

Bite 28D will provide the browser login and logout experience. Until then, the
Vite development proxy may add the configured bootstrap actor header while the
backend runs in `bootstrap` mode.

This can be disabled with:

```bash
ERS_LOCAL_AUTHZ_BOOTSTRAP=false npm run dev
```

The proxy does not exist in a production frontend build. When a valid session
cookie is present, the session actor remains authoritative even if the proxy or
caller also sends an actor header.

## Test and CI behavior

Playwright starts the backend with:

```text
APP_ENV=ci
AUTHZ_ACTOR_HEADER_MODE=test
```

The test proxy supplies actor headers for explicit authorization scenarios.
Browser local storage contains only the selected tenant.

Test coverage must prove:

- sessions override spoofed actor headers;
- disabled mode rejects unauthenticated actor headers;
- bootstrap mode accepts only the configured persisted bootstrap actor;
- bootstrap mode rejects permission and legacy actor headers;
- test mode remains limited to test or CI environments;
- missing or unauthorized tenant selections fail closed;
- handler-level authorization reuses the middleware actor;
- browser API requests do not transmit actor identity.

## Sensitive-operation attribution

Sensitive handlers use the request-context actor rather than rereading headers.
This applies to authorization and authentication administration, tenant audit
operations, current-account settlements and corrections, receipt workflows,
gold production, and gold-price attribution.

User-editable request fields cannot replace the authenticated actor for audit or
recorded-by attribution.

## Operational cutover checks

Before promotion, verify that:

1. A logged-in actor can access only operations allowed by persisted grants.
2. Changing `X-Actor-ID` does not change a valid session's identity.
3. Changing `X-Tenant-ID` cannot cross a tenant boundary without a grant.
4. Invalid sessions are rejected before header compatibility is considered.
5. Production configuration uses `AUTHZ_ACTOR_HEADER_MODE=disabled`.
6. Local bootstrap and CI test modes are explicit and documented.
7. `/api/v1/authz/current-actor` reports the session actor and selected tenant.
8. Authorization audit events identify the same actor used by route guards.

## Remaining Bite 28D work

Bite 28C establishes the server and transport security boundary. Bite 28D is
responsible for the application-facing authentication and tenant UX, including:

- login and logout pages;
- current-user display;
- tenant selection for actors with multiple grants;
- expired-session handling and redirection;
- unauthorized and forbidden page behavior;
- password-change and reset workflows in the browser.
