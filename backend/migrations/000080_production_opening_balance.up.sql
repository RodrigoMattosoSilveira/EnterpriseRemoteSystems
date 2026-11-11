-- Byte 35.5: explicitly classified immutable historical opening positions.
-- This migration is schema-only and DOES NOT import customer data.
-- Apply exclusively through the existing guarded migration/recovery gate.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;


DROP TRIGGER IF EXISTS "trg_collaborator_journey_zero_balance_close";

DROP TRIGGER IF EXISTS "trg_ledger_receipts_same_tenant_insert";

DROP TRIGGER IF EXISTS "trg_ledger_receipts_same_tenant_update";

DROP TRIGGER IF EXISTS "trg_receipt_financial_owner_consistency_insert";


CREATE TABLE ledger_entries_000080 (
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
  person_id TEXT NULL, work_sector_id TEXT NOT NULL DEFAULT '', work_sector_label TEXT NOT NULL DEFAULT '', work_location_id TEXT NOT NULL DEFAULT '', work_location_label TEXT NOT NULL DEFAULT '', work_task_id TEXT NOT NULL DEFAULT '', work_task_label TEXT NOT NULL DEFAULT '',
  CHECK (direction IN ('CREDIT', 'DEBIT')),
  CHECK (entry_type IN (
    'EARNING_CREDIT',
    'EXPENSE_DEDUCTION',
    'GOLD_TO_BRL_CONVERSION',
    'PIX_REMITTANCE',
    'REPLACEMENT_TRANSFER',
    'PAYOUT',
    'FINAL_SETTLEMENT',
    'OPENING_BALANCE'
  )),
  CHECK (amount > 0),
  CHECK (entry_type <> 'OPENING_BALANCE' OR (source_type = 'OPENING_BALANCE' AND correction_type = 'ORIGINAL')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (value_unit_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (tenant_id, source_type, source_id, value_unit_id, direction)
);

INSERT INTO ledger_entries_000080 ("id", "created_at", "updated_at", "tenant_id", "collaborator_id", "value_unit_id", "entry_type", "direction", "amount", "effective_date", "source_type", "source_id", "description", "active", "correction_type", "related_entry_id", "correction_reason", "authorized_by", "authorized_at", "correction_reason_code", "correction_reason_text", "second_approved_by", "second_approved_at", "second_approval_notes", "person_id", "work_sector_id", "work_sector_label", "work_location_id", "work_location_label", "work_task_id", "work_task_label") SELECT "id", "created_at", "updated_at", "tenant_id", "collaborator_id", "value_unit_id", "entry_type", "direction", "amount", "effective_date", "source_type", "source_id", "description", "active", "correction_type", "related_entry_id", "correction_reason", "authorized_by", "authorized_at", "correction_reason_code", "correction_reason_text", "second_approved_by", "second_approved_at", "second_approval_notes", "person_id", "work_sector_id", "work_sector_label", "work_location_id", "work_location_label", "work_task_id", "work_task_label" FROM ledger_entries;

DROP TABLE ledger_entries;
ALTER TABLE ledger_entries_000080 RENAME TO ledger_entries;


CREATE INDEX idx_ledger_entries_active ON ledger_entries(active);

CREATE INDEX idx_ledger_entries_collaborator_id ON ledger_entries(collaborator_id);

CREATE INDEX idx_ledger_entries_correction_reason_code ON ledger_entries(correction_reason_code);

CREATE INDEX idx_ledger_entries_correction_type ON ledger_entries(correction_type);

CREATE INDEX idx_ledger_entries_direction ON ledger_entries(direction);

CREATE INDEX idx_ledger_entries_effective_date ON ledger_entries(effective_date);

CREATE INDEX idx_ledger_entries_entry_type ON ledger_entries(entry_type);

CREATE INDEX idx_ledger_entries_related_entry ON ledger_entries(related_entry_id);

CREATE INDEX idx_ledger_entries_second_approved_by ON ledger_entries(second_approved_by);

CREATE INDEX idx_ledger_entries_source ON ledger_entries(source_type, source_id);

CREATE INDEX idx_ledger_entries_tenant_collaborator_date ON ledger_entries(tenant_id, collaborator_id, effective_date);

CREATE INDEX idx_ledger_entries_tenant_collaborator_unit_active ON ledger_entries(tenant_id, collaborator_id, value_unit_id, active);

CREATE INDEX idx_ledger_entries_tenant_id ON ledger_entries(tenant_id);

CREATE INDEX idx_ledger_entries_tenant_person_date ON ledger_entries(tenant_id, person_id, effective_date);

CREATE INDEX idx_ledger_entries_tenant_person_unit_active ON ledger_entries(tenant_id, person_id, value_unit_id, active);

CREATE INDEX idx_ledger_entries_value_unit_id ON ledger_entries(value_unit_id);

CREATE UNIQUE INDEX ux_ledger_entries_single_reversal
  ON ledger_entries(tenant_id, related_entry_id)
  WHERE correction_type = 'REVERSAL'
    AND related_entry_id IS NOT NULL;



CREATE TRIGGER trg_byte353_ledger_work_attribution_immutable
BEFORE UPDATE OF work_sector_id, work_sector_label, work_location_id, work_location_label, work_task_id, work_task_label ON ledger_entries
WHEN OLD.work_sector_id IS NOT NEW.work_sector_id
 OR OLD.work_sector_label IS NOT NEW.work_sector_label
 OR OLD.work_location_id IS NOT NEW.work_location_id
 OR OLD.work_location_label IS NOT NEW.work_location_label
 OR OLD.work_task_id IS NOT NEW.work_task_id
 OR OLD.work_task_label IS NOT NEW.work_task_label
BEGIN SELECT RAISE(ABORT, 'posted ledger work attribution is immutable'); END;

CREATE TRIGGER trg_ledger_entries_same_tenant_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.related_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.related_entry_id AND l.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER trg_ledger_entries_same_tenant_update
BEFORE UPDATE ON ledger_entries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.related_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.related_entry_id AND l.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER trg_ledger_entries_tenant_exists_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER trg_ledger_entries_tenant_immutable
BEFORE UPDATE OF tenant_id ON ledger_entries
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER trg_ledger_financial_identity_immutable
BEFORE UPDATE OF tenant_id, person_id, collaborator_id ON ledger_entries
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
  OR COALESCE(NEW.person_id, '') <> COALESCE(OLD.person_id, '')
  OR NEW.collaborator_id <> OLD.collaborator_id
BEGIN
  SELECT RAISE(ABORT, 'ledger_entry_financial_identity_immutable');
END;

CREATE TRIGGER trg_ledger_financial_owner_consistency_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM collaborator_journeys c
  JOIN person_tenant_memberships m
    ON m.id = c.membership_id
   AND m.tenant_id = c.tenant_id
  WHERE c.id = NEW.collaborator_id
    AND c.tenant_id = NEW.tenant_id
    AND m.person_id = NEW.person_id
)
BEGIN
  SELECT RAISE(ABORT, 'ledger_entry_person_tenant_journey_mismatch');
END;

CREATE TRIGGER trg_ledger_financial_owner_required_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN NEW.person_id IS NULL OR TRIM(NEW.person_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'ledger_entry_person_required');
END;

CREATE TRIGGER trg_collaborator_journey_zero_balance_close
BEFORE UPDATE OF status_id, closed_at ON collaborator_journeys
FOR EACH ROW
WHEN (
  (NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL)
  OR (
    NEW.status_id <> OLD.status_id
    AND EXISTS (
      SELECT 1 FROM reference_data status
      WHERE status.id = NEW.status_id
        AND status.tenant_id = NEW.tenant_id
        AND status.type = 'collaborator_status'
        AND status.code = 'FINISHED'
    )
  )
)
AND EXISTS (
  SELECT 1 FROM ledger_entries le
  WHERE le.tenant_id = NEW.tenant_id
    AND le.collaborator_id = NEW.id
    AND le.active = 1
  GROUP BY le.value_unit_id
  HAVING ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.000000001
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_journey_non_zero_balance');
END;

CREATE TRIGGER trg_ledger_receipts_same_tenant_insert
BEFORE INSERT ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.ledger_entry_id AND l.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER trg_ledger_receipts_same_tenant_update
BEFORE UPDATE ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.ledger_entry_id AND l.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER trg_receipt_financial_owner_consistency_insert
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


-- Opening positions are historical ledger evidence, not ordinary earnings or bonuses.
-- They must never be silently changed, reversed, or deleted by routine operations.
CREATE TRIGGER trg_byte355_opening_balance_no_update
BEFORE UPDATE ON ledger_entries WHEN OLD.entry_type='OPENING_BALANCE'
BEGIN SELECT RAISE(ABORT, 'opening_balance_immutable'); END;
CREATE TRIGGER trg_byte355_opening_balance_no_delete
BEFORE DELETE ON ledger_entries WHEN OLD.entry_type='OPENING_BALANCE'
BEGIN SELECT RAISE(ABORT, 'opening_balance_immutable'); END;

CREATE TABLE production_opening_balance_imports (
  import_id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK(environment IN ('test', 'production')),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  csv_sha256 TEXT NOT NULL UNIQUE CHECK(length(csv_sha256)=64),
  approval_sha256 TEXT NOT NULL CHECK(length(approval_sha256)=64),
  signature_sha256 TEXT NOT NULL CHECK(length(signature_sha256)=64),
  approval_key_sha256 TEXT NOT NULL CHECK(length(approval_key_sha256)=64),
  approval_reference TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  executed_by TEXT NOT NULL CHECK(approved_by<>executed_by),
  expected_rows INTEGER NOT NULL CHECK(expected_rows>0),
  expected_brl TEXT NOT NULL,
  expected_gold_gram TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);
CREATE TRIGGER trg_byte355_import_no_update
BEFORE UPDATE ON production_opening_balance_imports
BEGIN SELECT RAISE(ABORT, 'opening_balance_import_immutable'); END;
CREATE TRIGGER trg_byte355_import_no_delete
BEFORE DELETE ON production_opening_balance_imports
BEGIN SELECT RAISE(ABORT, 'opening_balance_import_immutable'); END;
-- An OPENING_BALANCE ledger row must refer to a separately recorded batch
-- for the same Entidade. This does not replace the cryptographic CLI approval.
CREATE TRIGGER trg_byte355_opening_import_required
BEFORE INSERT ON ledger_entries
WHEN NEW.entry_type='OPENING_BALANCE'
 AND NOT EXISTS (
   SELECT 1 FROM production_opening_balance_imports b
   WHERE b.tenant_id = NEW.tenant_id
     AND b.import_id = substr(NEW.source_id, 1, instr(NEW.source_id, ':') - 1)
 )
BEGIN SELECT RAISE(ABORT, 'opening_balance_import_required'); END;

CREATE UNIQUE INDEX ux_byte355_opening_balance_journey_unit
ON ledger_entries(tenant_id, collaborator_id, value_unit_id)
WHERE entry_type='OPENING_BALANCE';

COMMIT;
PRAGMA foreign_keys=ON;
