# Bite 30K.3B — Physical Legacy Schema Removal and Migration Hardening

## Purpose

Bite 30K.3A made legacy identity storage inert while preserving it for one bridge release. Bite 30K.3B completes that cutover by physically removing the retired schema and hardening the destructive migration boundary.

Current identity is canonical only:

`Authentication Account → AccountActor → Person-Tenant Membership → Global Person → Collaborator Journey`

Application Administrator identity remains:

`Authentication Account → GLOBAL AccountActor → APPLICATION Actor`

No current runtime identity may be reconstructed from a retired compatibility column or the legacy `people` table.

## Migration 000069

`000069_physical_legacy_identity_schema_removal.up.sql` is the irreversible physical-removal migration.

Before destructive DDL begins, the migration fails closed unless the canonical foundation is complete. It rejects migration when any Authentication Account lacks an AccountActor, a TENANT AccountActor lacks a valid same-Tenant Membership owned by the Account Person, a GLOBAL binding carries tenant/Person identity, one Account mixes GLOBAL and TENANT bindings, a Collaborator Journey lacks a valid same-Tenant Membership, or a legacy Person row has no canonical Person-Tenant Membership bridge.

The migration also refuses to discard historical authorization grants that still reference obsolete `PERSON` / `SELF` role catalog state. Such history requires an explicit archival decision rather than implicit deletion.

## Physically removed schema

Migration 000069 removes:

- `auth_user_accounts.actor_id`
- `auth_account_actors.is_primary`
- `authz_actors.person_id`
- `authz_actors.collaborator_id`
- `person_tenant_memberships.legacy_person_id`
- `collaborator_journeys.person_id`
- the legacy `people` table
- obsolete unreferenced `PERSON` / `SELF` authorization catalog rows
- the 30K.3A write-prohibition triggers whose target columns no longer exist

`collaborator_journeys.membership_id` remains required and is the sole Collaborator-to-Person identity link.

`people_search_index` remains a derived canonical search projection keyed by Membership and Global Person identity; it is rebuilt during migration without any dependency on `people`.

## Runtime hardening

Current persistence models no longer declare the removed columns. The runtime database `AutoMigrate` list no longer includes the legacy `Person` model, so a normal startup cannot recreate the `people` table. The old global-Person legacy repair helper is removed because 30K.3B no longer permits runtime reconstruction from legacy rows.

Application Administrator provisioning no longer issues writes against retired Actor identity columns. Authentication Administration no longer publishes a deprecated per-Actor `primary` property; any compatibility top-level Actor projection is derived deterministically from the canonical AccountActor list.

The static legacy-identity dependency check now verifies the 30K.3B physical-removal contract rather than merely proving that legacy fields are inert.

## Migration atomicity and history hardening

The destructive migration runs inside `BEGIN IMMEDIATE ... COMMIT`. A failure at any guard or later DDL step rolls back the whole schema change.

Migration 000069 also inserts its own `schema_migrations` marker inside that same transaction. This eliminates the failure window in which destructive DDL could commit but the process could terminate before a separate migration-history write.

Generic migration runners retain their ordinary post-success marker operation, but use `INSERT OR IGNORE`, making that bookkeeping safe for the self-recording 000069 migration. Local migration execution also uses SQLite `-bail` so the process exits immediately on SQL errors.

## Rehearsal and deployment verification

Release rehearsal advances through 000070. Migration `000070_revoke_noncanonical_application_admin_grants.up.sql` hardens the canonical Application Administrator boundary for historical server databases: any still-active global `APPLICATION_ADMIN` grant that lacks a valid GLOBAL AccountActor, carries a TENANT AccountActor, or is attached to a Person-linked GLOBAL Account is deactivated while its Actor/grant row remains for history. Valid canonical Application Administrators are unchanged.

The rehearsal deliberately seeds a bootstrap-era orphan Application Administrator after 000069 and proves that 000070 revokes its standing authority without deleting its historical Actor. The migrated-database verifier then proves:

- the legacy `people` table is absent;
- all six retired identity columns are absent;
- `collaborator_journeys.membership_id` remains NOT NULL;
- obsolete 30K.3A write guards are absent;
- canonical `people_search_index` columns are present;
- obsolete `PERSON` / `SELF` catalog rows are absent;
- foreign-key and SQLite integrity checks remain clean;
- Application Administrator identity remains GLOBAL/control-plane only.

## Rollback

Migrations 000069 and 000070 are intentionally not synthetically reversible. Restoring retired columns from current canonical state would manufacture historical identity semantics that 30K.3B explicitly eliminated.

Rollback therefore requires restoration of the verified database backup taken before the relevant irreversible migration.
