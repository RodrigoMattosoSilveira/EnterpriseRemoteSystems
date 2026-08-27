PRAGMA foreign_keys = ON;

ALTER TABLE expenses ADD COLUMN cancelled_at DATETIME NULL;
ALTER TABLE expenses ADD COLUMN cancelled_by TEXT NULL;
ALTER TABLE expenses ADD COLUMN cancellation_reason TEXT NULL;
ALTER TABLE expenses ADD COLUMN recreated_from_expense_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_cancelled_by
ON expenses(cancelled_by);

CREATE UNIQUE INDEX IF NOT EXISTS ux_expenses_recreated_from_expense
ON expenses(recreated_from_expense_id)
WHERE recreated_from_expense_id IS NOT NULL;



UPDATE authz_permissions
SET label = 'Correct expenses',
    description = 'Cancel incorrect tenant expense records and initiate the replacement workflow.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'expenses.update';

CREATE TRIGGER IF NOT EXISTS trg_expenses_cancellation_insert_guard
BEFORE INSERT ON expenses
BEGIN
  SELECT RAISE(ABORT, 'expense_cancellation_incomplete')
  WHERE NEW.cancelled_at IS NOT NULL
    AND (
      NEW.active <> 0
      OR COALESCE(TRIM(NEW.cancelled_by), '') = ''
      OR COALESCE(TRIM(NEW.cancellation_reason), '') = ''
    );

  SELECT RAISE(ABORT, 'expense_recreation_source_invalid')
  WHERE NEW.recreated_from_expense_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM expenses source
      WHERE source.id = NEW.recreated_from_expense_id
        AND source.tenant_id = NEW.tenant_id
        AND source.active = 0
        AND source.cancelled_at IS NOT NULL
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_cancellation_update_guard
BEFORE UPDATE ON expenses
BEGIN
  SELECT RAISE(ABORT, 'expense_cancellation_immutable')
  WHERE OLD.cancelled_at IS NOT NULL
    AND (
      NEW.cancelled_at IS NOT OLD.cancelled_at
      OR COALESCE(NEW.cancelled_by, '') <> COALESCE(OLD.cancelled_by, '')
      OR COALESCE(NEW.cancellation_reason, '') <> COALESCE(OLD.cancellation_reason, '')
      OR NEW.active <> OLD.active
    );

  SELECT RAISE(ABORT, 'expense_cancellation_incomplete')
  WHERE NEW.cancelled_at IS NOT NULL
    AND (
      NEW.active <> 0
      OR COALESCE(TRIM(NEW.cancelled_by), '') = ''
      OR COALESCE(TRIM(NEW.cancellation_reason), '') = ''
    );

  SELECT RAISE(ABORT, 'expense_recreation_link_immutable')
  WHERE COALESCE(NEW.recreated_from_expense_id, '') <> COALESCE(OLD.recreated_from_expense_id, '');

  SELECT RAISE(ABORT, 'expense_recreation_source_invalid')
  WHERE NEW.recreated_from_expense_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM expenses source
      WHERE source.id = NEW.recreated_from_expense_id
        AND source.tenant_id = NEW.tenant_id
        AND source.active = 0
        AND source.cancelled_at IS NOT NULL
    );
END;
