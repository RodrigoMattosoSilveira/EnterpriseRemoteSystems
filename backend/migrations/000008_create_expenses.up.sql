PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO reference_data (id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-expense-category-canteen', 'default', 'expense_category', 'CANTEEN', 'Canteen', 'Canteen expense', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-expense-category-flight', 'default', 'expense_category', 'FLIGHT', 'Flight', 'Flight expense', 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-expense-category-cargo', 'default', 'expense_category', 'CARGO', 'Cargo', 'Cargo expense', 1, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-expense-category-other', 'default', 'expense_category', 'OTHER', 'Other', 'Other expense', 1, 40, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-value-unit-brl', 'default', 'value_unit', 'BRL', 'Brazilian Real', 'Brazilian Real monetary value', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-value-unit-gold-gram', 'default', 'value_unit', 'GOLD_GRAM', 'Gold Gram', 'Grams of gold', 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  collaborator_id TEXT NOT NULL,
  expense_category_id TEXT NOT NULL,
  value_unit_id TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date DATE NOT NULL,
  description TEXT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (expense_category_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (value_unit_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_collaborator_id ON expenses(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_category_id ON expenses(expense_category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_value_unit_id ON expenses(value_unit_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_collaborator_date ON expenses(tenant_id, collaborator_id, expense_date);
