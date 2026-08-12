PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

BEGIN TRANSACTION;

-- 000043 can remove named legacy indexes, but SQLite table-level UNIQUE
-- constraints are represented by sqlite_autoindex_* indexes and cannot be
-- dropped directly. Rebuild reference_data into the canonical tenant-scoped
-- shape so every legacy global uniqueness mechanism is removed regardless of
-- its historical name or origin.
ALTER TABLE reference_data RENAME TO reference_data_legacy_tenant_scope;

CREATE TABLE reference_data (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

INSERT INTO reference_data (
  id, type, code, label, description, active, sort_order, metadata_json,
  created_at, updated_at, tenant_id
)
SELECT
  id, type, code, label, description, active, sort_order, metadata_json,
  created_at, updated_at, tenant_id
FROM reference_data_legacy_tenant_scope;

DROP TABLE reference_data_legacy_tenant_scope;

CREATE UNIQUE INDEX ux_reference_tenant_type_code
ON reference_data(tenant_id, type, code);

CREATE UNIQUE INDEX ux_reference_tenant_type_label
ON reference_data(tenant_id, type, label);

CREATE INDEX idx_reference_tenant_type_active_sort
ON reference_data(tenant_id, type, active, sort_order);

CREATE TRIGGER trg_reference_data_tenant_exists_insert
BEFORE INSERT ON reference_data
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0
  OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER trg_reference_data_tenant_immutable
BEFORE UPDATE OF tenant_id ON reference_data
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

COMMIT;

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
