UPDATE authz_permissions
SET label = 'Update expenses',
    description = 'Update tenant expense records.',
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'expenses.update';

DROP TRIGGER IF EXISTS trg_expenses_cancellation_update_guard;
DROP TRIGGER IF EXISTS trg_expenses_cancellation_insert_guard;
DROP INDEX IF EXISTS ux_expenses_recreated_from_expense;
DROP INDEX IF EXISTS idx_expenses_cancelled_by;
ALTER TABLE expenses DROP COLUMN recreated_from_expense_id;
ALTER TABLE expenses DROP COLUMN cancellation_reason;
ALTER TABLE expenses DROP COLUMN cancelled_by;
ALTER TABLE expenses DROP COLUMN cancelled_at;
