package db

import "gorm.io/gorm"

const journeyZeroBalanceClosureGuardSQL = `
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
`

// InstallJourneyZeroBalanceClosureGuard keeps AutoMigrate-backed test and
// development databases aligned with migration 000058. Production promotion
// still applies the versioned SQL migration as the durable schema history.
func InstallJourneyZeroBalanceClosureGuard(database *gorm.DB) error {
	return database.Exec(journeyZeroBalanceClosureGuardSQL).Error
}
