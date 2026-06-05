PRAGMA foreign_keys = ON;

ALTER TABLE expenses ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_expenses_active ON expenses(active);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_active_date ON expenses(tenant_id, active, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_category_date ON expenses(tenant_id, expense_category_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_value_unit_date ON expenses(tenant_id, value_unit_id, expense_date);
