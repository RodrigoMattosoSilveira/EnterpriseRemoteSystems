# Bite 30K.2A — Authenticated Session → AccountActor Runtime Cutover

## Purpose

30K.2A removes the final effective-identity fallback from an authenticated
browser session to the legacy single-Actor fields retained on the Session and
Authentication Account compatibility schema.

A persisted authenticated request now resolves identity only as:

`Session → Authentication Account → selected context → auth_account_actors → effective Actor`

The legacy hidden `SessionResponse.actorId` / `actorKey` fields remain inert
compatibility data until 30K.3 removes the corresponding persisted schema. They
MUST NOT select or recover an effective Actor.

## Runtime changes

- `GET /api/v1/auth/tenant-options` resolves options only through the
  authenticated Account's `auth_account_actors` bindings.
- Authenticated route authorization requires a non-empty `accountId` and an
  `AccountActorStore`.
- A spoofed Actor header cannot override an authenticated Account.
- A missing canonical Account identity cannot fall back to hidden legacy
  Session Actor fields.
- Header/test Actor lookup remains available only for the existing explicit
  non-session bootstrap/test modes.

## Explicitly deferred to 30K.2B

30K.2A does not yet remove or reinterpret Authentication Administration or
Authorization Administration compatibility fields. 30K.2B owns:

- Account provisioning by canonical Person/Membership identity;
- account-list/default-Actor compatibility presentation;
- removal of `is_primary` from runtime/admin behavior;
- removal of Actor `person_id` / `collaborator_id` from runtime/admin behavior;
- removal of `PERSON` / `SELF` from effective administrative authorization;
- Authentication/Authz frontend administrative cutover.

## Deferred to 30K.3

Physical schema removal remains 30K.3, including deletion of:

- `auth_user_accounts.actor_id`;
- `auth_account_actors.is_primary`;
- `authz_actors.person_id`;
- `authz_actors.collaborator_id`;
- obsolete `PERSON` / `SELF` schema state.
