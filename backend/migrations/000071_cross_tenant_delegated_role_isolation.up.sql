PRAGMA foreign_keys = ON;

-- Bite 32.4 generalizes the Bite 30H Tenant Administrator Person/Tenant
-- boundary to every active TENANT-scoped authorization Role Grant. Membership
-- and Collaborator are baseline relationships and may exist across multiple
-- Tenants; every other Tenant Role is non-baseline and may be held in only one
-- Tenant at a time for the same global Person. The guard is deliberately based
-- on authz_roles.scope_type='TENANT', not an enumerated Role-code list, so future
-- Tenant Roles inherit the same isolation automatically. lifecycle_suspended
-- grants remain assigned (active=1) and continue to reserve that Role Tenant
-- until explicitly revoked by the Tenant where they are held.
--
-- Historical databases can predate this generalized invariant and therefore
-- contain a Person with active Tenant Role Grants in more than one Tenant. Do
-- not choose a winning Tenant and do not silently revoke any assignment. Instead
-- fail closed by lifecycle-suspending every active Tenant Role Grant belonging
-- to each conflicting Person. Suspended grants remain assigned and continue to
-- reserve their Tenant, but they confer no effective delegated authorization.
-- The affected Tenants must explicitly revoke enough historical grants to leave
-- the Person assigned in at most one Tenant before any retained Role can be
-- granted/reactivated there again.

BEGIN IMMEDIATE;

WITH conflicting_people AS (
  SELECT m.person_id
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
UPDATE authz_actor_role_grants
SET lifecycle_suspended = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE active = 1
  AND EXISTS (
    SELECT 1
    FROM authz_roles r
    JOIN auth_account_actors aa
      ON aa.actor_id = authz_actor_role_grants.actor_id
     AND aa.scope_type = 'TENANT'
     AND aa.tenant_id = authz_actor_role_grants.tenant_id
    JOIN person_tenant_memberships m
      ON m.id = aa.membership_id
     AND m.tenant_id = aa.tenant_id
    WHERE r.id = authz_actor_role_grants.role_id
      AND r.scope_type = 'TENANT'
      AND m.person_id IN (SELECT person_id FROM conflicting_people)
  );

-- Verify the reconciliation failed closed: no Person may retain effective
-- (active + not lifecycle-suspended) Tenant delegated authority in more than one
-- Tenant. Assigned suspended conflicts are intentionally preserved for explicit
-- administrator reconciliation.
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
    AND g.lifecycle_suspended = 0
  GROUP BY m.person_id
  HAVING COUNT(DISTINCT g.tenant_id) > 1
)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_delegated_role_conflict_quarantine_failed');
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
BEFORE UPDATE OF actor_id, role_id, tenant_id, active, lifecycle_suspended ON authz_actor_role_grants
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

COMMIT;
