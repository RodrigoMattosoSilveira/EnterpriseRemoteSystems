PRAGMA foreign_keys = ON;

-- Bite 32.4 generalizes the Bite 30H Tenant Administrator Person/Tenant
-- boundary to every active tenant-scoped delegated Role Grant. A global Person
-- may participate in many Tenants through Memberships and Collaborator
-- Journeys, but delegated Tenant authority may be assigned in only one Tenant
-- at a time. lifecycle_suspended grants remain assigned (active=1) and continue
-- to reserve that authority Tenant until explicitly revoked.
--
-- Refuse to choose a winning Tenant for any legacy conflict. Automatic
-- revocation would be an authorization decision with no safe deterministic
-- answer; operators must explicitly reconcile such data before migration.
CREATE TEMP TABLE bite324_delegated_role_guard (
  id INTEGER PRIMARY KEY
);

CREATE TEMP TRIGGER bite324_verify_existing_cross_tenant_delegated_roles
BEFORE INSERT ON bite324_delegated_role_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN authz_roles r
    ON r.id = g.role_id
   AND r.scope_type = 'TENANT'
  JOIN auth_account_actors aa
    ON aa.actor_id = g.actor_id
   AND aa.scope_type = 'TENANT'
   AND aa.tenant_id = g.tenant_id
  JOIN person_tenant_memberships m
    ON m.id = aa.membership_id
   AND m.tenant_id = aa.tenant_id
  WHERE g.active = 1
  GROUP BY m.person_id
  HAVING COUNT(DISTINCT g.tenant_id) > 1
)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_delegated_role_conflict_existing');
END;

INSERT INTO bite324_delegated_role_guard(id) VALUES (1);
DROP TRIGGER bite324_verify_existing_cross_tenant_delegated_roles;
DROP TABLE bite324_delegated_role_guard;

CREATE TRIGGER IF NOT EXISTS trg_delegated_role_person_cross_tenant_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM authz_roles new_role
    WHERE new_role.id = NEW.role_id
      AND new_role.scope_type = 'TENANT'
  )
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.active = 1
     AND existing_g.tenant_id <> NEW.tenant_id
    JOIN authz_roles existing_role
      ON existing_role.id = existing_g.role_id
     AND existing_role.scope_type = 'TENANT'
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
  SELECT RAISE(ABORT, 'delegated_role_person_cross_tenant');
END;

CREATE TRIGGER IF NOT EXISTS trg_delegated_role_person_cross_tenant_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM authz_roles new_role
    WHERE new_role.id = NEW.role_id
      AND new_role.scope_type = 'TENANT'
  )
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.active = 1
     AND existing_g.tenant_id <> NEW.tenant_id
     AND existing_g.id <> OLD.id
    JOIN authz_roles existing_role
      ON existing_role.id = existing_g.role_id
     AND existing_role.scope_type = 'TENANT'
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
  SELECT RAISE(ABORT, 'delegated_role_person_cross_tenant');
END;
