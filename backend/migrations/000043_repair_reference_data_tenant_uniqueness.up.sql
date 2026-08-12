PRAGMA foreign_keys = ON;

-- Repair long-lived databases that applied an earlier tenant-foundation
-- migration while reference_data still had global type/code uniqueness.
-- Migration filenames are recorded once, so editing 000005 later cannot repair
-- an already-applied database. A global index prevents SeedTenantData from
-- provisioning the same baseline codes for a second tenant and makes tenant
-- creation fail with an internal error.
DROP INDEX IF EXISTS ux_reference_data_type_code;
DROP INDEX IF EXISTS ux_reference_data_type_label;
DROP INDEX IF EXISTS idx_reference_data_type_active_sort;

CREATE UNIQUE INDEX IF NOT EXISTS ux_reference_tenant_type_code
ON reference_data(tenant_id, type, code);

CREATE UNIQUE INDEX IF NOT EXISTS ux_reference_tenant_type_label
ON reference_data(tenant_id, type, label);

CREATE INDEX IF NOT EXISTS idx_reference_tenant_type_active_sort
ON reference_data(tenant_id, type, active, sort_order);
