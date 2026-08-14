# Bite 30C — Authentication Account and Actor Cardinality/Scope Refactor

## Scope

Bite 30C implements the Account/Actor ownership decisions from Bite 30A without
performing the later self-service, session UX, Collaborator, financial, or
Application Administrator control-plane cutovers.

The authoritative target established by this bite is:

- one human has one Authentication Account;
- one ordinary Authentication Account may control one tenant Actor per Tenant;
- all tenant Actors for an ordinary Account represent the same global Person;
- a tenant Actor is bound to the Person–Tenant Membership for its Tenant;
- an Application Administrator Account owns one GLOBAL Actor and has no Person,
  Membership, or tenant Actor identity.

## Additive schema

Migration `000046_authentication_account_actor_cardinality_scope` adds:

### `auth_account_people`

Binds an ordinary Authentication Account to exactly one global Person.
`person_id` is unique, preventing two Accounts from representing the same global
Person.

Application Administrator Accounts have no row in this table.

### `auth_account_actors`

The authoritative Account → Actor ownership relation.

Each binding records:

- `account_id`;
- `actor_id`;
- `scope_type` (`GLOBAL` or `TENANT`);
- `tenant_id` for tenant Actors;
- `membership_id` when the tenant Actor represents a Person;
- the temporary compatibility/default `is_primary` marker.

The schema enforces one Actor owner, at most one tenant Actor per Account/Tenant,
at most one GLOBAL Actor per Account, and at most one primary Actor.

`auth_user_accounts.actor_id` remains in place temporarily as the Bite 28
compatibility/default pointer. It is no longer the authoritative ownership
relation and is scheduled for removal in Bite 30J after the remaining callers
have cut over.

## Migration and startup repair

The SQL migration immediately backfills common one-tenant Accounts and explicit
Application Administrator GLOBAL bindings.

An idempotent startup repair handles Bite 28 historical Actors that contain
role grants for several tenants. For an ordinary multi-tenant Person it:

1. resolves the global Person through Bite 30B Memberships;
2. binds the Authentication Account to that global Person;
3. retains the legacy Actor as the primary tenant Actor;
4. creates a distinct Actor for every additional tenant;
5. binds every tenant Actor to the corresponding Person–Tenant Membership;
6. copies that tenant's existing role grants to the new Actor.

The legacy grants are intentionally **copied rather than moved**. This preserves
the pre-30C authorization state if migration `000046` must be rolled back before
the later legacy-removal bite.

## Runtime authenticated Actor resolution

Authentication sessions remain Account sessions.

For authenticated requests, ERS now resolves authorization as:

`Session → Authentication Account → selected Tenant → Account-owned Actor`

rather than assuming the one Actor stored on the session/account is authoritative
for every tenant.

A tenant switch can therefore resolve a different Actor while preserving the
same Authentication Account and session identity. The full tenant-selection UX
and session-shape cleanup remain Bite 30E work.

## One Person, one Account

Both Person-account creation and the legacy Actor-selection account workflow now
enforce one Authentication Account for the global Person.

If a second tenant Actor belongs to a global Person who already has an Account,
ERS links that Actor to the existing Account instead of creating another login
identity. The existing password and sessions are not replaced merely because a
second tenant Actor is added.

## Application Administrator scope

Application Administrator provisioning and startup repair establish a GLOBAL
Account/Actor binding and remove stale legacy Person/Collaborator pointers from
the global Actor.

This bite does **not** yet remove the Bite 28 compatibility that lets the global
Application Administrator operate against a selected tenant. Removing standing
tenant-data authority and introducing Tenant Support Access Leases remain Bite
30H responsibilities.

## Authentication Administration UX

Authentication Account responses now expose all linked Actors, including their
scope, tenant, Membership, active state, and primary compatibility marker.

The Authentication Administration table displays the complete Actor set and
uses all linked Actors when deciding whether an Account has active authorization
identity.

## Explicitly deferred

Bite 30C does not:

- remove the `PERSON` role or self-service Role Grants — Bite 30D;
- complete tenant-selection/session UX — Bite 30E;
- make Collaborator creation Membership-native — Bite 30F;
- move financial ownership to Person + Tenant — Bite 30G;
- remove Application Administrator standing tenant-data compatibility or add
  Support Access Leases — Bite 30H;
- remove legacy `auth_user_accounts.actor_id`, legacy Actor Person/Collaborator
  links, or copied legacy grants — Bite 30J.

## Principal invariants established

1. An Actor can be owned by only one Authentication Account.
2. A global Person can be bound to only one Authentication Account.
3. An ordinary Account can own at most one tenant Actor for a Tenant.
4. A tenant Actor binding with a Membership must match the Account's global
   Person and the binding Tenant.
5. A GLOBAL Account cannot also have a Person binding.
6. Application Administrator provisioning creates/repairs GLOBAL identity only.
7. Authenticated tenant requests resolve the Account-owned Actor for the
   selected Tenant.
8. Adding another tenant Actor for the same global Person reuses the existing
   Authentication Account.
