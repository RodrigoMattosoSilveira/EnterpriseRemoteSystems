package db

import "gorm.io/gorm"

const ledgerReceiptAcceptanceGuardSQL = `
CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_acceptance_insert_guard
BEFORE INSERT ON ledger_receipts
BEGIN
  SELECT RAISE(ABORT, 'ledger_receipt_acceptance_incomplete')
  WHERE NEW.accepted_at IS NOT NULL
    AND (
      COALESCE(TRIM(NEW.accepted_by), '') = ''
      OR COALESCE(TRIM(NEW.acceptance_method), '') = ''
      OR NEW.status <> 'RETURNED'
    );

  SELECT RAISE(ABORT, 'ledger_receipt_direction_invalid')
  WHERE NOT (
    (NEW.receipt_purpose = 'LEDGER_DEBIT'
      AND NEW.payment_direction = 'ACCOUNT_DEBIT'
      AND NEW.accepting_party = 'COLLABORATOR')
    OR (NEW.receipt_purpose = 'FINAL_SETTLEMENT_TENANT_PAYMENT'
      AND NEW.payment_direction = 'TENANT_TO_COLLABORATOR'
      AND NEW.accepting_party = 'COLLABORATOR')
    OR (NEW.receipt_purpose = 'FINAL_SETTLEMENT_COLLABORATOR_PAYMENT'
      AND NEW.payment_direction = 'COLLABORATOR_TO_TENANT'
      AND NEW.accepting_party = 'TENANT')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_acceptance_update_guard
BEFORE UPDATE ON ledger_receipts
BEGIN
  SELECT RAISE(ABORT, 'ledger_receipt_acceptance_immutable')
  WHERE OLD.accepted_at IS NOT NULL
    AND (
      NEW.accepted_at IS NOT OLD.accepted_at
      OR COALESCE(NEW.accepted_by, '') <> COALESCE(OLD.accepted_by, '')
      OR COALESCE(NEW.acceptance_method, '') <> COALESCE(OLD.acceptance_method, '')
      OR NEW.status <> OLD.status
    );

  SELECT RAISE(ABORT, 'ledger_receipt_acceptance_incomplete')
  WHERE NEW.accepted_at IS NOT NULL
    AND (
      COALESCE(TRIM(NEW.accepted_by), '') = ''
      OR COALESCE(TRIM(NEW.acceptance_method), '') = ''
      OR NEW.status <> 'RETURNED'
    );

  SELECT RAISE(ABORT, 'ledger_receipt_direction_invalid')
  WHERE NOT (
    (NEW.receipt_purpose = 'LEDGER_DEBIT'
      AND NEW.payment_direction = 'ACCOUNT_DEBIT'
      AND NEW.accepting_party = 'COLLABORATOR')
    OR (NEW.receipt_purpose = 'FINAL_SETTLEMENT_TENANT_PAYMENT'
      AND NEW.payment_direction = 'TENANT_TO_COLLABORATOR'
      AND NEW.accepting_party = 'COLLABORATOR')
    OR (NEW.receipt_purpose = 'FINAL_SETTLEMENT_COLLABORATOR_PAYMENT'
      AND NEW.payment_direction = 'COLLABORATOR_TO_TENANT'
      AND NEW.accepting_party = 'TENANT')
  );

  SELECT RAISE(ABORT, 'ledger_receipt_direction_immutable')
  WHERE COALESCE(NEW.receipt_purpose, '') <> COALESCE(OLD.receipt_purpose, '')
     OR COALESCE(NEW.payment_direction, '') <> COALESCE(OLD.payment_direction, '')
     OR COALESCE(NEW.accepting_party, '') <> COALESCE(OLD.accepting_party, '');
END;
`

func InstallLedgerReceiptAcceptanceGuards(database *gorm.DB) error {
	return database.Exec(ledgerReceiptAcceptanceGuardSQL).Error
}
