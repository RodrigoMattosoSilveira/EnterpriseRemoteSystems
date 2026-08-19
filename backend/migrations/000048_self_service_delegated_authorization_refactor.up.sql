PRAGMA foreign_keys = ON;

-- Bite 30D separates intrinsic Person/self-service authorization from
-- delegated Role Grants. Preserve the historical PERSON catalog/grant rows for
-- auditability, but make them inactive so they can no longer authorize runtime
-- requests.
UPDATE authz_actor_role_grants
SET active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE active = 1
  AND role_id IN (
    SELECT id FROM authz_roles WHERE code = 'PERSON' OR scope_type = 'SELF'
  );

UPDATE authz_roles
SET active = 0,
    description = 'Deprecated by Bite 30D. Self-service authorization is intrinsic to Account -> tenant Actor -> Membership -> Person identity.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'PERSON' OR scope_type = 'SELF';

-- Establish explicit control-plane permissions for Application
-- Administrators. These catalog entries historically came from Go bootstrap
-- seeding rather than SQL migrations, so make the migration self-contained.
-- The pre-existing wildcard compatibility is intentionally retained until
-- Bite 30H removes standing tenant-data authority.
INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at) VALUES
('authz.self.read', 'Read own authorization context', 'Read the current persisted actor, effective roles, scope, and permissions.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.read', 'Read authorization administration', 'Read authorization actors, roles, permissions, and grants.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.manage', 'Manage authorization administration', 'Create authorization actors and manage role grants.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at) VALUES
('authz-role-application-admin', 'authz.self.read', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'authz.read', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'authz.manage', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'tenants.read', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'tenants.create', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'tenants.update', CURRENT_TIMESTAMP);

UPDATE authz_roles
SET description = 'Application-global control-plane administration; legacy tenant-data compatibility remains until Bite 30H.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'APPLICATION_ADMIN';

-- Existing tenant delegated grants that no longer match an explicit tenant
-- Actor binding cannot remain effective after the 30D cutover. Unbound actors
-- do not represent an operable tenant identity.
UPDATE authz_actor_role_grants
SET active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE active = 1
  AND role_id IN (
    SELECT id FROM authz_roles WHERE scope_type = 'TENANT'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM auth_account_actors aa
    WHERE aa.actor_id = authz_actor_role_grants.actor_id
      AND aa.scope_type = 'TENANT'
      AND aa.tenant_id = authz_actor_role_grants.tenant_id
  );

-- A tenant Actor can never carry an application/global Role Grant.
UPDATE authz_actor_role_grants
SET active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE active = 1
  AND role_id IN (
    SELECT id FROM authz_roles WHERE scope_type = 'APPLICATION'
  )
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors aa
    WHERE aa.actor_id = authz_actor_role_grants.actor_id
      AND aa.scope_type = 'TENANT'
  );

-- Future Role Grants must match the explicit Actor scope. Self-service Roles
-- are not delegable at all; tenant Roles require the Actor's exact tenant
-- binding; global Roles cannot be attached to tenant Actors.
CREATE TRIGGER IF NOT EXISTS trg_authz_grants_actor_scope_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.active = 1 AND (
  EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND (r.scope_type = 'SELF' OR r.code = 'PERSON')
  )
  OR EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND r.scope_type = 'TENANT'
      AND NOT EXISTS (
        SELECT 1 FROM auth_account_actors aa
        WHERE aa.actor_id = NEW.actor_id
          AND aa.scope_type = 'TENANT'
          AND aa.tenant_id = NEW.tenant_id
      )
  )
  OR EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND r.scope_type = 'APPLICATION'
      AND EXISTS (
        SELECT 1 FROM auth_account_actors aa
        WHERE aa.actor_id = NEW.actor_id
          AND aa.scope_type = 'TENANT'
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'authorization_actor_scope_invalid');
END;

CREATE TRIGGER IF NOT EXISTS trg_authz_grants_actor_scope_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.active = 1 AND (
  EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND (r.scope_type = 'SELF' OR r.code = 'PERSON')
  )
  OR EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND r.scope_type = 'TENANT'
      AND NOT EXISTS (
        SELECT 1 FROM auth_account_actors aa
        WHERE aa.actor_id = NEW.actor_id
          AND aa.scope_type = 'TENANT'
          AND aa.tenant_id = NEW.tenant_id
      )
  )
  OR EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND r.scope_type = 'APPLICATION'
      AND EXISTS (
        SELECT 1 FROM auth_account_actors aa
        WHERE aa.actor_id = NEW.actor_id
          AND aa.scope_type = 'TENANT'
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'authorization_actor_scope_invalid');
END;

PRAGMA foreign_keys = ON;
