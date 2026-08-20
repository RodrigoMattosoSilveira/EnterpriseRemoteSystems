# Bite 30E — Session and Tenant Selection Refactor

## Purpose

Bite 30E completes the Account-owned tenant-selection model established by Bite
30C. Authentication identifies one `Authentication Account`; selecting a tenant
selects that Account's active Actor for the same tenant. The browser never
chooses or transports an Actor identity.

No schema migration is required for this bite. `auth_sessions.account_id`,
`auth_account_actors`, and `person_tenant_memberships` already contain the
required persisted relationships.

## Browser session contract

`POST /api/v1/auth/login` and `GET /api/v1/auth/session` expose Account identity
only:

- `accountId`
- `displayName`
- `login`
- `mustChangePassword`
- `expiresAt`

Legacy single-Actor fields remain internal compatibility data until Bite 30J,
but are no longer serialized into the browser session response. Session
validity therefore depends on the Authentication Account, not on whether any
tenant Actor is currently active.

## Tenant options

`GET /api/v1/auth/tenant-options` is Account-owned. For an ordinary Person
Account, each option is derived from all of the following persisted facts:

1. the Authentication Account is bound to an active `authz_actor`;
2. the binding scope is `TENANT`;
3. the binding names the selected tenant;
4. the binding names a Person–Tenant Membership for that tenant;
5. that Membership belongs to the Account's global Person; and
6. the Membership status is `ACTIVE`.

Each option identifies the exact effective context through `actorRecordId`,
`actorKey`, `actorScope`, and `membershipId`. Delegated Role Grants are reported
in `roleCodes` but are not required for intrinsic Person self-service.

The staged Application Administrator compatibility remains until Bite 30H. A
GLOBAL Application Administrator Account still receives all active tenant
options, but every option explicitly identifies the same APPLICATION-scoped
GLOBAL Actor and never invents a tenant Membership.

## Tenant switching

The browser persists only the selected tenant ID under:

```text
ers.auth.selectedTenantId
```

For each protected request the backend resolves:

```text
Authentication Account
        +
selected tenant
        -> Account-owned active Actor for that tenant
        -> same-tenant ACTIVE Membership
        -> effective intrinsic + delegated permissions
```

Changing the tenant therefore changes the effective Actor for an ordinary
multi-tenant Account. The Account session and login do not change.

The application shell retains the effective Actor identity as diagnostic DOM
metadata for automated/manual verification and verifies that a TENANT option's
advertised `actorRecordId` matches `GET /api/v1/authz/current-actor` before
rendering tenant data.

## Frontend state boundary

Many feature queries still use tenant-neutral React Query keys while the HTTP
request itself is scoped by `X-Tenant-ID`. Before changing tenant, the shell:

1. cancels in-flight queries;
2. removes tenant-bound cached queries;
3. retains only the current Account's tenant-option catalog;
4. persists the new tenant selection; and
5. returns to the workspace landing route.

This prevents data fetched under Tenant A from flashing or being reused after
Tenant B's Actor becomes effective. A successful login also clears any query
cache left by a prior Account before entering the new Account's workspace.

## Independent lifecycle semantics

Authentication Account and Actor activation remain separate controls:

- deactivating an Authentication Account revokes the Account's sessions and
  prevents authentication globally;
- deactivating one TENANT Actor removes only that tenant from the Account's
  tenant options;
- an existing Account session remains valid independently of tenant Actor
  activation; if no tenant Actor remains eligible, the Account is still
  authenticated but has no tenant workspace;
- requesting the deactivated Actor's tenant returns HTTP `403` with code
  `tenant_actor_unavailable`, rather than treating the whole Account session as
  unauthenticated;
- reactivating the Actor restores that tenant option when its Membership is
  still ACTIVE;
- an inactive or mismatched Membership cannot produce an effective tenant
  Actor.

If no tenant Actor remains eligible, the browser keeps the Authentication
Account session and renders an explicit **Signed in** state together with
**No tenant access**. This makes successful Account authentication visible
while still refusing to borrow an Actor from another tenant or render a tenant
workspace.

## Global and tenant authority

Bite 30E does not combine GLOBAL and TENANT authority. Existing Account/Actor
foundation constraints continue to prohibit one Authentication Account from
owning both GLOBAL and TENANT Actor bindings. Application Administrators remain
APPLICATION scoped while the temporary all-active-tenant compatibility exists;
ordinary Accounts resolve separate TENANT Actors.

## Verification focus

Promotion verification should cover at least:

- one ordinary Account with active Actors in two tenants;
- switching Tenant A → Tenant B → Tenant A resolves Actor A → Actor B → Actor A;
- the Authentication Account/session remains unchanged across the switch;
- tenant-bound cached data does not survive the Actor switch;
- deactivating Actor A removes Tenant A without revoking the Account session
  while Actor B remains active;
- reactivating Actor A restores Tenant A;
- a selected tenant with no active Account-owned Actor fails with
  `tenant_actor_unavailable` and cannot borrow another tenant's Actor;
- the GLOBAL Application Administrator continues using one APPLICATION Actor
  across tenant selection until Bite 30H.
