PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_auth_account_actor_identity_immutable;
DROP TRIGGER IF EXISTS trg_auth_account_actor_tenant_person_insert;
DROP TRIGGER IF EXISTS trg_auth_account_actor_tenant_no_global_actor_insert;
DROP TRIGGER IF EXISTS trg_auth_account_actor_global_no_tenant_actor_insert;
DROP TRIGGER IF EXISTS trg_auth_account_actor_global_no_person_insert;
DROP TRIGGER IF EXISTS trg_auth_account_people_no_global_actor_insert;

DROP INDEX IF EXISTS idx_auth_account_actors_membership;
DROP INDEX IF EXISTS idx_auth_account_actors_tenant;
DROP INDEX IF EXISTS ux_auth_account_actors_account_primary;
DROP INDEX IF EXISTS ux_auth_account_actors_account_global;
DROP INDEX IF EXISTS ux_auth_account_actors_account_tenant;

DROP TABLE IF EXISTS auth_account_actors;
DROP TABLE IF EXISTS auth_account_people;
