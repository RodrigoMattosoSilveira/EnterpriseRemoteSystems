PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

INSERT OR IGNORE INTO tenants (id, code, name, description, active, created_at, updated_at) VALUES
('default', 'DEFAULT', 'Default Tenant', 'Default tenant used until tenant selection is introduced', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE reference_data ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS ux_reference_data_type_code;
DROP INDEX IF EXISTS idx_reference_data_type_active_sort;

CREATE UNIQUE INDEX IF NOT EXISTS ux_reference_tenant_type_code ON reference_data(tenant_id, type, code);
CREATE UNIQUE INDEX IF NOT EXISTS ux_reference_tenant_type_label ON reference_data(tenant_id, type, label);
CREATE INDEX IF NOT EXISTS idx_reference_tenant_type_active_sort ON reference_data(tenant_id, type, active, sort_order);

PRAGMA foreign_keys = ON;
