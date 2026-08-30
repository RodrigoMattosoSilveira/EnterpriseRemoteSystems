-- Bite 30H — Tenant Administrator cardinality
--
-- Invariants:
--   * A Tenant may have zero, one, or two active TENANT_ADMIN Role Grants.
--   * The two slots, when both are occupied, must belong to distinct global Persons.
--   * A global Person may hold active TENANT_ADMIN authority in only one Tenant at a time.
--   * Actor deactivation does not free a slot; the Role Grant must be explicitly revoked.
--
-- Canonical Person identity is resolved through the Bite 30 Account/Actor +
-- Person/Tenant Membership foundation. authz_actors.person_id is a tenant-local
-- legacy Person projection and MUST NOT be used for cross-Tenant cardinality.
--
-- Migration never chooses a "winner" for legacy conflicts. Any pre-existing
-- violation must be reconciled explicitly before this migration is applied.

CREATE TEMP TABLE bite30h_tenant_admin_guard (id INTEGER);

-- Every active Tenant Administrator must be a canonical tenant Actor whose
-- Account/Actor binding points at a Person/Tenant Membership for the same Tenant.
CREATE TEMP TRIGGER bite30h_verify_tenant_admin_global_person
BEFORE INSERT ON bite30h_tenant_admin_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  WHERE g.role_id = 'authz-role-tenant-admin'
    AND g.active = 1
    AND NOT EXISTS (
      SELECT 1
      FROM auth_account_actors aa
      JOIN person_tenant_memberships m
        ON m.id = aa.membership_id
       AND m.tenant_id = aa.tenant_id
      WHERE aa.actor_id = g.actor_id
        AND aa.scope_type = 'TENANT'
        AND aa.tenant_id = g.tenant_id
        AND m.person_id IS NOT NULL
        AND TRIM(m.person_id) <> ''
    )
)
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_global_person_required');
END;
INSERT INTO bite30h_tenant_admin_guard(id) VALUES (1);
DROP TRIGGER bite30h_verify_tenant_admin_global_person;
DELETE FROM bite30h_tenant_admin_guard;

CREATE TEMP TRIGGER bite30h_verify_tenant_admin_tenant_limit
BEFORE INSERT ON bite30h_tenant_admin_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  WHERE g.role_id = 'authz-role-tenant-admin'
    AND g.active = 1
  GROUP BY g.tenant_id
  HAVING COUNT(*) > 2
)
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_tenant_limit');
END;
INSERT INTO bite30h_tenant_admin_guard(id) VALUES (1);
DROP TRIGGER bite30h_verify_tenant_admin_tenant_limit;
DELETE FROM bite30h_tenant_admin_guard;

CREATE TEMP TRIGGER bite30h_verify_tenant_admin_distinct_persons
BEFORE INSERT ON bite30h_tenant_admin_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN auth_account_actors aa
    ON aa.actor_id = g.actor_id
   AND aa.scope_type = 'TENANT'
   AND aa.tenant_id = g.tenant_id
  JOIN person_tenant_memberships m
    ON m.id = aa.membership_id
   AND m.tenant_id = aa.tenant_id
  WHERE g.role_id = 'authz-role-tenant-admin'
    AND g.active = 1
  GROUP BY g.tenant_id, m.person_id
  HAVING COUNT(*) > 1
)
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_distinct_person_required');
END;
INSERT INTO bite30h_tenant_admin_guard(id) VALUES (1);
DROP TRIGGER bite30h_verify_tenant_admin_distinct_persons;
DELETE FROM bite30h_tenant_admin_guard;

CREATE TEMP TRIGGER bite30h_verify_tenant_admin_person_tenant_limit
BEFORE INSERT ON bite30h_tenant_admin_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN auth_account_actors aa
    ON aa.actor_id = g.actor_id
   AND aa.scope_type = 'TENANT'
   AND aa.tenant_id = g.tenant_id
  JOIN person_tenant_memberships m
    ON m.id = aa.membership_id
   AND m.tenant_id = aa.tenant_id
  WHERE g.role_id = 'authz-role-tenant-admin'
    AND g.active = 1
  GROUP BY m.person_id
  HAVING COUNT(DISTINCT g.tenant_id) > 1
)
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_person_cross_tenant');
END;
INSERT INTO bite30h_tenant_admin_guard(id) VALUES (1);
DROP TRIGGER bite30h_verify_tenant_admin_person_tenant_limit;
DROP TABLE bite30h_tenant_admin_guard;

