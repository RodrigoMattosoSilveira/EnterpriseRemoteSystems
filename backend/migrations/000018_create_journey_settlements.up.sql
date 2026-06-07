PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE ledger_entries_new (
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
  correction_type TEXT NOT NULL DEFAULT 'ORIGINAL',
  related_entry_id TEXT NULL,
  correction_reason TEXT NULL,
  authorized_by TEXT NULL,
  authorized_at DATETIME NULL,
  CHECK (direction IN ('CREDIT', 'DEBIT')),
  CHECK (entry_type IN ('EARNING_CREDIT', 'EXPENSE_DEDUCTION', 'GOLD_TO_BRL_CONVERSION', 'PIX_REMITTANCE', 'REPLACEMENT_TRANSFER', 'PAYOUT')),
  CHECK (amount > 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (value_unit_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, source_type, source_id, value_unit_id, direction)
);

INSERT INTO ledger_entries_new (
  id, created_at, updated_at, tenant_id, collaborator_id, value_unit_id,
  entry_type, direction, amount, effective_date, source_type, source_id,
  description, active, correction_type, related_entry_id, correction_reason,
  authorized_by, authorized_at
)
SELECT
  id, created_at, updated_at, tenant_id, collaborator_id, value_unit_id,
  entry_type, direction, amount, effective_date, source_type, source_id,
  description, active, correction_type, related_entry_id, correction_reason,
  authorized_by, authorized_at
FROM ledger_entries;

DROP TABLE ledger_entries;
ALTER TABLE ledger_entries_new RENAME TO ledger_entries;

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
CREATE INDEX IF NOT EXISTS idx_ledger_entries_correction_type ON ledger_entries(correction_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_related_entry ON ledger_entries(related_entry_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entries_single_reversal
  ON ledger_entries(tenant_id, related_entry_id)
  WHERE correction_type = 'REVERSAL'
    AND related_entry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS journey_settlements (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  collaborator_id TEXT NOT NULL,
  settlement_type TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED',
  effective_date DATE NOT NULL,
  brl_amount REAL NOT NULL DEFAULT 0,
  gold_gram_amount REAL NOT NULL DEFAULT 0,
  notes TEXT NULL,
  authorized_by TEXT NULL,
  authorized_at DATETIME NULL,
  CHECK (settlement_type IN ('ZERO_GOLD', 'PAYOUT', 'CLOSE_JOURNEY')),
  CHECK (status IN ('POSTED', 'VOIDED')),
  CHECK (brl_amount >= 0),
  CHECK (gold_gram_amount >= 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, collaborator_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_journey_settlements_tenant_collaborator ON journey_settlements(tenant_id, collaborator_id);
CREATE INDEX IF NOT EXISTS idx_journey_settlements_tenant_type ON journey_settlements(tenant_id, settlement_type);
CREATE INDEX IF NOT EXISTS idx_journey_settlements_effective_date ON journey_settlements(effective_date);
CREATE INDEX IF NOT EXISTS idx_journey_settlements_status ON journey_settlements(status);

COMMIT;

PRAGMA foreign_keys = ON;
