-- Acceptance evidence (client IP and user agent) moves out of ledger_receipts.
-- Byte 35.4C training fixture digest reads every ledger_receipts column, so
-- adding columns to that table changes the frozen fixture digest. Migration
-- 000081 added the columns; this migration removes them again and stores the
-- evidence in its own table, one row per in-app acceptance.

ALTER TABLE ledger_receipts DROP COLUMN accepted_ip;
ALTER TABLE ledger_receipts DROP COLUMN accepted_user_agent;

CREATE TABLE IF NOT EXISTS ledger_receipt_acceptance_evidence (
  receipt_id TEXT PRIMARY KEY REFERENCES ledger_receipts(id),
  tenant_id TEXT NOT NULL,
  accepted_at DATETIME NOT NULL,
  accepted_ip TEXT NULL,
  accepted_user_agent TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_receipt_acceptance_evidence_tenant
ON ledger_receipt_acceptance_evidence(tenant_id);
