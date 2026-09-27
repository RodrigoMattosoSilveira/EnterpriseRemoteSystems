# Bite 32.4 — Cross-Tenant Delegated Role Isolation

## Purpose

Bite 32.4 generalizes the existing Tenant Administrator cross-Tenant Person boundary to every tenant-scoped delegated Role Grant.

A Person may participate in multiple Tenants as a Person, Membership holder, and Collaborator. That baseline participation is intrinsic/business identity and is not delegated authority. The same global Person must not, however, exercise or retain active delegated Tenant authority in more than one Tenant at the same time.

## Invariant

```text
One global Person
  → N Person–Tenant Memberships / Collaborator Journeys
  → active delegated Tenant Role Grants in 0..1 Tenant
```

Tenant-scoped delegated Roles currently include:

- `TENANT_ADMIN`;
- `EARNINGS_OPERATOR`;
- `EXPENSE_OPERATOR`.

Multiple delegated Roles in the same Tenant are allowed.

Application-global `APPLICATION_ADMIN` authority is a separate control-plane model and is excluded. Tenant Support Access Leases are also separate and are excluded.

## Lifecycle semantics

The boundary is based on an active Role Grant (`active=1`). A `lifecycle_suspended=1` grant remains an assigned delegated Role Grant and continues to reserve that Person's authority Tenant. Actor deactivation, Membership deactivation, or lifecycle suspension therefore does not silently free the Person for authority in another Tenant.

Only explicit Role Grant revocation (`active=0`) releases the cross-Tenant delegated-authority boundary.

This preserves the Bite 30H rule that deactivation does not silently release Tenant Administrator assignment state and applies the same explicit-revocation principle to operator authority.

## Domain enforcement

`ValidateDelegatedRoleGrant` resolves the target Tenant Actor through `auth_account_actors` and `person_tenant_memberships`, obtains the canonical global Person, and checks active tenant-scoped Role Grants for that Person in every other Tenant.

A conflict is rejected without naming the other Tenant:

> This Person already holds delegated authority in another Tenant. Revoke that Tenant's delegated Role Grants before granting authority here.

The non-disclosure wording is deliberate. A Tenant Administrator may know the Person participates elsewhere, but ERS must not reveal the identity or name of another Tenant merely to explain why delegation is blocked.

## Tenant Administrator UX

Both Tenant delegated-role administration surfaces expose only a non-sensitive boolean conflict indicator for a candidate whose global Person currently owns delegated authority elsewhere:

```json
{
  "hasDelegatedAuthorityInOtherTenant": true
}
```

The Tenant Authorization candidate projection (`GET /api/v1/authz/tenant-role-actors`) uses the flag to disable new `EARNINGS_OPERATOR` / `EXPENSE_OPERATOR` delegation. The Tenant Administrator candidate projection (`GET /api/v1/tenants/:id/admin-candidates`) uses the same Person-wide rule before a `TENANT_ADMIN` assignment is offered. Neither projection exposes the other Tenant ID, Tenant name, Role code, or Role Grant.

Both UI paths show the same localized, non-disclosing explanation in `en-US` and `pt-BR`. Existing same-Tenant Role Grants remain visible and individually revocable.

## Database migration

Migration `000071_cross_tenant_delegated_role_isolation.up.sql`:

1. scans existing canonical AccountActor/Membership identity for conflicting active tenant-scoped Role Grants;
2. aborts with `cross_tenant_delegated_role_conflict_existing` instead of arbitrarily revoking one Tenant's authority;
3. installs INSERT and UPDATE guards on `authz_actor_role_grants`;
4. guards both new grants and reactivation of historical inactive grants.

The down migration removes only the two Bite 32.4 triggers.

## Release verification

The migrated-database verifier now requires both Bite 32.4 triggers and proves no global Person has active tenant-scoped delegated Role Grants in more than one Tenant. Test release rehearsal and Production release evidence advance through migration `000071`.

## Automated coverage

Backend/domain coverage proves:

- multiple delegated Roles in one Tenant are allowed;
- baseline multi-Tenant Membership participation does not block delegation;
- operator authority in Tenant A blocks operator authority in Tenant B for the same Person;
- lifecycle suspension does not release the boundary;
- explicit revocation releases the boundary;
- the rejection message does not disclose either Tenant ID;
- Tenant Administrator cardinality is subsumed by the generalized cross-Tenant delegated-authority rule;
- Tenant-role candidate projection exposes only the boolean conflict flag;
- Tenant Administrator candidates are also blocked by operator authority in another Tenant without disclosing that Tenant.

Migration coverage proves:

- unresolved pre-existing conflicts stop migration;
- direct INSERT cannot bypass the invariant;
- reactivation cannot bypass the invariant;
- explicit revocation permits delegation in another Tenant;
- global Application Administrator grants remain outside the Tenant boundary;
- the down migration removes the Bite 32.4 guards.

Frontend coverage proves the candidate is not role-eligible while the non-sensitive cross-Tenant flag is true and remains eligible when only baseline multi-Tenant participation exists.

## I18N

All new user-facing Bite 32.4 conflict text is provided in both supported locales:

```text
en-US
pt-BR
```

Internal Role codes, database identifiers, and authorization invariants remain language-neutral/English.
