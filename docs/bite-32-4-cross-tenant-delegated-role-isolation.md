# Bite 32.4 — Cross-Tenant Delegated Role Isolation

## Purpose

Bite 32.4 enforces a global-Person cross-Tenant Role boundary.

A Person may participate in multiple Tenants through **Membership** and **Collaborator** relationships. Those two baseline relationships do not make the Person ineligible for Roles in another Tenant.

If the same global Person holds **any other active Tenant-scoped Role** in one Tenant, the Person is not eligible for any other Tenant-scoped Role in another Tenant until the Tenant where the existing Roles are held explicitly removes all of them.

In the authorization implementation, Membership and Collaborator are relationships rather than `authz_roles` rows. Therefore the enforcement rule is intentionally generic: **every active `TENANT`-scoped authorization Role Grant is non-baseline and participates in Bite 32.4 isolation, regardless of Role code.**

## Invariant

```text
One global Person
  → N Membership / Collaborator relationships across Tenants
  → active non-baseline Tenant Role Grants in 0..1 Tenant
```

Current Tenant Role codes include `TENANT_ADMIN`, `EARNINGS_OPERATOR`, and `EXPENSE_OPERATOR`, but Bite 32.4 is **not** an allowlist of those codes. A future `TENANT`-scoped Role is governed automatically by the same rule.

Multiple non-baseline Roles in the **same Tenant** are allowed.

Application-global `APPLICATION_ADMIN` authority is a separate control-plane model and is excluded because it is not held in a Tenant. Tenant Support Access Leases are also separate and are excluded.

## Person responsibility and Tenant ownership

A Person cannot make themselves eligible in another Tenant merely by changing Tenant context, deactivating an Actor, deactivating a Membership, or allowing a Role to become lifecycle-suspended.

To become eligible for a non-baseline Role in another Tenant, the Person must work with the Tenant where the existing Roles are held so that **every non-baseline Tenant Role Grant there is explicitly revoked**.

ERS never automatically chooses which Tenant should retain the Person's Role authority and never silently revokes another Tenant's Role. When migration encounters a historical conflict that predates this invariant, it lifecycle-suspends every conflicting active Tenant Role Grant so no Tenant keeps effective delegated authority by accident. The assignments remain present until administrators explicitly reconcile them.

## Lifecycle semantics

The boundary is based on an active Role Grant (`active=1`). A `lifecycle_suspended=1` grant remains assigned and therefore continues to reserve that Person's Role Tenant. Actor deactivation, Membership deactivation, or lifecycle suspension does not release the boundary.

Only explicit Role Grant revocation (`active=0`) releases the Person for a non-baseline Role in another Tenant.

## Domain enforcement

`ValidateDelegatedRoleGrant` resolves the target Tenant Actor through `auth_account_actors` and `person_tenant_memberships`, obtains the canonical global Person, and checks **all active `TENANT`-scoped Role Grants** for that Person in every other Tenant.

The query is scope-based rather than Role-code-based, so newly introduced Tenant Roles cannot bypass the invariant simply because Bite 32.4 predates their Role code.

A conflict is rejected with the non-disclosing message:

> This Person has one or more Roles in another Tenant. They must work with that Tenant to have every Role other than Membership and Collaborator removed before a Role can be assigned here.

The wording deliberately tells the provisioning administrator what the Person must do without naming the other Tenant, Tenant ID, Role code, Role label, or Role Grant.

## Tenant Administrator UX

When a Tenant Administrator attempts to provision a Role for a Person who holds a non-baseline Role elsewhere, the Tenant Authorization candidate projection exposes only a non-sensitive conflict indicator:

```json
{
  "hasDelegatedAuthorityInOtherTenant": true
}
```

The existing field name reflects the authorization model, where Tenant Roles are delegated authority. Its eligibility semantics are broader than today's named operator Roles: **any active `TENANT`-scoped Role in another Tenant sets the conflict flag.**

The UI disables Role provisioning and explains that the Person must work with the other Tenant to have all Roles other than Membership and Collaborator removed. It never reveals the other Tenant or Roles.

The Tenant Administrator candidate projection used when assigning `TENANT_ADMIN` applies the same global-Person rule. Neither projection exposes the other Tenant ID, Tenant name, Role code, Role label, or Role Grant.

Existing same-Tenant Role Grants remain visible to administrators of that Tenant and can be explicitly revoked there.

## Database migration

Migration `000071_cross_tenant_delegated_role_isolation.up.sql`:

1. scans existing canonical AccountActor/Membership identity for a global Person with active `TENANT`-scoped Role Grants in more than one Tenant;
2. lifecycle-suspends every active Tenant Role Grant for each such Person, preserving every assignment while making all conflicting delegated authority ineffective;
3. verifies that no Person retains effective (`active=1`, `lifecycle_suspended=0`) Tenant delegated authority in more than one Tenant;
4. installs INSERT and UPDATE guards on `authz_actor_role_grants`;
5. guards both new grants and reactivation of historical inactive/suspended grants until explicit revocation resolves the assigned cross-Tenant conflict;
6. matches Roles by `scope_type = 'TENANT'`, not by a list of Role codes.

The down migration removes only the two Bite 32.4 triggers.

## Release verification

The migrated-database verifier requires both Bite 32.4 triggers and proves that no global Person has effective (`active=1`, `lifecycle_suspended=0`) `TENANT`-scoped Role Grants in more than one Tenant. Historical assigned conflicts may remain only while lifecycle-suspended pending explicit administrator reconciliation. Test release rehearsal and Production release evidence advance through migration `000071`.

## Automated coverage

Backend/domain coverage proves:

- multiple non-baseline Roles in one Tenant are allowed;
- Membership/Collaborator participation across multiple Tenants does not block Role eligibility;
- an existing Tenant Role blocks another Tenant Role for the same Person;
- mixed operator/`TENANT_ADMIN` conflicts are blocked;
- an unenumerated future `TENANT`-scoped Role is blocked by the same invariant;
- lifecycle suspension does not release the boundary;
- explicit revocation releases the boundary;
- the rejection message does not disclose another Tenant or Role;
- Tenant-role candidate projection exposes only the boolean conflict flag;
- Tenant Administrator candidates are blocked by any Role in another Tenant without disclosing that Tenant or Role.

Migration coverage proves:

- pre-existing conflicts are quarantined fail-closed by lifecycle-suspending every conflicting grant without selecting a winning Tenant or revoking history;
- direct INSERT cannot bypass the invariant;
- reactivation cannot bypass the invariant;
- a future/unlisted `TENANT`-scoped Role is governed by the trigger;
- explicit revocation permits Role provisioning in another Tenant;
- global Application Administrator grants remain outside the Tenant boundary;
- the down migration removes the Bite 32.4 guards.

Frontend coverage proves that a conflicting candidate is not Role-eligible, the administrator receives the non-disclosing explanation, and Membership/Collaborator-only multi-Tenant participation remains eligible.

## I18N

All Bite 32.4 user-facing conflict text is provided in both supported locales:

```text
en-US
pt-BR
```

Internal Role codes, database identifiers, and authorization invariants remain language-neutral/English.
