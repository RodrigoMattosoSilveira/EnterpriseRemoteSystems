PRAGMA foreign_keys = ON;

-- Bite 30G.1 makes zero Journey balance a hard lifecycle invariant.
-- Historical financial rows remain owned by Person + Tenant, but every closed
-- Journey must have independently settled every active value-unit balance to
-- zero before closure. Do not manufacture settlement entries during migration;
-- fail instead so inconsistent historical data is repaired explicitly.
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
