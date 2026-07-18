# Persisted authorization actor operating model

ERS currently transports an actor key and tenant ID in request headers until authenticated user sessions are introduced. Those headers identify the requester; they do not grant permissions.

## Authoritative permissions

For normal application requests, the backend resolves `X-Actor-ID` against `authz_actors` and loads active role grants from `authz_actor_role_grants`. Effective permissions come only from active persisted roles and permissions.

`X-Actor-Permissions` is no longer accepted as a fallback when the authorization store is available. This prevents a browser, proxy, or API client from granting itself wildcard permissions.

The current operating context can be inspected through:

```text
GET /api/v1/authz/current-actor
```

The response includes the persisted actor record ID, selected tenant, effective scope, active role codes, and effective permissions.

## Bootstrap actor

`AUTHZ_BOOTSTRAP_*` remains a controlled environment-repair mechanism. It is intended to create or restore the first administrator in an environment, not to replace normal actor administration.

Local development and Playwright create a persisted `bootstrap-admin` actor with an `APPLICATION_ADMIN` grant. The frontend and tests send only the actor key and tenant; the backend loads the persisted wildcard grant.

Production and long-lived environments should keep `AUTHZ_BOOTSTRAP_ENABLED=false` after a valid administrator exists, except during an intentional recovery operation.

## Actor lifecycle safeguards

Authorization administrators can activate and deactivate actors from the Authorization page. ERS prevents:

- an operating actor from deactivating itself;
- an operating actor from revoking one of its own role grants;
- deactivating the last active application administrator;
- revoking the last active global `APPLICATION_ADMIN` grant.

Create a second application administrator and verify it before retiring or changing the original bootstrap administrator.

## Tenant selection

The same actor may have grants for more than one tenant. `X-Tenant-ID` selects the tenant context for a request. Global application-administrator grants apply to every tenant; tenant-scoped grants apply only to their persisted tenant.
