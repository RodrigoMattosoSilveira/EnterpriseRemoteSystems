DROP INDEX IF EXISTS idx_journey_settlements_reason_code;
DROP INDEX IF EXISTS idx_ledger_entries_correction_reason_code;

-- SQLite does not safely drop columns without rebuilding these production tables.
-- The down migration removes only indexes and leaves additive metadata columns in place.
