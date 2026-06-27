PRAGMA foreign_keys = ON;

-- Bite 23A: ensure every historical expense has exactly one original debit
-- ledger posting. Runtime expense creation already writes this ledger entry in
-- the same transaction as the expense; this migration closes any gap left by
-- rows created before that behavior was introduced or by interrupted manual
-- data loads.
INSERT OR IGNORE INTO ledger_entries (
  id, created_at, updated_at, tenant_id, collaborator_id, value_unit_id,
  entry_type, direction, amount, effective_date, source_type, source_id,
  description, active, correction_type
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
  e.active,
  'ORIGINAL'
FROM expenses e
WHERE NOT EXISTS (
  SELECT 1
  FROM ledger_entries le
  WHERE le.tenant_id = e.tenant_id
    AND le.source_type = 'EXPENSE'
    AND le.source_id = e.id
    AND le.value_unit_id = e.value_unit_id
    AND le.direction = 'DEBIT'
);

-- GORM creates receipt obligations for new debit ledger entries. SQL migrations
-- do not invoke GORM hooks, so ensure any ledger postings inserted above also
-- have a pending receipt obligation without duplicating existing receipts.
INSERT OR IGNORE INTO ledger_receipts (
  id, created_at, updated_at, tenant_id, collaborator_id, ledger_entry_id,
  receipt_number, receipt_type, status
)
SELECT
  'receipt-' || le.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  le.tenant_id,
  le.collaborator_id,
  le.id,
  'RCP-' || UPPER(REPLACE(REPLACE(le.id, '-', ''), ':', '')),
  'LEDGER_DEBIT',
  'PENDING_ISSUE'
FROM ledger_entries le
WHERE le.direction = 'DEBIT'
  AND NOT EXISTS (
    SELECT 1
    FROM ledger_receipts lr
    WHERE lr.ledger_entry_id = le.id
  );
