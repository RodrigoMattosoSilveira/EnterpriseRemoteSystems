-- Roll back Bite 30I.1 to the pre-control-plane transitional authority.

DROP TRIGGER IF EXISTS trg_application_admin_control_plane_permission_update;
DROP TRIGGER IF EXISTS trg_application_admin_control_plane_permission_insert;

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at) VALUES
('authz-role-application-admin', '*', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'gold_production.manage', CURRENT_TIMESTAMP);

UPDATE authz_roles
SET description = 'Application-global control-plane administration; legacy tenant-data compatibility remains transitional pending a dedicated global control-plane cutover.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'APPLICATION_ADMIN';
