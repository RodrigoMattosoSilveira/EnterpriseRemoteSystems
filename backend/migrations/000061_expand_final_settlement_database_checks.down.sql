-- This migration can be safely rolled back only before any 30G.2 final
-- settlement rows have been created. Once those rows exist, narrowing the
-- database CHECK constraints would make valid financial history unrepresentable.
CREATE TEMP TABLE bite30g2_final_settlement_rollback_guard (id INTEGER);
CREATE TEMP TRIGGER bite30g2_block_final_settlement_rollback
BEFORE INSERT ON bite30g2_final_settlement_rollback_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM journey_settlements
  WHERE settlement_type IN ('FINAL_TENANT_PAYMENT', 'FINAL_COLLABORATOR_PAYMENT')
)
OR EXISTS (
  SELECT 1 FROM ledger_entries
  WHERE entry_type = 'FINAL_SETTLEMENT'
)
BEGIN
  SELECT RAISE(ABORT, 'final_settlement_history_prevents_constraint_rollback');
END;
INSERT INTO bite30g2_final_settlement_rollback_guard(id) VALUES (1);
DROP TRIGGER bite30g2_block_final_settlement_rollback;
DROP TABLE bite30g2_final_settlement_rollback_guard;

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- These triggers live on other tables but reference ledger_entries. SQLite
-- validates their SQL while ledger_entries is rebuilt, so temporarily remove
-- and restore them around the table replacement.
DROP TRIGGER IF EXISTS trg_collaborator_journey_zero_balance_close;
DROP TRIGGER IF EXISTS trg_ledger_receipts_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_ledger_receipts_same_tenant_update;
DROP TRIGGER IF EXISTS trg_receipt_financial_owner_consistency_insert;

CREATE TABLE ledger_entries_000061_down (
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
  correction_reason_code TEXT NULL,
  correction_reason_text TEXT NULL,
  second_approved_by TEXT NULL,
  second_approved_at DATETIME NULL,
  second_approval_notes TEXT NULL,
  person_id TEXT NULL,
  CHECK (direction IN ('CREDIT', 'DEBIT')),
  CHECK (entry_type IN ('EARNING_CREDIT', 'EXPENSE_DEDUCTION', 'GOLD_TO_BRL_CONVERSION', 'PIX_REMITTANCE', 'REPLACEMENT_TRANSFER', 'PAYOUT')),
  CHECK (amount > 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (value_unit_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, source_type, source_id, value_unit_id, direction)
);

INSERT INTO ledger_entries_000061_down (
  id, created_at, updated_at, tenant_id, collaborator_id, value_unit_id,
  entry_type, direction, amount, effective_date, source_type, source_id,
  description, active, correction_type, related_entry_id, correction_reason,
  authorized_by, authorized_at, correction_reason_code, correction_reason_text,
  second_approved_by, second_approved_at, second_approval_notes, person_id
)
SELECT
  id, created_at, updated_at, tenant_id, collaborator_id, value_unit_id,
  entry_type, direction, amount, effective_date, source_type, source_id,
  description, active, correction_type, related_entry_id, correction_reason,
  authorized_by, authorized_at, correction_reason_code, correction_reason_text,
  second_approved_by, second_approved_at, second_approval_notes, person_id
FROM ledger_entries;

DROP TABLE ledger_entries;
ALTER TABLE ledger_entries_000061_down RENAME TO ledger_entries;

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
  WHERE correction_type = 'REVERSAL' AND related_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_correction_reason_code ON ledger_entries(correction_reason_code);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_second_approved_by ON ledger_entries(second_approved_by);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_person_unit_active ON ledger_entries(tenant_id, person_id, value_unit_id, active);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_person_date ON ledger_entries(tenant_id, person_id, effective_date);

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_tenant_exists_insert
BEFORE INSERT ON ledger_entries FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity_violation'); END;
CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_tenant_immutable
BEFORE UPDATE OF tenant_id ON ledger_entries FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN SELECT RAISE(ABORT, 'tenant_id_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_same_tenant_insert
BEFORE INSERT ON ledger_entries FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.related_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.related_entry_id AND l.tenant_id = NEW.tenant_id))
BEGIN SELECT RAISE(ABORT, 'cross_tenant_reference'); END;
CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_same_tenant_update
BEFORE UPDATE ON ledger_entries FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.related_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.related_entry_id AND l.tenant_id = NEW.tenant_id))
BEGIN SELECT RAISE(ABORT, 'cross_tenant_reference'); END;
CREATE TRIGGER IF NOT EXISTS trg_ledger_financial_owner_required_insert
BEFORE INSERT ON ledger_entries FOR EACH ROW
WHEN NEW.person_id IS NULL OR TRIM(NEW.person_id) = ''
BEGIN SELECT RAISE(ABORT, 'ledger_entry_person_required'); END;
CREATE TRIGGER IF NOT EXISTS trg_ledger_financial_owner_consistency_insert
BEFORE INSERT ON ledger_entries FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM collaborator_journeys c
  JOIN person_tenant_memberships m ON m.id = c.membership_id AND m.tenant_id = c.tenant_id
  WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id AND m.person_id = NEW.person_id
)
BEGIN SELECT RAISE(ABORT, 'ledger_entry_person_tenant_journey_mismatch'); END;
CREATE TRIGGER IF NOT EXISTS trg_ledger_financial_identity_immutable
BEFORE UPDATE OF tenant_id, person_id, collaborator_id ON ledger_entries FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
  OR COALESCE(NEW.person_id, '') <> COALESCE(OLD.person_id, '')
  OR NEW.collaborator_id <> OLD.collaborator_id
