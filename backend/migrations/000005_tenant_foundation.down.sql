PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_reference_tenant_type_active_sort;
DROP INDEX IF EXISTS ux_reference_tenant_type_label;
DROP INDEX IF EXISTS ux_reference_tenant_type_code;

CREATE UNIQUE INDEX IF NOT EXISTS ux_reference_data_type_code ON reference_data(type, code);
CREATE INDEX IF NOT EXISTS idx_reference_data_type_active_sort ON reference_data(type, active, sort_order);

-- SQLite cannot drop columns without rebuilding the table. Keep reference_data.tenant_id
-- in place on rollback so existing data remains safe.
DROP TABLE IF EXISTS tenants;

PRAGMA foreign_keys = ON;
