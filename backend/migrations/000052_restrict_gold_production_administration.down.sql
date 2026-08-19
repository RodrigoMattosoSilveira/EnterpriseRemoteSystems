PRAGMA foreign_keys = ON;

DELETE FROM authz_role_permissions
WHERE permission_code = 'gold_production.manage'
  AND role_id IN ('authz-role-application-admin', 'authz-role-tenant-admin');

DELETE FROM authz_permissions
WHERE code = 'gold_production.manage';

PRAGMA foreign_keys = ON;
