# Persisted authorization actor operating model

ERS uses the login-backed HTTP session as the authoritative Authentication Account identity for protected application requests. The browser sends only the HTTP-only session cookie and an operating-context hint. For ordinary Accounts that hint is a Tenant ID and the backend resolves the exact Account-owned Tenant Actor. For a GLOBAL Application Administrator the only normal context is `*`, which resolves the Account-owned GLOBAL Actor. The browser never chooses its authorization actor.

## Authoritative permissions

For normal tenant application requests, the backend resolves the Account session plus selected tenant to the appropriate persisted `authz_actors` record, then loads intrinsic tenant-context permissions and active delegated role grants for that Actor. Effective tenant permissions come only from the persisted Account/Actor/Membership identity and active persisted delegated authorization.

Base own-resource Person self-service is intentionally independent of Tenant Actor resolution. An authenticated ordinary Authentication Account may read only the global Person bound through `auth_account_people` and that Person's read-only Current Account projection even when no Tenant Actor/Membership is currently active. This Account-level path does not grant tenant workspace access, does not create a Current Actor, and does not confer delegated tenant authority. Current Account rows retain Tenant provenance.

`X-Actor-Permissions` is no longer accepted as a fallback when the authorization store is available. This prevents a browser, proxy, or API client from granting itself wildcard permissions.

The current operating context can be inspected through:

```text
GET /api/v1/authz/current-actor
```

The response includes the persisted actor record ID, effective context (`*` for global administration or a Tenant ID for ordinary Tenant identity), effective scope, active role codes, and effective permissions.

## Bootstrap actor

`AUTHZ_BOOTSTRAP_*` remains a controlled environment-repair mechanism. It is intended to create or restore the first administrator in an environment, not to replace normal actor administration.

Local development retains a persisted `bootstrap-admin` actor with an `APPLICATION_ADMIN` grant for deliberate recovery. Bite 28D Playwright provisions and authenticates the separate `e2e-application-admin` account through a real session; explicit `test` header mode remains enabled only for isolated authorization-boundary requests. Neither compatibility path invents permissions; the backend always loads persisted grants.

Production and long-lived environments should keep `AUTHZ_BOOTSTRAP_ENABLED=false` after a valid administrator exists, except during an intentional recovery operation.

## Actor lifecycle safeguards

Application Administrators can manage the application Actor catalog. Tenant Administrators can manage only Account-bound Tenant Actors for their selected Tenant: inactive Actors remain visible, and the Tenant Administrator may reactivate an Actor only while its same-tenant Person–Tenant Membership is ACTIVE. A missing Tenant Actor is created through the Person Authentication workflow, which preserves the canonical Authentication Account → Actor → Membership binding rather than creating a free-floating Actor. Tenant operator Role Grants still require an ACTIVE Actor and ACTIVE same-tenant Membership.

ERS prevents:

- an operating actor from deactivating itself;
- an operating actor from revoking one of its own role grants;
- deactivating the last active application administrator;
- revoking the last active global `APPLICATION_ADMIN` grant.

Create a second application administrator and verify it before retiring or changing the original bootstrap administrator.

## Tenant selection

The HTTP session authenticates an Authentication Account, not one tenant Actor. `X-Tenant-ID` is retained only as a tenant-selection hint. For an ordinary Account, the backend resolves the Account-owned active TENANT Actor whose binding and ACTIVE Person–Tenant Membership both belong to that tenant. Selecting another tenant therefore selects another Actor while the Account session remains unchanged. A missing/inactive tenant Actor fails with `tenant_actor_unavailable`; ERS never borrows an Actor from another tenant.

GLOBAL Application Administrator Accounts remain APPLICATION scoped and operate in one explicit control-plane context, `*` (`Global administration`). The context selector does not enumerate Tenants for a GLOBAL Account. Supplying a specific Tenant ID cannot convert or reuse the GLOBAL Actor as a Tenant identity and fails with `tenant_actor_unavailable`. `APPLICATION_ADMIN` has only explicit control-plane permissions; it has no standing People, Collaborator, planning, financial, receipt, reference-data, or other Tenant business-data authority. Exceptional Tenant support access is intentionally deferred to Bite 30I.2 and must not be represented as a Tenant Actor or ordinary Tenant Role Grant.
