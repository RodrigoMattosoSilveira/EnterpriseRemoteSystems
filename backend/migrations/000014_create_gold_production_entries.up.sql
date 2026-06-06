CREATE TABLE IF NOT EXISTS gold_production_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  work_period_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  production_date DATE NOT NULL,
  gold_grams_produced REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (work_period_id) REFERENCES work_periods(id),
  FOREIGN KEY (location_id) REFERENCES reference_data(id),
  CHECK (gold_grams_produced > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_gold_production_entries_active_period_location_date
  ON gold_production_entries (tenant_id, work_period_id, location_id, production_date, active)
  WHERE active = 1;

CREATE INDEX IF NOT EXISTS idx_gold_production_entries_tenant_work_period
  ON gold_production_entries (tenant_id, work_period_id, active);

CREATE INDEX IF NOT EXISTS idx_gold_production_entries_tenant_location_date
  ON gold_production_entries (tenant_id, location_id, production_date, active);
