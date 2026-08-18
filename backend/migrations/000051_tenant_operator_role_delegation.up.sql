PRAGMA foreign_keys = ON;

-- Tenant Administrators need a tenant-local delegation capability without
-- reopening the application-global authorization administration surface.
INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at)
VALUES (
  'authz.tenant_role_grants.manage',
  'Manage tenant operator role grants',
  'Grant and revoke Earnings Operator and Expenses Operator roles for active members of the selected tenant.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at)
VALUES (
  'authz-role-tenant-admin',
  'authz.tenant_role_grants.manage',
  CURRENT_TIMESTAMP
);

PRAGMA foreign_keys = ON;
