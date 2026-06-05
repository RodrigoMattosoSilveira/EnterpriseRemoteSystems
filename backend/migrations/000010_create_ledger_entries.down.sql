PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_ledger_entries_tenant_collaborator_date;
DROP INDEX IF EXISTS idx_ledger_entries_tenant_collaborator_unit_active;
DROP INDEX IF EXISTS idx_ledger_entries_active;
DROP INDEX IF EXISTS idx_ledger_entries_source;
DROP INDEX IF EXISTS idx_ledger_entries_effective_date;
DROP INDEX IF EXISTS idx_ledger_entries_direction;
DROP INDEX IF EXISTS idx_ledger_entries_entry_type;
DROP INDEX IF EXISTS idx_ledger_entries_value_unit_id;
DROP INDEX IF EXISTS idx_ledger_entries_collaborator_id;
DROP INDEX IF EXISTS idx_ledger_entries_tenant_id;
DROP TABLE IF EXISTS ledger_entries;

PRAGMA foreign_keys = ON;
