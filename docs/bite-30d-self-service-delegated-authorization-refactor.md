# Bite 30D — Self-Service and Delegated Authorization Refactor

## Purpose

Bite 30D separates identity-derived self-service authorization from delegated
administrative/operator authority.

Before this bite, ordinary authenticated People received a persisted `PERSON`
Role Grant. That Role mixed two different concepts:

- who the authenticated human is in a Tenant; and
- authority delegated to an Actor by an administrator.

After Bite 30D, those concepts are independent.

## Authorization model

### Intrinsic self-service authority

For a normal authenticated tenant request ERS resolves:

```text
Authentication Account
        ↓
Account-owned TENANT Actor
        ↓
active Person–Tenant Membership
        ↓
global Person
        ↓
current tenant Person projection
```

That identity chain is the source of intrinsic self-service rights. It does not
require a Role Grant.

Every valid active tenant Person identity receives the intrinsic permissions
needed to inspect authorization/tenant/reference context and operate on its own
Person record:

```text
authz.self.read
tenants.read
reference_data.read
people.self.read
people.self.update
```

When the Person has an active current Collaborator Journey in the selected
Tenant, ERS additionally derives the collaborator self-service capabilities:

```text
collaborators.self.read
current_accounts.self.summary.read
current_accounts.self.ledger.read
assignments.self.current.read
ledger.receipts.self.read
```

These permissions are not persisted as Role Grants.

### Delegated authority

Roles and Role Grants now represent delegated authority only, including:

- `APPLICATION_ADMIN`
- `TENANT_ADMIN`
- `EARNINGS_OPERATOR`
- `EXPENSE_OPERATOR`

`TENANT_ADMIN` uses an explicit tenant-business permission set rather than the
historical `*` wildcard. This prevents newly introduced application/global
permissions from silently becoming tenant-administrator authority. Person
`*.self.*` capabilities remain intrinsic rather than delegated.

Gold-price administration is also separated from ordinary `price_lists.*`
authority. `gold_prices.manage` is delegated only to `TENANT_ADMIN`;
`EXPENSE_OPERATOR` may continue reading the latest active price as an operational
dependency of GOLD_GRAM expense creation, but cannot browse gold-price history,
record/replace prices, deactivate prices, or open the Gold Prices administration
screen.

The legacy `PERSON` Role and its historical grants remain in the database for
migration/audit history, but migration `000048` makes them inactive. Fresh
catalog seeding does not create the `PERSON` Role.

At request resolution ERS keeps three permission projections:

- `intrinsicPermissions` — derived from identity/Membership;
- `delegatedPermissions` — derived from active Role Grants;
- `permissions` — effective union used for ordinary permission checks.

`roleCodes` contains delegated Roles only.

## Self-route enforcement

Self routes do not trust the effective permission union alone. They require:

1. the request target to equal the Actor's resolved Person/Collaborator ID; and
2. the corresponding permission to exist in `intrinsicPermissions`.

This prevents an administrator-created Role Grant, malformed historical grant,
or test header from manufacturing self identity.

## Delegated Role Grant invariants

Bite 30D establishes the following rules in service validation and migration
triggers:

- `PERSON`/`SELF` Roles cannot be granted;
- a Tenant Role requires a specific Tenant ID rather than `*`;
- a Tenant Role may be granted only to an Actor that is already bound to that
  exact Tenant through `auth_account_actors`;
- an Application Role must use the global `*` scope;
- an Application Role cannot be attached to an Actor that owns a TENANT Account
  binding.

Migration `000048` deactivates historical active grants that violate those
rules instead of deleting them.

## Global/control-plane authorization

Bite 30D gives `APPLICATION_ADMIN` explicit control-plane permission catalog
entries for authorization and Tenant administration:

```text
authz.self.read
authz.read
authz.manage
tenants.read
tenants.create
tenants.update
```

Authorization-administration routes require both the appropriate permission
and an `APPLICATION` Actor scope. A Tenant Administrator therefore cannot use
its explicit tenant-business authority to administer the global authorization
catalog.

Tenant Administrators instead receive `authz.tenant_role_grants.manage`. The
tenant-local delegation surface lists active Actors backed by an active
Person-Tenant Membership in the selected tenant, including Actors with no
current delegated Role, and allows only `EARNINGS_OPERATOR` and
`EXPENSE_OPERATOR` grants to be created or revoked. It never exposes or permits
management of `TENANT_ADMIN`, `APPLICATION_ADMIN`, self-service Roles, or
cross-tenant grants. Removing an operator grant therefore removes only delegated
authority; intrinsic Person/Collaborator self-service remains identity-derived.

### Transitional Application Administrator compatibility

Bite 30D does **not** complete Bite 30H early.

The existing Application Administrator wildcard and all-active-tenant
compatibility remain temporarily so the staged Bite 30 program and existing
operational/E2E workflows continue to function. 30D stops global grants from
being merged into a TENANT Actor identity, but the final removal of standing
Application Administrator tenant-data authority and introduction of Tenant
Support Access Leases remain Bite 30H responsibilities.

Likewise, final tenant-selection/session behavior remains Bite 30E.

## Authentication provisioning changes

Authentication Account creation and login no longer create, reactivate, or
backfill a `PERSON` Role Grant.

A newly provisioned Person can authenticate with zero delegated Roles because
its Account-owned tenant Actor and active Membership are sufficient to derive
intrinsic self-service authority.

Adding an operator/admin Role later is additive. Removing that delegated Role
removes only the delegated authority; the Person's intrinsic self-service
identity remains.

## Current Actor API

`GET /api/v1/authz/current-actor` now exposes enough separation for diagnostics
and policy tests:

```text
globalPersonId
membershipId
roleCodes
intrinsicPermissions
delegatedPermissions
permissions
```

For a normal Person Actor, `roleCodes` may be empty while intrinsic self-service
permissions are present.

## Migration

Migration:

```text
000048_self_service_delegated_authorization_refactor
```

performs the staged cutover by:

1. deactivating legacy `PERSON`/`SELF` Role Grants;
2. deactivating the legacy `PERSON` Role;
3. ensuring the explicit Application control-plane permission catalog entries
   exist;
4. assigning those explicit permissions to `APPLICATION_ADMIN` while retaining
   the transitional wildcard until Bite 30H;
5. deactivating tenant delegated grants whose Actor is not bound to the exact
   target Tenant;
6. deactivating Application grants attached to tenant-bound Actors;
7. installing insert/update triggers that enforce the same scope invariants for
   future Role Grants.

Historical rows are retained rather than deleted.

## Deferred work

Bite 30D intentionally does not implement:

- final Account-owned tenant-selection/session UX — Bite 30E;
- Collaborator → Membership parent cutover — Bite 30F;
- Person + Tenant financial ownership — Bite 30G;
- removal of Application Administrator standing tenant-data wildcard authority
  and Tenant Support Access Leases — Bite 30H;
- legacy authorization schema removal — later hardening.


### Gold Production administration

Gold Production source records are a sensitive administrative input to accrual.
`EARNINGS_OPERATOR` may read recorded production through the existing earnings-read
path, but may not create, edit, deactivate, or delete Gold Production. Those
mutations require `gold_production.manage`, granted only to `TENANT_ADMIN` and
`APPLICATION_ADMIN`.
