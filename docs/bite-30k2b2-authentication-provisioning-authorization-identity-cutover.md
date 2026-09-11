# Bite 30K.2B2 — Authentication Provisioning + Authorization Identity Cutover

## Purpose

30K.2B2 finishes the non-destructive identity cutover required before 30K.3 can
physically remove legacy identity columns. Runtime and administrative
provisioning now start from canonical AccountActor, Person-Tenant Membership,
and Global Person relationships rather than legacy single-Actor or Actor-owned
Person/Collaborator pointers.

No destructive schema migration is introduced by this bite.

## Canonical Authentication provisioning

Application Authentication Administration provisions an ordinary Account from:

```text
selected Tenant + Person login email
  -> exact Global Person
  -> exact ACTIVE Person-Tenant Membership
  -> identity-neutral tenant Actor
  -> TENANT auth_account_actors binding
```

The public create-account contract no longer accepts `actorId` as the identity
selector. If the Global Person already owns an Authentication Account, ERS
reuses that Account and adds only the missing tenant Actor binding. Existing
credentials are not replaced merely because another tenant Membership is
enabled.

New administrative credentials always require a first-login password change.

The physical `auth_user_accounts.actor_id` column is still populated when a new
Account must be inserted because the pre-30K.3 schema requires it. It is not an
authoritative ownership or Actor-selection relation.

## Application Administrator provisioning

Application Administrator ownership is resolved through a `GLOBAL`
`auth_account_actors` binding. Provisioning does not discover an existing
Application Administrator Account from `auth_user_accounts.actor_id`.

A missing canonical GLOBAL binding on an existing administrator login is an
identity-foundation error and fails loudly instead of falling back to the
legacy Account Actor pointer.

## Authorization identity projection

`authz_actors.person_id` and `authz_actors.collaborator_id` no longer supply
runtime or Authorization Administration identity.

For a tenant Actor, ERS projects:

```text
Authentication Account
  -> TENANT AccountActor
  -> exact Person-Tenant Membership
  -> Global Person
  -> current open Collaborator Journey, when one exists
```

`personId` returned in current-Actor and Authorization Administration responses
therefore denotes the canonical Global Person ID. `collaboratorId` is derived
from the current open Journey for the exact Membership.

Raw Authorization Actor creation is identity-neutral and no longer accepts
Person or Collaborator identity inputs.

## Delegated authorization

Intrinsic self-service remains derived from canonical Person/Membership and
current-Journey identity. It is not represented by a grantable `PERSON` Role or
`SELF` scope.

Upgraded databases may still physically contain historical `PERSON` / `SELF`
role rows until 30K.3, but Authorization Administration does not list or grant
them.

Tenant Role Grants require the target Actor to have an exact tenant AccountActor
binding. Application-scoped Role Grants require the target Actor to have a
canonical `GLOBAL` AccountActor binding owned by an Authentication Account.

## Lifecycle and deterministic fixtures

Person deactivation discovers affected tenant Actors through Membership and
AccountActor relationships rather than `authz_actors.person_id`.

Tenant reactivation creates an identity-neutral Actor when a new Actor is
required and binds it to the exact Membership.

Deterministic non-production Tenant Administrator provisioning likewise writes
identity-neutral Actors and `is_primary = false` AccountActor compatibility
values.

## Compatibility intentionally retained for 30K.3

30K.2B2 does not physically remove:

- `auth_user_accounts.actor_id`;
- `auth_account_actors.is_primary`;
- `authz_actors.person_id`;
- `authz_actors.collaborator_id`;
- legacy Person compatibility storage;
- startup foundation/backfill code that must understand historical rows.

`EnsureAccountActorFoundation` remains a migration/backfill compatibility
boundary. It may inspect historical structures so an upgraded database can be
repaired before 30K.3 removes those structures. Runtime identity selection and
administrative provisioning do not use those fields as authority.

`auth_account_actors.is_primary` remains physical compatibility storage only.
Runtime Actor selection and administrative ordering ignore it.

## 30K.3 prerequisite established by this bite

After 30K.2B2, 30K.3 can inventory the remaining references to legacy identity
columns as migration/backfill, tests, historical compatibility, or dead code
without leaving a deliberate runtime/admin provisioning dependency on those
columns.
