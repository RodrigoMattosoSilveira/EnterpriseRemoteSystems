PRAGMA foreign_keys = ON;

-- Bite 30G makes Person + Tenant the enduring owner of financial history.
-- Collaborator Journey references remain as provenance until Bite 30J removes
-- the remaining compatibility structures.
ALTER TABLE expenses ADD COLUMN person_id TEXT NULL;
ALTER TABLE accrual_items ADD COLUMN person_id TEXT NULL;
ALTER TABLE ledger_entries ADD COLUMN person_id TEXT NULL;
ALTER TABLE ledger_receipts ADD COLUMN person_id TEXT NULL;

-- Backfill canonical global Person ownership through the 30F Journey ->
-- Membership relationship.
UPDATE expenses
SET person_id = (
  SELECT m.person_id
  FROM collaborator_journeys c
  JOIN person_tenant_memberships m
    ON m.id = c.membership_id
   AND m.tenant_id = c.tenant_id
  WHERE c.id = expenses.collaborator_id
    AND c.tenant_id = expenses.tenant_id
  LIMIT 1
)
WHERE person_id IS NULL OR TRIM(person_id) = '';

UPDATE accrual_items
SET person_id = (
  SELECT m.person_id
  FROM collaborator_journeys c
  JOIN person_tenant_memberships m
    ON m.id = c.membership_id
   AND m.tenant_id = c.tenant_id
  WHERE c.id = accrual_items.collaborator_id
    AND c.tenant_id = accrual_items.tenant_id
  LIMIT 1
)
WHERE person_id IS NULL OR TRIM(person_id) = '';

UPDATE ledger_entries
SET person_id = (
  SELECT m.person_id
  FROM collaborator_journeys c
  JOIN person_tenant_memberships m
    ON m.id = c.membership_id
   AND m.tenant_id = c.tenant_id
  WHERE c.id = ledger_entries.collaborator_id
    AND c.tenant_id = ledger_entries.tenant_id
  LIMIT 1
)
WHERE person_id IS NULL OR TRIM(person_id) = '';

UPDATE ledger_receipts
SET person_id = (
  SELECT le.person_id
  FROM ledger_entries le
  WHERE le.id = ledger_receipts.ledger_entry_id
    AND le.tenant_id = ledger_receipts.tenant_id
    AND le.collaborator_id = ledger_receipts.collaborator_id
  LIMIT 1
)
WHERE person_id IS NULL OR TRIM(person_id) = '';

-- Refuse the cutover if any financial row cannot be mapped exactly to the
-- Person/Tenant/Journey relationship established by Bites 30B and 30F.
CREATE TEMP TABLE bite30g_financial_backfill_guard (id INTEGER);
CREATE TEMP TRIGGER bite30g_verify_financial_backfill
BEFORE INSERT ON bite30g_financial_backfill_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM expenses e
  WHERE e.person_id IS NULL OR TRIM(e.person_id) = ''
     OR NOT EXISTS (
       SELECT 1
       FROM collaborator_journeys c
       JOIN person_tenant_memberships m
         ON m.id = c.membership_id
        AND m.tenant_id = c.tenant_id
       JOIN global_people gp
         ON gp.id = m.person_id
       WHERE c.id = e.collaborator_id
         AND c.tenant_id = e.tenant_id
         AND m.person_id = e.person_id
     )
)
OR EXISTS (
  SELECT 1
  FROM accrual_items ai
  WHERE ai.person_id IS NULL OR TRIM(ai.person_id) = ''
     OR NOT EXISTS (
       SELECT 1
       FROM collaborator_journeys c
       JOIN person_tenant_memberships m
         ON m.id = c.membership_id
        AND m.tenant_id = c.tenant_id
       JOIN global_people gp
         ON gp.id = m.person_id
       WHERE c.id = ai.collaborator_id
         AND c.tenant_id = ai.tenant_id
         AND m.person_id = ai.person_id
     )
)
OR EXISTS (
  SELECT 1
  FROM ledger_entries le
  WHERE le.person_id IS NULL OR TRIM(le.person_id) = ''
     OR NOT EXISTS (
       SELECT 1
       FROM collaborator_journeys c
       JOIN person_tenant_memberships m
         ON m.id = c.membership_id
        AND m.tenant_id = c.tenant_id
       JOIN global_people gp
         ON gp.id = m.person_id
       WHERE c.id = le.collaborator_id
         AND c.tenant_id = le.tenant_id
         AND m.person_id = le.person_id
     )
)
OR EXISTS (
  SELECT 1
  FROM ledger_receipts lr
  WHERE lr.person_id IS NULL OR TRIM(lr.person_id) = ''
     OR NOT EXISTS (
       SELECT 1
       FROM ledger_entries le
       WHERE le.id = lr.ledger_entry_id
         AND le.tenant_id = lr.tenant_id
         AND le.collaborator_id = lr.collaborator_id
         AND le.person_id = lr.person_id
     )
)
BEGIN
  SELECT RAISE(ABORT, 'person_tenant_financial_backfill_incomplete');
