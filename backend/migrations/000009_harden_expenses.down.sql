PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_expenses_tenant_value_unit_date;
DROP INDEX IF EXISTS idx_expenses_tenant_category_date;
DROP INDEX IF EXISTS idx_expenses_tenant_active_date;
DROP INDEX IF EXISTS idx_expenses_active;

-- SQLite cannot drop columns without rebuilding the table. Keep expenses.active
-- in place on rollback so existing runtime data remains safe.

PRAGMA foreign_keys = ON;
