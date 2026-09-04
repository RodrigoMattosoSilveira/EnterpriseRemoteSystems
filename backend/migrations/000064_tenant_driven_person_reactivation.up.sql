PRAGMA foreign_keys = ON;

-- Bite 30I.1 follow-up separates operational Person lifecycle from global
-- Authentication Account security suspension and from historical Role Grant
-- assignment. These flags make Tenant-driven reactivation explicit without
-- erasing historical authorization records or releasing 30H administrator slots.
ALTER TABLE global_people
  ADD COLUMN operational_active INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_global_people_operational_active
  ON global_people(operational_active);

ALTER TABLE auth_user_accounts
  ADD COLUMN security_suspended INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_auth_user_accounts_security_suspended
  ON auth_user_accounts(security_suspended);

ALTER TABLE authz_actor_role_grants
  ADD COLUMN lifecycle_suspended INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_authz_actor_role_grants_lifecycle_suspended
  ON authz_actor_role_grants(lifecycle_suspended);

-- INACTIVE is the explicit operational-deactivation state. An existing
-- Person with any ACTIVE Membership remains operationally active; a Person with
-- no ACTIVE Membership is considered operationally inactive only when at least
-- one Membership is explicitly INACTIVE. DISCONTINUED remains a distinct
-- tenant-local lifecycle state and is not silently reclassified as an
-- operational deactivation during migration.
UPDATE global_people
SET operational_active = CASE
  WHEN EXISTS (
    SELECT 1
    FROM person_tenant_memberships m
    JOIN reference_data s
      ON s.id = m.status_id
     AND s.tenant_id = m.tenant_id
     AND s.type = 'person_status'
     AND s.code = 'ACTIVE'
     AND s.active = 1
    WHERE m.person_id = global_people.id
  ) THEN 1
  WHEN EXISTS (
    SELECT 1
    FROM person_tenant_memberships m
    JOIN reference_data s
      ON s.id = m.status_id
     AND s.tenant_id = m.tenant_id
     AND s.type = 'person_status'
     AND s.code = 'INACTIVE'
     AND s.active = 1
    WHERE m.person_id = global_people.id
  ) THEN 0
  ELSE 1
END;

-- Historical inactive Accounts predate the operational/security distinction.
-- Treat them conservatively as security suspensions; a Tenant Administrator
-- must never be allowed to override an ambiguous legacy global deactivation.
UPDATE auth_user_accounts
SET security_suspended = 1
WHERE active = 0;

-- An Account that was still marked active while its Person was explicitly
-- INACTIVE is operationally unavailable, not security-suspended. Normalize the
-- persisted Account flag so Tenant-driven reactivation is the operation that
-- makes it usable again. Application Administrator Accounts have no
-- auth_account_people row and are unaffected.
UPDATE auth_user_accounts
SET active = 0
WHERE active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_people ap
    JOIN global_people gp ON gp.id = ap.person_id
    WHERE ap.account_id = auth_user_accounts.id
      AND gp.operational_active = 0
  );

-- Likewise, normalize Tenant Actor rows attached to non-ACTIVE Memberships.
-- The actor records and grants are retained; only effective access is disabled.
UPDATE authz_actors
SET active = 0
WHERE EXISTS (
  SELECT 1
  FROM auth_account_actors aa
  JOIN person_tenant_memberships m
    ON m.id = aa.membership_id
   AND m.tenant_id = aa.tenant_id
  JOIN reference_data s
    ON s.id = m.status_id
   AND s.tenant_id = m.tenant_id
   AND s.type = 'person_status'
  WHERE aa.actor_id = authz_actors.id
    AND aa.scope_type = 'TENANT'
    AND s.code <> 'ACTIVE'
);

-- Existing grants attached to an inactive Membership are historical assignments,
-- not effective authority. Keep active=1 so Tenant Administrator cardinality is
-- unchanged, but suspend effective authorization until explicitly re-granted.
UPDATE authz_actor_role_grants
SET lifecycle_suspended = 1
WHERE active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors aa
    JOIN person_tenant_memberships m
      ON m.id = aa.membership_id
     AND m.tenant_id = aa.tenant_id
    JOIN reference_data s
      ON s.id = m.status_id
     AND s.tenant_id = m.tenant_id
     AND s.type = 'person_status'
    WHERE aa.actor_id = authz_actor_role_grants.actor_id
      AND aa.scope_type = 'TENANT'
      AND aa.tenant_id = authz_actor_role_grants.tenant_id
      AND s.code <> 'ACTIVE'
  );
