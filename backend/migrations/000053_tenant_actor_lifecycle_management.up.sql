PRAGMA foreign_keys = ON;

-- Tenant Administrators own tenant-local Actor lifecycle, while application
-- authorization administration remains application-global. This permission is
-- deliberately separate from tenant operator Role Grant management.
INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at)
VALUES (
  'authz.tenant_actors.manage',
  'Manage tenant Actors',
  'Activate and deactivate Account-bound Actors for members of the selected tenant.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at)
VALUES (
  'authz-role-tenant-admin',
  'authz.tenant_actors.manage',
  CURRENT_TIMESTAMP
);

PRAGMA foreign_keys = ON;