BEGIN SELECT RAISE(ABORT, 'ledger_entry_financial_identity_immutable'); END;

CREATE TABLE journey_settlements_000061_down (
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
  reason_code TEXT NULL,
  reason_text TEXT NULL,
  second_approved_by TEXT NULL,
  second_approved_at DATETIME NULL,
  second_approval_notes TEXT NULL,
  CHECK (settlement_type IN ('ZERO_GOLD', 'PAYOUT', 'CLOSE_JOURNEY')),
  CHECK (status IN ('POSTED', 'VOIDED')),
  CHECK (brl_amount >= 0),
  CHECK (gold_gram_amount >= 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, collaborator_id, request_id)
);

INSERT INTO journey_settlements_000061_down (
  id, created_at, updated_at, tenant_id, collaborator_id, settlement_type,
  request_id, status, effective_date, brl_amount, gold_gram_amount, notes,
  authorized_by, authorized_at, reason_code, reason_text,
  second_approved_by, second_approved_at, second_approval_notes
)
SELECT
  id, created_at, updated_at, tenant_id, collaborator_id, settlement_type,
  request_id, status, effective_date, brl_amount, gold_gram_amount, notes,
  authorized_by, authorized_at, reason_code, reason_text,
  second_approved_by, second_approved_at, second_approval_notes
FROM journey_settlements;

DROP TABLE journey_settlements;
ALTER TABLE journey_settlements_000061_down RENAME TO journey_settlements;

CREATE INDEX IF NOT EXISTS idx_journey_settlements_tenant_collaborator ON journey_settlements(tenant_id, collaborator_id);
CREATE INDEX IF NOT EXISTS idx_journey_settlements_tenant_type ON journey_settlements(tenant_id, settlement_type);
CREATE INDEX IF NOT EXISTS idx_journey_settlements_effective_date ON journey_settlements(effective_date);
CREATE INDEX IF NOT EXISTS idx_journey_settlements_status ON journey_settlements(status);
CREATE INDEX IF NOT EXISTS idx_journey_settlements_reason_code ON journey_settlements(reason_code);
CREATE INDEX IF NOT EXISTS idx_journey_settlements_second_approved_by ON journey_settlements(second_approved_by);

CREATE TRIGGER IF NOT EXISTS trg_journey_settlements_tenant_exists_insert
BEFORE INSERT ON journey_settlements FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN SELECT RAISE(ABORT, 'tenant_integrity_violation'); END;
CREATE TRIGGER IF NOT EXISTS trg_journey_settlements_tenant_immutable
BEFORE UPDATE OF tenant_id ON journey_settlements FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN SELECT RAISE(ABORT, 'tenant_id_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_journey_settlements_same_tenant_insert
BEFORE INSERT ON journey_settlements FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
BEGIN SELECT RAISE(ABORT, 'cross_tenant_reference'); END;
CREATE TRIGGER IF NOT EXISTS trg_journey_settlements_same_tenant_update
BEFORE UPDATE ON journey_settlements FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
BEGIN SELECT RAISE(ABORT, 'cross_tenant_reference'); END;


CREATE TRIGGER IF NOT EXISTS trg_collaborator_journey_zero_balance_close
BEFORE UPDATE OF status_id, closed_at ON collaborator_journeys
FOR EACH ROW
WHEN (
  (NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL)
  OR (
    NEW.status_id <> OLD.status_id
    AND EXISTS (
      SELECT 1
      FROM reference_data status
      WHERE status.id = NEW.status_id
        AND status.tenant_id = NEW.tenant_id
        AND status.type = 'collaborator_status'
        AND status.code = 'FINISHED'
    )
  )
)
AND EXISTS (
  SELECT 1
  FROM ledger_entries le
  WHERE le.tenant_id = NEW.tenant_id
    AND le.collaborator_id = NEW.id
    AND le.active = 1
  GROUP BY le.value_unit_id
  HAVING ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.000000001
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_journey_non_zero_balance');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_same_tenant_insert
BEFORE INSERT ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.ledger_entry_id AND l.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_same_tenant_update
BEFORE UPDATE ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.ledger_entry_id AND l.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_receipt_financial_owner_consistency_insert
BEFORE INSERT ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM ledger_entries le
  WHERE le.id = NEW.ledger_entry_id
    AND le.tenant_id = NEW.tenant_id
    AND le.person_id = NEW.person_id
    AND le.collaborator_id = NEW.collaborator_id
)
BEGIN
  SELECT RAISE(ABORT, 'ledger_receipt_financial_owner_mismatch');
END;

COMMIT;

PRAGMA foreign_keys = ON;
