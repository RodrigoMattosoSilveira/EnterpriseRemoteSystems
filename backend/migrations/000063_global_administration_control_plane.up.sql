-- Bite 30I.1 — Global Administration Control Plane
--
-- APPLICATION_ADMIN remains an application-scoped GLOBAL Actor grant at the
-- global scope marker (*), but that marker no longer means "all tenant data".
-- Effective standing authority is restricted to explicit application
-- control-plane permissions only. Tenant business-data access requires a future
-- Tenant Support Access Lease (Bite 30I.2+) and is intentionally unavailable in
-- this migration.

INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at) VALUES
('authz.self.read', 'Read own authorization context', 'Read the current persisted actor, effective roles, scope, and permissions.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.read', 'Read authorization administration', 'Read authorization actors, roles, permissions, and grants.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.manage', 'Manage authorization administration', 'Create authorization actors and manage application-global role grants.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.read', 'Read tenants', 'Read tenant records from the application control plane.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.create', 'Create tenants', 'Create tenant records from the application control plane.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.update', 'Update tenants', 'Update tenant records from the application control plane.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

DELETE FROM authz_role_permissions
WHERE role_id = 'authz-role-application-admin'
  AND permission_code NOT IN (
    'authz.self.read',
    'authz.read',
    'authz.manage',
    'tenants.read',
    'tenants.create',
    'tenants.update'
  );

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at) VALUES
('authz-role-application-admin', 'authz.self.read', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'authz.read', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'authz.manage', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'tenants.read', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'tenants.create', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'tenants.update', CURRENT_TIMESTAMP);

UPDATE authz_roles
SET description = 'Application-global control-plane administration with no standing Tenant business-data access.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'APPLICATION_ADMIN';

CREATE TRIGGER IF NOT EXISTS trg_application_admin_control_plane_permission_insert
BEFORE INSERT ON authz_role_permissions
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-application-admin'
  AND NEW.permission_code NOT IN (
    'authz.self.read',
    'authz.read',
    'authz.manage',
    'tenants.read',
    'tenants.create',
    'tenants.update'
  )
BEGIN
  SELECT RAISE(ABORT, 'application_admin_control_plane_permission_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_application_admin_control_plane_permission_update
BEFORE UPDATE OF role_id, permission_code ON authz_role_permissions
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-application-admin'
  AND NEW.permission_code NOT IN (
    'authz.self.read',
    'authz.read',
    'authz.manage',
    'tenants.read',
    'tenants.create',
    'tenants.update'
  )
BEGIN
  SELECT RAISE(ABORT, 'application_admin_control_plane_permission_required');
END;
