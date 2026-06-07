DROP INDEX IF EXISTS idx_ledger_entries_related_entry;
DROP INDEX IF EXISTS idx_ledger_entries_correction_type;

-- SQLite cannot safely drop columns on older versions without rebuilding the table. This migration is intentionally non-destructive.
