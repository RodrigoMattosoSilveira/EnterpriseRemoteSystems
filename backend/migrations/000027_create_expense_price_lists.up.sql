PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO reference_data (id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-expense-category-administrative', 'default', 'expense_category', 'ADMINISTRATIVE', 'Administrative', 'Administrative price-list expense', 1, 35, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS expense_price_list_items (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  item_type TEXT NOT NULL CHECK (item_type IN ('CANTEEN', 'ADMINISTRATIVE')),
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  unit_price_brl REAL NOT NULL CHECK (unit_price_brl > 0),
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, item_type, code)
);

CREATE INDEX IF NOT EXISTS idx_expense_price_list_items_tenant_id ON expense_price_list_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expense_price_list_items_tenant_type_active_sort ON expense_price_list_items(tenant_id, item_type, active, sort_order);

CREATE TABLE IF NOT EXISTS gold_prices (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  price_date DATE NOT NULL,
  brl_per_gram REAL NOT NULL CHECK (brl_per_gram > 0),
  recorded_by TEXT NOT NULL,
  notes TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, price_date)
);

CREATE INDEX IF NOT EXISTS idx_gold_prices_tenant_id ON gold_prices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gold_prices_tenant_active_date ON gold_prices(tenant_id, active, price_date DESC);

ALTER TABLE expenses ADD COLUMN price_list_item_id TEXT NULL;
ALTER TABLE expenses ADD COLUMN item_type TEXT NULL;
ALTER TABLE expenses ADD COLUMN item_description TEXT NULL;
ALTER TABLE expenses ADD COLUMN quantity REAL NULL;
ALTER TABLE expenses ADD COLUMN unit_price_brl REAL NULL;
ALTER TABLE expenses ADD COLUMN currency_code TEXT NULL;
ALTER TABLE expenses ADD COLUMN gold_price_id TEXT NULL;
ALTER TABLE expenses ADD COLUMN gold_brl_per_gram REAL NULL;
ALTER TABLE expenses ADD COLUMN unit_price_amount REAL NULL;
ALTER TABLE expenses ADD COLUMN total_amount REAL NULL;
ALTER TABLE expenses ADD COLUMN calculation_details_json TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_price_list_item_id ON expenses(price_list_item_id);
CREATE INDEX IF NOT EXISTS idx_expenses_item_type ON expenses(item_type);
CREATE INDEX IF NOT EXISTS idx_expenses_currency_code ON expenses(currency_code);
CREATE INDEX IF NOT EXISTS idx_expenses_gold_price_id ON expenses(gold_price_id);
