PRAGMA foreign_keys = ON;

DELETE FROM authz_role_permissions
WHERE role_id = 'authz-role-tenant-admin'
  AND permission_code = 'authz.tenant_role_grants.manage';

DELETE FROM authz_permissions
WHERE code = 'authz.tenant_role_grants.manage';

PRAGMA foreign_keys = ON;
