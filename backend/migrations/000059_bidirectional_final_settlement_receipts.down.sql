DELETE FROM authz_role_permissions
WHERE role_id = 'authz-role-tenant-admin'
  AND permission_code IN (
    'ledger.receipts.tenant.accept',
    'journey.settlements.final_tenant_payment',
    'journey.settlements.final_collaborator_payment'
  );
DELETE FROM authz_permissions
WHERE code IN (
  'ledger.receipts.self.accept',
  'ledger.receipts.tenant.accept',
  'journey.settlements.final_tenant_payment',
  'journey.settlements.final_collaborator_payment'
);
DROP TRIGGER IF EXISTS trg_ledger_receipts_acceptance_update_guard;
DROP TRIGGER IF EXISTS trg_ledger_receipts_acceptance_insert_guard;
DROP INDEX IF EXISTS idx_ledger_receipts_accepted_by;
DROP INDEX IF EXISTS idx_ledger_receipts_tenant_purpose_status;
ALTER TABLE ledger_receipts DROP COLUMN acceptance_method;
ALTER TABLE ledger_receipts DROP COLUMN accepted_by;
ALTER TABLE ledger_receipts DROP COLUMN accepted_at;
ALTER TABLE ledger_receipts DROP COLUMN accepting_party;
ALTER TABLE ledger_receipts DROP COLUMN payment_direction;
ALTER TABLE ledger_receipts DROP COLUMN receipt_purpose;
