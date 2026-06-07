DROP INDEX IF EXISTS idx_journey_settlements_status;
DROP INDEX IF EXISTS idx_journey_settlements_effective_date;
DROP INDEX IF EXISTS idx_journey_settlements_tenant_type;
DROP INDEX IF EXISTS idx_journey_settlements_tenant_collaborator;
DROP TABLE IF EXISTS journey_settlements;

-- SQLite cannot safely narrow a CHECK constraint without rebuilding ledger_entries.
-- The broader ledger entry type set introduced by this migration is intentionally left in place.
