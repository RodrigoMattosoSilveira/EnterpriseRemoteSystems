DROP TRIGGER IF EXISTS trg_collaborator_journey_zero_balance_close;

-- Restore the pre-30G.1 historical state when rolling this migration back.
-- These rows are deterministic migration reconciliations, not operational
-- settlement payments, so removing only this exact migration provenance is safe.
DELETE FROM ledger_entries
WHERE source_type = 'MIGRATION'
  AND source_id LIKE '000058-zero-balance-closure-%'
  AND authorized_by = 'migration:000058_zero_balance_journey_closure_invariant';
