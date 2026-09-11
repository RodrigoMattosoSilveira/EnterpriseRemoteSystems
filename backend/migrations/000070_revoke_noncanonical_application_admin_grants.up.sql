-- Bite 30K.3B migration hardening — historical Production databases may
-- contain an active APPLICATION_ADMIN grant for a bootstrap-era Actor that was
-- never linked to a canonical GLOBAL Authentication Account. Such grants are
-- not valid current identity and must not remain effective after the canonical
-- identity cutover. Preserve the Actor and grant row for history, but revoke
-- standing authority by deactivating only grants that violate the GLOBAL
-- AccountActor contract.
PRAGMA foreign_keys = ON;

BEGIN IMMEDIATE;

UPDATE authz_actor_role_grants AS g
SET active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE g.active = 1
  AND g.tenant_id = '*'
  AND EXISTS (
    SELECT 1
    FROM authz_roles r
    WHERE r.id = g.role_id
      AND r.code = 'APPLICATION_ADMIN'
  )
  AND (
    NOT EXISTS (
      SELECT 1
      FROM auth_account_actors aa
      JOIN auth_user_accounts account
        ON account.id = aa.account_id
      WHERE aa.actor_id = g.actor_id
        AND aa.scope_type = 'GLOBAL'
        AND aa.tenant_id IS NULL
        AND aa.membership_id IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM auth_account_actors aa
      WHERE aa.actor_id = g.actor_id
        AND aa.scope_type = 'TENANT'
    )
    OR EXISTS (
      SELECT 1
      FROM auth_account_actors aa
      JOIN auth_account_people ap
        ON ap.account_id = aa.account_id
      WHERE aa.actor_id = g.actor_id
        AND aa.scope_type = 'GLOBAL'
    )
  );

-- Fail closed if any effective global Application Administrator grant still
-- violates canonical identity after reconciliation.
CREATE TEMP TABLE bite30k3b_application_admin_guard (id INTEGER);
CREATE TEMP TRIGGER bite30k3b_verify_application_admin_identity
BEFORE INSERT ON bite30k3b_application_admin_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN authz_roles r
    ON r.id = g.role_id
   AND r.code = 'APPLICATION_ADMIN'
  WHERE g.tenant_id = '*'
    AND g.active = 1
    AND g.lifecycle_suspended = 0
    AND (
      NOT EXISTS (
        SELECT 1
        FROM auth_account_actors aa
        JOIN auth_user_accounts account
          ON account.id = aa.account_id
        WHERE aa.actor_id = g.actor_id
          AND aa.scope_type = 'GLOBAL'
          AND aa.tenant_id IS NULL
          AND aa.membership_id IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM auth_account_actors aa
        WHERE aa.actor_id = g.actor_id
          AND aa.scope_type = 'TENANT'
      )
      OR EXISTS (
        SELECT 1
        FROM auth_account_actors aa
        JOIN auth_account_people ap
          ON ap.account_id = aa.account_id
        WHERE aa.actor_id = g.actor_id
          AND aa.scope_type = 'GLOBAL'
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'noncanonical_application_admin_grant_reconciliation_failed');
END;
INSERT INTO bite30k3b_application_admin_guard(id) VALUES (1);
DROP TRIGGER bite30k3b_verify_application_admin_identity;
DROP TABLE bite30k3b_application_admin_guard;

COMMIT;
