# Bite 30I.1 — Global Administration Control Plane

## Purpose

Bite 30I.1 removes the transitional interpretation of the GLOBAL `APPLICATION_ADMIN` scope marker `*` as standing authority inside every Tenant. The Application Administrator remains a GLOBAL Actor, but now operates only in an explicit application control-plane context.

Tenant Support Access Leases are deliberately **not** implemented in this bite; that exceptional-access mechanism belongs to Bite 30I.2.

## Authorization invariants

- An Application Administrator is an `APPLICATION`-scoped GLOBAL Actor.
- Its normal operating context is `tenantId = "*"`, presented as **Global administration**.
- `*` is a control-plane marker, not a Tenant wildcard.
- A GLOBAL Account exposes exactly one normal context and does not enumerate active Tenants.
- Supplying a specific Tenant ID does not make the GLOBAL Actor a Tenant Actor and fails with `tenant_actor_unavailable`.
- `RequireTenantScope` never accepts an `APPLICATION` Actor.
- Ordinary Authentication Accounts continue to resolve exact Account-owned Tenant Actors backed by ACTIVE same-Tenant Person–Tenant Memberships.
- No Person, Membership, Tenant Actor, Collaborator Journey, or Tenant Role Grant is created for the Application Administrator.

## Standing Application Administrator permissions

Bite 30I.1 restricts `APPLICATION_ADMIN` to:

```text
authz.self.read
authz.read
authz.manage
tenants.read
tenants.create
tenants.update
```

The role no longer receives the legacy `*` permission or Tenant business-data permissions such as People, Collaborators, planning, earnings, expenses, receipts, Current Accounts, reference data, Gold Production, Gold Prices, or price-list administration.

## Migration

Migration `000063_global_administration_control_plane.up.sql` removes stale `APPLICATION_ADMIN` role-permission rows outside the control-plane allowlist and installs database triggers that prevent later reintroduction of non-control-plane permissions for the canonical Application Administrator role.

The down migration removes those guards and restores the pre-30I.1 transitional wildcard/Gold Production role rows.

## Browser context

For GLOBAL administration the existing context selector is presented as **Administration context** and contains one option:

```text
Global administration
GLOBAL
```

Ordinary Accounts retain the existing Tenant selector terminology and behavior.

Account-reactivation alerts remain a global Authentication Administration responsibility and are surfaced on the Tenants control-plane landing page because `/people` is no longer accessible to the Application Administrator.

## Deferred

Bite 30I.1 does not grant any exceptional Tenant access. Request, approval, expiration, termination, operation allowlisting, and audit attribution for Tenant Support Access Leases are Bite 30I.2+ concerns.
