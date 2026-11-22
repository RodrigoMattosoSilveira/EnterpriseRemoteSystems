-- Receipt acceptance mode (per tenant, per receipt scope) and client evidence
-- for in-app acceptance. Mode values live in reference_data:
--   type = RECEIPT_ACCEPTANCE_MODE, code = EXPENSE_DEBIT,
--   metadata_json = {"mode": "BOTH" | "PAPER_ONLY" | "ELECTRONIC_ONLY"}.
-- Tenants without a row fall back to BOTH in application code.

ALTER TABLE ledger_receipts ADD COLUMN accepted_ip TEXT NULL;
ALTER TABLE ledger_receipts ADD COLUMN accepted_user_agent TEXT NULL;

INSERT OR IGNORE INTO reference_data (
  id, type, code, label, description, active, sort_order, metadata_json,
  created_at, updated_at, tenant_id
)
SELECT
  lower(hex(randomblob(16))),
  'RECEIPT_ACCEPTANCE_MODE',
  'EXPENSE_DEBIT',
  'Expense receipts',
  'How collaborators and operators may close expense debit receipts',
  1,
  10,
  '{"mode":"BOTH"}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  id
FROM tenants;
