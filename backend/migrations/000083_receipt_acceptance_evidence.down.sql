DROP INDEX IF EXISTS idx_ledger_receipt_acceptance_evidence_tenant;
DROP TABLE IF EXISTS ledger_receipt_acceptance_evidence;

ALTER TABLE ledger_receipts ADD COLUMN accepted_ip TEXT NULL;
ALTER TABLE ledger_receipts ADD COLUMN accepted_user_agent TEXT NULL;
