PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_authz_grants_actor_scope_update;
DROP TRIGGER IF EXISTS trg_authz_grants_actor_scope_insert;

DELETE FROM authz_role_permissions
WHERE role_id = 'authz-role-application-admin'
  AND permission_code IN (
    'authz.self.read',
    'authz.read',
    'authz.manage',
    'tenants.read',
    'tenants.create',
    'tenants.update'
  );
UPDATE authz_roles
SET active = 1,
    description = 'Self-service read/update access for a person and linked collaborator records.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'PERSON';

UPDATE authz_actor_role_grants
SET active = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE role_id IN (SELECT id FROM authz_roles WHERE code = 'PERSON');

UPDATE authz_roles
SET description = 'CRU all records across all tenants.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'APPLICATION_ADMIN';

PRAGMA foreign_keys = ON;
