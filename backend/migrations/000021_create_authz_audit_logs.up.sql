CREATE TABLE IF NOT EXISTS authz_audit_logs (
  id TEXT PRIMARY KEY,
  occurred_at DATETIME NOT NULL,
  actor_id TEXT NULL,
  actor_record_id TEXT NULL,
  tenant_id TEXT NULL,
  permission_code TEXT NULL,
  operation TEXT NOT NULL,
  target_type TEXT NULL,
  target_id TEXT NULL,
  decision TEXT NOT NULL,
  reason TEXT NULL,
  request_method TEXT NULL,
  request_path TEXT NULL,
  created_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authz_audit_logs_occurred_at ON authz_audit_logs(occurred_at);
CREATE INDEX IF NOT EXISTS idx_authz_audit_logs_actor_id ON authz_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_authz_audit_logs_tenant_id ON authz_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_authz_audit_logs_operation ON authz_audit_logs(operation);
CREATE INDEX IF NOT EXISTS idx_authz_audit_logs_target ON authz_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_authz_audit_logs_decision ON authz_audit_logs(decision);
