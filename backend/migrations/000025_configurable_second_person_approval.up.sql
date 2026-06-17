CREATE TABLE IF NOT EXISTS tenant_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT NULL,
  updated_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_settings_tenant_key ON tenant_settings(tenant_id, key);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);

INSERT OR IGNORE INTO tenant_settings (
  id,
  tenant_id,
  key,
  value,
  description,
  updated_by,
  created_at,
  updated_at
) VALUES (
  'tenant-setting-default-second-person-approval',
  'default',
  'current_accounts.require_second_person_approval_for_sensitive_operations',
  'false',
  'Require second-person approval for sensitive current-account operations',
  'migration:000025_configurable_second_person_approval',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
