PRAGMA foreign_keys = ON;

-- Recording or changing Gold Production is a sensitive administrative action.
-- Earnings Operators may read production as an accrual input, but only
-- Application Administrators and Tenant Administrators may manage the source
-- Gold Production records.
INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at)
VALUES (
  'gold_production.manage',
  'Manage gold production',
  'Record, edit, deactivate, and delete tenant Gold Production entries.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at)
VALUES
  ('authz-role-application-admin', 'gold_production.manage', CURRENT_TIMESTAMP),
  ('authz-role-tenant-admin', 'gold_production.manage', CURRENT_TIMESTAMP);

PRAGMA foreign_keys = ON;