END;
INSERT INTO bite30g_financial_backfill_guard(id) VALUES (1);
DROP TRIGGER bite30g_verify_financial_backfill;
DROP TABLE bite30g_financial_backfill_guard;

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_person_date
ON expenses(tenant_id, person_id, expense_date);

CREATE INDEX IF NOT EXISTS idx_accrual_items_tenant_person_status
ON accrual_items(tenant_id, person_id, status);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_person_unit_active
ON ledger_entries(tenant_id, person_id, value_unit_id, active);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_person_date
ON ledger_entries(tenant_id, person_id, effective_date);

CREATE INDEX IF NOT EXISTS idx_ledger_receipts_tenant_person_status
ON ledger_receipts(tenant_id, person_id, status);

-- Expense ownership may be deliberately reassigned by the existing Expense
-- update workflow. Whenever provenance changes, Person ownership must change
-- with it and remain consistent.
CREATE TRIGGER IF NOT EXISTS trg_expense_financial_owner_required_insert
BEFORE INSERT ON expenses
FOR EACH ROW
WHEN NEW.person_id IS NULL OR TRIM(NEW.person_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'expense_person_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_financial_owner_consistency_insert
BEFORE INSERT ON expenses
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
  SELECT RAISE(ABORT, 'expense_person_tenant_journey_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_financial_owner_consistency_update
BEFORE UPDATE OF tenant_id, person_id, collaborator_id ON expenses
FOR EACH ROW
WHEN NEW.person_id IS NULL OR TRIM(NEW.person_id) = ''
  OR NOT EXISTS (
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
  SELECT RAISE(ABORT, 'expense_person_tenant_journey_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_financial_owner_required_insert
BEFORE INSERT ON accrual_items
FOR EACH ROW
WHEN NEW.person_id IS NULL OR TRIM(NEW.person_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'accrual_item_person_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_financial_owner_consistency_insert
BEFORE INSERT ON accrual_items
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
  SELECT RAISE(ABORT, 'accrual_item_person_tenant_journey_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_financial_identity_immutable
BEFORE UPDATE OF tenant_id, person_id, collaborator_id ON accrual_items
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
  OR COALESCE(NEW.person_id, '') <> COALESCE(OLD.person_id, '')
  OR NEW.collaborator_id <> OLD.collaborator_id
BEGIN
  SELECT RAISE(ABORT, 'accrual_item_financial_identity_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_financial_owner_required_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN NEW.person_id IS NULL OR TRIM(NEW.person_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'ledger_entry_person_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_financial_owner_consistency_insert
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

CREATE TRIGGER IF NOT EXISTS trg_ledger_financial_identity_immutable
BEFORE UPDATE OF tenant_id, person_id, collaborator_id ON ledger_entries
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
  OR COALESCE(NEW.person_id, '') <> COALESCE(OLD.person_id, '')
  OR NEW.collaborator_id <> OLD.collaborator_id
BEGIN
  SELECT RAISE(ABORT, 'ledger_entry_financial_identity_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_receipt_financial_owner_required_insert
BEFORE INSERT ON ledger_receipts
FOR EACH ROW
WHEN NEW.person_id IS NULL OR TRIM(NEW.person_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'ledger_receipt_person_required');
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

CREATE TRIGGER IF NOT EXISTS trg_receipt_financial_identity_immutable
BEFORE UPDATE OF tenant_id, person_id, collaborator_id, ledger_entry_id ON ledger_receipts
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
  OR COALESCE(NEW.person_id, '') <> COALESCE(OLD.person_id, '')
  OR NEW.collaborator_id <> OLD.collaborator_id
  OR NEW.ledger_entry_id <> OLD.ledger_entry_id
BEGIN
  SELECT RAISE(ABORT, 'ledger_receipt_financial_identity_immutable');
END;
