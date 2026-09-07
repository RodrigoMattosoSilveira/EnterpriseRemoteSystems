-- Roll back Bite 30I.2 Tenant Support Access Lease domain/backend.

DROP TRIGGER IF EXISTS trg_support_access_lease_events_no_delete;
DROP TRIGGER IF EXISTS trg_support_access_lease_events_no_update;
DROP TRIGGER IF EXISTS trg_support_access_lease_permissions_no_delete;
DROP TRIGGER IF EXISTS trg_support_access_lease_permissions_no_update;
DROP TRIGGER IF EXISTS trg_support_access_lease_permission_allowlist;
DROP TRIGGER IF EXISTS trg_support_access_lease_permission_pending_insert;
DROP TRIGGER IF EXISTS trg_support_access_lease_no_delete;
DROP TRIGGER IF EXISTS trg_support_access_lease_termination_history_immutable;
DROP TRIGGER IF EXISTS trg_support_access_lease_approval_history_immutable;
DROP TRIGGER IF EXISTS trg_support_access_lease_termination_tenant_administrator;
DROP TRIGGER IF EXISTS trg_support_access_lease_approval_tenant_administrator;
DROP TRIGGER IF EXISTS trg_support_access_lease_status_transition;
DROP TRIGGER IF EXISTS trg_support_access_lease_request_fields_immutable;
DROP TRIGGER IF EXISTS trg_support_access_lease_open_conflict_insert;
DROP TRIGGER IF EXISTS trg_support_access_lease_request_global_application_actor;

DROP TABLE IF EXISTS tenant_support_access_lease_events;
DROP TABLE IF EXISTS tenant_support_access_lease_permissions;
DROP TABLE IF EXISTS tenant_support_access_leases;

DROP TRIGGER IF EXISTS trg_application_admin_control_plane_permission_update;
DROP TRIGGER IF EXISTS trg_application_admin_control_plane_permission_insert;

DELETE FROM authz_role_permissions
WHERE permission_code IN (
  'support_access_leases.read',
  'support_access_leases.request',
  'support_access_leases.approve',
  'support_access_leases.terminate'
);

DELETE FROM authz_permissions
WHERE code IN (
  'support_access_leases.read',
  'support_access_leases.request',
  'support_access_leases.approve',
  'support_access_leases.terminate'
);

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
