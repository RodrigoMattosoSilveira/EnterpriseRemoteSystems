# Bite 30K.3A — Legacy Identity Dependency Elimination

## Purpose

30K.3A is the non-destructive prerequisite to physical legacy identity schema
removal. It makes canonical identity the only current runtime and operational
writer while retaining historical compatibility columns/data for one release.

The canonical identity graph is:

```text
Authentication Account
        |
        +--> GLOBAL AccountActor --> APPLICATION Actor
        |
        +--> TENANT AccountActor
                    |
                    v
          Person-Tenant Membership
                    |
                    v
               Global Person
                    |
                    v
          Collaborator Journey
```

No current identity may be reconstructed from `auth_user_accounts.actor_id`,
`auth_account_actors.is_primary`, `authz_actors.person_id`,
`authz_actors.collaborator_id`, `person_tenant_memberships.legacy_person_id`,
`collaborator_journeys.person_id`, or the legacy `people` table.

## Migration 000068 — bridge, not removal

`000068_legacy_identity_dependency_elimination.up.sql` deliberately preserves
legacy columns and historical values. It first fails if the canonical
AccountActor/Membership foundations needed by current identities are incomplete.

It then:

- makes `auth_user_accounts.actor_id` nullable;
- makes `collaborator_journeys.person_id` nullable while keeping
  `membership_id` required;
- removes the obsolete single-primary AccountActor index;
- removes active Membership-to-legacy-Person projection triggers;
- removes legacy Collaborator Person indexes;
- preserves unrelated authentication, tenant-integrity, collaborator,
  settlement, and audit constraints;
- installs triggers that reject new or changed values in every retired identity
  column while allowing existing historical values to remain readable.

The bridge therefore establishes the promotion invariant:

```text
legacy schema physically present
+ legacy historical data preserved
+ no new legacy identity writes
+ no current runtime/tool dependency
```

## Runtime cutover

Current People writes persist `global_people` and
`person_tenant_memberships` only. Current Collaborator writes persist
`collaborator_journeys.membership_id` only. Authentication Account ownership is
validated exclusively through `auth_account_people` and `auth_account_actors`.
Startup validation fails on incomplete canonical AccountActor state instead of
repairing it from legacy Actor identity.

Application Administrator identity remains a GLOBAL AccountActor with no Person
or Tenant Membership. Tenant Actors require their exact Account Person and
Person-Tenant Membership relationship.

## Current operational tooling

The generic manual-data seed, verifier, reset report, tenant-People report, and
resettable settlement dataset all use Global Person/Membership identity. They do
not depend on the legacy `people` table or legacy Collaborator Person linkage.

`make legacy-identity-dependency-check` statically protects current production
and generic operational tooling from reintroducing retired storage dependencies.
Historical migrations, migration rehearsal fixtures, and the dedicated legacy
foundation backfill implementation are intentionally excluded because their
purpose is to understand pre-30K.3A databases.

## Migration rehearsal and deployment verification

The Test release migration rehearsal remains anchored at the deterministic
pre-30I `000062` baseline and now rehearses through `000068`. The migrated DB
verifier checks that:

- canonical integrity and foreign keys are clean;
- all 30J audit identity/history requirements remain intact;
- the 30K.3A compatibility columns are still physically present;
- the two formerly-required legacy columns are nullable;
- canonical Collaborator `membership_id` remains required;
- obsolete primary/projection constraints are absent;
- all legacy identity write-prohibition triggers are installed;
- Application Administrator standing identity remains GLOBAL-only.

## Rollback

A schema down-migration is intentionally not synthesized. After 30K.3A, new
canonical Accounts/Journeys/Memberships may legitimately have NULL legacy
identity columns. Re-imposing the previous NOT NULL/write-through contract would
require inventing identity relationships.

Rollback therefore requires restoration of the verified database backup taken
before migration `000068`.

## Deliberately deferred to 30K.3B

30K.3B is expected to use migration `000069` to physically remove the now-inert
legacy structures after 30K.3A has passed local, CI, migration rehearsal, and
manual promotion testing. Physical removal candidates remain:

- `auth_user_accounts.actor_id`;
- `auth_account_actors.is_primary`;
- `authz_actors.person_id`;
- `authz_actors.collaborator_id`;
- `person_tenant_memberships.legacy_person_id`;
- `collaborator_journeys.person_id`;
- the legacy `people` table;
- any remaining PERSON/SELF historical catalog state proven safe to remove.
