CREATE INDEX IF NOT EXISTS idx_authz_actor_role_grants_tenant_active_role
ON authz_actor_role_grants(tenant_id, active, role_id);

CREATE TRIGGER IF NOT EXISTS trg_tenants_no_delete
BEFORE DELETE ON tenants
BEGIN
  SELECT RAISE(ABORT, 'tenant records cannot be deleted; deactivate the tenant instead');
END;
