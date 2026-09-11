# Bite 30K.2B1 — Authentication Administration Canonical AccountActor Projection Cutover

## Purpose

30K.2B1 removes Authentication Administration read/display dependence on the
legacy single/default Actor pointer and the legacy AccountActor primary flag.

The canonical Administration projection is:

```
Authentication Account
  -> auth_account_people -> Global Person (ordinary Person Accounts only)
  -> auth_account_actors
       -> Person-Tenant Membership (TENANT binding)
            -> Global Person
            -> current Collaborator Journey, when one exists
```

A GLOBAL Application Administrator Account has a GLOBAL AccountActor binding
and intentionally has no Person or Membership.

## Runtime rules established by this bite

- `auth_user_accounts.actor_id` is not read when listing or fetching
  Authentication Accounts.
- `auth_account_actors.is_primary` is not read when hydrating or ordering Actor
  bindings.
- `authz_actors.person_id` and `authz_actors.collaborator_id` are not read for
  Authentication Administration identity display.
- Tenant Actor Person identity comes from the exact AccountActor Membership.
- Current Collaborator identity, when present, comes from the open Journey for
  that Membership.
- The old top-level Account Actor fields remain in the response temporarily for
  compatibility, but are deterministically projected from the canonical
  AccountActor binding list rather than legacy storage.
- If an Account has no canonical AccountActor bindings, the UI makes that
  condition explicit and does not reconstruct identity from the legacy pointer.

## Deliberately deferred

30K.2B1 does not change the public Account provisioning contract and does not
remove physical compatibility columns. Those are handled next:

- 30K.2B2 — Authentication Provisioning + Authorization Identity Cutover
- 30K.3 — physical legacy schema removal and migration hardening
