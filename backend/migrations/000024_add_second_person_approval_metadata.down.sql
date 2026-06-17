DROP INDEX IF EXISTS idx_journey_settlements_second_approved_by;
DROP INDEX IF EXISTS idx_ledger_entries_second_approved_by;

-- SQLite does not safely drop columns without rebuilding these production tables.
-- The down migration removes only indexes and leaves additive approval metadata columns in place.
