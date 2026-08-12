# Persisted authorization actor operating model

ERS uses the login-backed HTTP session as the authoritative actor identity for protected application requests. The browser sends only the HTTP-only session cookie and an optional selected-tenant hint; it does not choose its authorization actor.

## Authoritative permissions

For normal application requests, the backend resolves the session to its persisted `authz_actors` record and loads active role grants from `authz_actor_role_grants` for the selected tenant. Effective permissions come only from active persisted roles and permissions.

`X-Actor-Permissions` is no longer accepted as a fallback when the authorization store is available. This prevents a browser, proxy, or API client from granting itself wildcard permissions.

The current operating context can be inspected through:

```text
GET /api/v1/authz/current-actor
```

The response includes the persisted actor record ID, selected tenant, effective scope, active role codes, and effective permissions.

## Bootstrap actor

`AUTHZ_BOOTSTRAP_*` remains a controlled environment-repair mechanism. It is intended to create or restore the first administrator in an environment, not to replace normal actor administration.

Local development retains a persisted `bootstrap-admin` actor with an `APPLICATION_ADMIN` grant for deliberate recovery. Bite 28D Playwright provisions and authenticates the separate `e2e-application-admin` account through a real session; explicit `test` header mode remains enabled only for isolated authorization-boundary requests. Neither compatibility path invents permissions; the backend always loads persisted grants.

Production and long-lived environments should keep `AUTHZ_BOOTSTRAP_ENABLED=false` after a valid administrator exists, except during an intentional recovery operation.

## Actor lifecycle safeguards

Authorization administrators can activate and deactivate actors from the Authorization page. ERS prevents:

- an operating actor from deactivating itself;
- an operating actor from revoking one of its own role grants;
- deactivating the last active application administrator;
- revoking the last active global `APPLICATION_ADMIN` grant.

Create a second application administrator and verify it before retiring or changing the original bootstrap administrator.

## Tenant selection

The same authenticated actor may have grants for more than one tenant. `X-Tenant-ID` is retained only as a tenant-selection hint. The backend validates that selection against the session actor's persisted grants. Global application-administrator grants apply to every tenant; tenant-scoped grants apply only to their persisted tenant.
