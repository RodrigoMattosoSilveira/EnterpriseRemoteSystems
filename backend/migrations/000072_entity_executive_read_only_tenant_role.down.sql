PRAGMA foreign_keys = ON;

DELETE FROM authz_actor_role_grants WHERE role_id = 'authz-role-tenant-viewer';
DELETE FROM authz_role_permissions WHERE role_id = 'authz-role-tenant-viewer';
DELETE FROM authz_roles WHERE id = 'authz-role-tenant-viewer';

DELETE FROM authz_role_permissions
WHERE role_id = 'authz-role-tenant-admin'
  AND permission_code IN ('authz.tenant_actors.read', 'authz.tenant_role_grants.read', 'authz.tenant_audit.read', 'gold_prices.read');

DELETE FROM authz_permissions
WHERE code IN ('authz.tenant_actors.read', 'authz.tenant_role_grants.read', 'authz.tenant_audit.read', 'gold_prices.read');

PRAGMA foreign_keys = ON;
