PRAGMA foreign_keys = ON;
DROP INDEX IF EXISTS idx_authz_actor_role_grants_lifecycle_suspended;
DROP INDEX IF EXISTS idx_auth_user_accounts_security_suspended;
DROP INDEX IF EXISTS idx_global_people_operational_active;
ALTER TABLE authz_actor_role_grants DROP COLUMN lifecycle_suspended;
ALTER TABLE auth_user_accounts DROP COLUMN security_suspended;
ALTER TABLE global_people DROP COLUMN operational_active;
