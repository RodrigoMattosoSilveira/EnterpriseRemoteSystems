PRAGMA foreign_keys = ON;

-- Bite 30G.1 makes zero Journey balance a hard lifecycle invariant.
--
-- Databases upgraded from the pre-30G.1 model may already contain closed
-- Journeys whose historical Ledger Entries net to a non-zero Journey balance.
-- Those rows were legal when they were created, so refusing the migration would
-- make the invariant undeployable without an out-of-band data repair.
--
-- Reconcile each legacy closed Journey/value-unit balance with one explicit,
-- deterministic migration Ledger Entry. The original financial entries remain
-- untouched and retain their original provenance. These reconciliation entries
-- are NOT 30G.2 final-settlement payments and therefore do not create receipts.
-- They exist only to make the historical Journey lifecycle internally
-- consistent before the future-closure guard is installed.
INSERT OR IGNORE INTO ledger_entries (
  id,
  created_at,
  updated_at,
  tenant_id,
  person_id,
  collaborator_id,
  value_unit_id,
  entry_type,
  direction,
  amount,
  effective_date,
  source_type,
  source_id,
  description,
  active,
  correction_type,
  correction_reason,
  correction_reason_code,
  correction_reason_text,
  authorized_by,
  authorized_at
)
SELECT
  'ledger-000058-legacy-close-' || cj.id || '-' || le.value_unit_id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  cj.tenant_id,
  MAX(le.person_id),
  cj.id,
  le.value_unit_id,
  'PAYOUT',
  CASE
    WHEN SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END) > 0
      THEN 'DEBIT'
    ELSE 'CREDIT'
  END,
  ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)),
  COALESCE(DATE(cj.closed_at), CURRENT_DATE),
  'MIGRATION',
  '000058-zero-balance-closure-' || cj.id,
  'Legacy closed Journey balance reconciliation for Bite 30G.1',
  1,
  'ORIGINAL',
  'Legacy closed Journey balance reconciled while establishing the zero-balance closure invariant.',
  'MIGRATION_RECONCILIATION',
  'Legacy closed Journey balance reconciled while establishing the zero-balance closure invariant.',
  'migration:000058_zero_balance_journey_closure_invariant',
  CURRENT_TIMESTAMP
FROM collaborator_journeys cj
JOIN ledger_entries le
  ON le.tenant_id = cj.tenant_id
 AND le.collaborator_id = cj.id
 AND le.active = 1
WHERE (
  cj.closed_at IS NOT NULL
  OR EXISTS (
    SELECT 1
    FROM reference_data status
    WHERE status.id = cj.status_id
      AND status.tenant_id = cj.tenant_id
      AND status.type = 'collaborator_status'
      AND status.code = 'FINISHED'
  )
)
GROUP BY cj.id, cj.tenant_id, cj.closed_at, le.value_unit_id
HAVING ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.000000001;

-- Do not weaken the invariant if malformed data could not be reconciled. After
-- the deterministic repair above, every closed Journey/value-unit balance must
-- be exactly zero within the supported precision or the migration still fails.
CREATE TEMP TABLE bite30g1_closed_journey_balance_guard (id INTEGER);
CREATE TEMP TRIGGER bite30g1_verify_closed_journey_balances
BEFORE INSERT ON bite30g1_closed_journey_balance_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM collaborator_journeys cj
  JOIN ledger_entries le
    ON le.tenant_id = cj.tenant_id
   AND le.collaborator_id = cj.id
   AND le.active = 1
  WHERE (
    cj.closed_at IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM reference_data status
      WHERE status.id = cj.status_id
        AND status.tenant_id = cj.tenant_id
        AND status.type = 'collaborator_status'
        AND status.code = 'FINISHED'
    )
  )
  GROUP BY cj.id, le.value_unit_id
  HAVING ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.000000001
)
BEGIN
  SELECT RAISE(ABORT, 'closed_journey_non_zero_balance');
END;
INSERT INTO bite30g1_closed_journey_balance_guard(id) VALUES (1);
DROP TRIGGER bite30g1_verify_closed_journey_balances;
DROP TABLE bite30g1_closed_journey_balance_guard;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_journey_zero_balance_close
BEFORE UPDATE OF status_id, closed_at ON collaborator_journeys
FOR EACH ROW
WHEN (
  (NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL)
  OR (
    NEW.status_id <> OLD.status_id
    AND EXISTS (
      SELECT 1
      FROM reference_data status
      WHERE status.id = NEW.status_id
        AND status.tenant_id = NEW.tenant_id
        AND status.type = 'collaborator_status'
        AND status.code = 'FINISHED'
    )
  )
)
AND EXISTS (
  SELECT 1
  FROM ledger_entries le
  WHERE le.tenant_id = NEW.tenant_id
    AND le.collaborator_id = NEW.id
    AND le.active = 1
  GROUP BY le.value_unit_id
  HAVING ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.000000001
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_journey_non_zero_balance');
END;
