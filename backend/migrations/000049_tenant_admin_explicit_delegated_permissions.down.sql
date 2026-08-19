PRAGMA foreign_keys = ON;

DELETE FROM authz_role_permissions
WHERE role_id = 'authz-role-tenant-admin';

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at)
VALUES ('authz-role-tenant-admin', '*', CURRENT_TIMESTAMP);

UPDATE authz_roles
SET description = 'CRU all records for the assigned tenant.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'authz-role-tenant-admin';

PRAGMA foreign_keys = ON;
