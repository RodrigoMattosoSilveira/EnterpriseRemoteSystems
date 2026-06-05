PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  collaborator_id TEXT NOT NULL,
  value_unit_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount REAL NOT NULL,
  effective_date DATE NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  description TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  CHECK (direction IN ('CREDIT', 'DEBIT')),
  CHECK (entry_type IN ('EARNING_CREDIT', 'EXPENSE_DEDUCTION', 'GOLD_TO_BRL_CONVERSION', 'PIX_REMITTANCE')),
  CHECK (amount > 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (value_unit_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, source_type, source_id, value_unit_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_id ON ledger_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_collaborator_id ON ledger_entries(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_value_unit_id ON ledger_entries(value_unit_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_type ON ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_direction ON ledger_entries(direction);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_effective_date ON ledger_entries(effective_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_source ON ledger_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_active ON ledger_entries(active);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_collaborator_unit_active ON ledger_entries(tenant_id, collaborator_id, value_unit_id, active);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_collaborator_date ON ledger_entries(tenant_id, collaborator_id, effective_date);


INSERT OR IGNORE INTO ledger_entries (
  id, created_at, updated_at, tenant_id, collaborator_id, value_unit_id,
  entry_type, direction, amount, effective_date, source_type, source_id,
  description, active
)
SELECT
  'ledger-expense-' || e.id,
  e.created_at,
  e.updated_at,
  e.tenant_id,
  e.collaborator_id,
  e.value_unit_id,
  'EXPENSE_DEDUCTION',
  'DEBIT',
  e.amount,
  e.expense_date,
  'EXPENSE',
  e.id,
  e.description,
  e.active
FROM expenses e;
