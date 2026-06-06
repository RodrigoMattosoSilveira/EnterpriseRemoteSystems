CREATE TABLE IF NOT EXISTS accrual_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  work_period_id TEXT NOT NULL,
  status TEXT NOT NULL,
  accrual_date DATE NOT NULL,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (work_period_id) REFERENCES work_periods(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (status IN ('DRAFT', 'PENDING_INPUT', 'READY_TO_POST', 'POSTED', 'VOIDED'))
);

CREATE INDEX IF NOT EXISTS idx_accrual_runs_tenant_work_period
  ON accrual_runs (tenant_id, work_period_id, created_at);

CREATE INDEX IF NOT EXISTS idx_accrual_runs_tenant_status
  ON accrual_runs (tenant_id, status);

CREATE TABLE IF NOT EXISTS accrual_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  accrual_run_id TEXT NOT NULL,
  work_period_id TEXT NOT NULL,
  work_period_assignment_id TEXT,
  collaborator_id TEXT NOT NULL,
  calculation_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'CREDIT',
  brl_amount REAL,
  gold_gram_amount REAL,
  status TEXT NOT NULL,
  pending_reason TEXT,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (accrual_run_id) REFERENCES accrual_runs(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (work_period_id) REFERENCES work_periods(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (work_period_assignment_id) REFERENCES work_period_assignments(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (direction IN ('CREDIT', 'DEBIT')),
  CHECK (status IN ('PENDING', 'READY', 'POSTED', 'SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_accrual_items_tenant_run
  ON accrual_items (tenant_id, accrual_run_id, status);

CREATE INDEX IF NOT EXISTS idx_accrual_items_tenant_work_period
  ON accrual_items (tenant_id, work_period_id, status);

CREATE INDEX IF NOT EXISTS idx_accrual_items_tenant_collaborator
  ON accrual_items (tenant_id, collaborator_id, status);
