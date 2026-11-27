DELETE FROM reference_data WHERE type = 'RECEIPT_ACCEPTANCE_MODE';

ALTER TABLE ledger_receipts DROP COLUMN accepted_user_agent;
ALTER TABLE ledger_receipts DROP COLUMN accepted_ip;