CREATE TRIGGER IF NOT EXISTS trg_tenant_admin_global_person_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM auth_account_actors aa
    JOIN person_tenant_memberships m
      ON m.id = aa.membership_id
     AND m.tenant_id = aa.tenant_id
    WHERE aa.actor_id = NEW.actor_id
      AND aa.scope_type = 'TENANT'
      AND aa.tenant_id = NEW.tenant_id
      AND m.person_id IS NOT NULL
      AND TRIM(m.person_id) <> ''
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_global_person_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_admin_global_person_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM auth_account_actors aa
    JOIN person_tenant_memberships m
      ON m.id = aa.membership_id
     AND m.tenant_id = aa.tenant_id
    WHERE aa.actor_id = NEW.actor_id
      AND aa.scope_type = 'TENANT'
      AND aa.tenant_id = NEW.tenant_id
      AND m.person_id IS NOT NULL
      AND TRIM(m.person_id) <> ''
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_global_person_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_admin_tenant_limit_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND (
    SELECT COUNT(*)
    FROM authz_actor_role_grants g
    WHERE g.role_id = 'authz-role-tenant-admin'
      AND g.active = 1
      AND g.tenant_id = NEW.tenant_id
  ) >= 2
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_tenant_limit');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_admin_tenant_limit_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND (
    SELECT COUNT(*)
    FROM authz_actor_role_grants g
    WHERE g.role_id = 'authz-role-tenant-admin'
      AND g.active = 1
      AND g.tenant_id = NEW.tenant_id
      AND g.id <> OLD.id
  ) >= 2
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_tenant_limit');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_admin_distinct_person_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.role_id = 'authz-role-tenant-admin'
     AND existing_g.active = 1
     AND existing_g.tenant_id = NEW.tenant_id
    JOIN auth_account_actors existing_aa
      ON existing_aa.actor_id = existing_g.actor_id
     AND existing_aa.scope_type = 'TENANT'
     AND existing_aa.tenant_id = existing_g.tenant_id
    JOIN person_tenant_memberships existing_m
      ON existing_m.id = existing_aa.membership_id
     AND existing_m.tenant_id = existing_aa.tenant_id
    WHERE new_aa.actor_id = NEW.actor_id
      AND new_aa.scope_type = 'TENANT'
      AND new_aa.tenant_id = NEW.tenant_id
      AND existing_m.person_id = new_m.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_distinct_person_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_admin_distinct_person_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.role_id = 'authz-role-tenant-admin'
     AND existing_g.active = 1
     AND existing_g.tenant_id = NEW.tenant_id
     AND existing_g.id <> OLD.id
    JOIN auth_account_actors existing_aa
      ON existing_aa.actor_id = existing_g.actor_id
     AND existing_aa.scope_type = 'TENANT'
     AND existing_aa.tenant_id = existing_g.tenant_id
    JOIN person_tenant_memberships existing_m
      ON existing_m.id = existing_aa.membership_id
     AND existing_m.tenant_id = existing_aa.tenant_id
    WHERE new_aa.actor_id = NEW.actor_id
      AND new_aa.scope_type = 'TENANT'
      AND new_aa.tenant_id = NEW.tenant_id
      AND existing_m.person_id = new_m.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_distinct_person_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_admin_person_cross_tenant_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.role_id = 'authz-role-tenant-admin'
     AND existing_g.active = 1
     AND existing_g.tenant_id <> NEW.tenant_id
    JOIN auth_account_actors existing_aa
      ON existing_aa.actor_id = existing_g.actor_id
     AND existing_aa.scope_type = 'TENANT'
     AND existing_aa.tenant_id = existing_g.tenant_id
    JOIN person_tenant_memberships existing_m
      ON existing_m.id = existing_aa.membership_id
     AND existing_m.tenant_id = existing_aa.tenant_id
    WHERE new_aa.actor_id = NEW.actor_id
      AND new_aa.scope_type = 'TENANT'
      AND new_aa.tenant_id = NEW.tenant_id
      AND existing_m.person_id = new_m.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_person_cross_tenant');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_admin_person_cross_tenant_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.role_id = 'authz-role-tenant-admin'
     AND existing_g.active = 1
     AND existing_g.tenant_id <> NEW.tenant_id
     AND existing_g.id <> OLD.id
    JOIN auth_account_actors existing_aa
      ON existing_aa.actor_id = existing_g.actor_id
     AND existing_aa.scope_type = 'TENANT'
     AND existing_aa.tenant_id = existing_g.tenant_id
    JOIN person_tenant_memberships existing_m
      ON existing_m.id = existing_aa.membership_id
     AND existing_m.tenant_id = existing_aa.tenant_id
    WHERE new_aa.actor_id = NEW.actor_id
      AND new_aa.scope_type = 'TENANT'
      AND new_aa.tenant_id = NEW.tenant_id
      AND existing_m.person_id = new_m.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_person_cross_tenant');
END;
