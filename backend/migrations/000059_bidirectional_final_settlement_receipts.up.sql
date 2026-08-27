PRAGMA foreign_keys = ON;

ALTER TABLE ledger_receipts ADD COLUMN receipt_purpose TEXT NOT NULL DEFAULT 'LEDGER_DEBIT';
ALTER TABLE ledger_receipts ADD COLUMN payment_direction TEXT NOT NULL DEFAULT 'ACCOUNT_DEBIT';
ALTER TABLE ledger_receipts ADD COLUMN accepting_party TEXT NOT NULL DEFAULT 'COLLABORATOR';
ALTER TABLE ledger_receipts ADD COLUMN accepted_at DATETIME NULL;
ALTER TABLE ledger_receipts ADD COLUMN accepted_by TEXT NULL;
ALTER TABLE ledger_receipts ADD COLUMN acceptance_method TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_receipts_tenant_purpose_status
ON ledger_receipts(tenant_id, receipt_purpose, status);

CREATE INDEX IF NOT EXISTS idx_ledger_receipts_accepted_by
ON ledger_receipts(accepted_by);

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

INSERT OR IGNORE INTO authz_permissions(code, label, description, created_at, updated_at) VALUES
('ledger.receipts.self.accept', 'Accept own settlement receipts', 'Accept the actor''s own Tenant-to-Collaborator final-settlement receipts in-app.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ledger.receipts.tenant.accept', 'Accept Tenant settlement receipts', 'Accept Collaborator-to-Tenant final-settlement receipts on behalf of the Tenant.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('journey.settlements.final_tenant_payment', 'Final Tenant payment', 'Post the full positive Journey balance owed by the Tenant to the Collaborator.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('journey.settlements.final_collaborator_payment', 'Final Collaborator payment', 'Record the full negative Journey balance paid by the Collaborator to the Tenant.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO authz_role_permissions(role_id, permission_code, created_at) VALUES
('authz-role-tenant-admin', 'ledger.receipts.tenant.accept', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'journey.settlements.final_tenant_payment', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'journey.settlements.final_collaborator_payment', CURRENT_TIMESTAMP);
