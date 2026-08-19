PRAGMA foreign_keys = ON;

-- Bite 30D delegated Roles must describe bounded authority. TENANT_ADMIN used
-- the historical '*' wildcard, which caused every current and future
-- permission to appear delegated even when it belonged to application scope or
-- intrinsic self-service. Ensure catalog rows that previously came only from
-- Go seeding exist before assigning the explicit tenant-admin set.
INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at) VALUES
('reference_data.read', 'Read reference data', 'Read tenant reference data records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('reference_data.manage', 'Manage reference data', 'Create, update, deactivate, and reactivate tenant reference data records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('current_accounts.settings.read', 'Read current account settings', 'Read tenant current account policy settings.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('current_accounts.settings.update', 'Update current account settings', 'Update tenant current account policy settings.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

DELETE FROM authz_role_permissions
WHERE role_id = 'authz-role-tenant-admin'
  AND permission_code = '*';

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at) VALUES
('authz-role-tenant-admin', 'tenants.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'people.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'people.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'people.update', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'collaborators.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'collaborators.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'collaborators.update', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'planning.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'planning.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'planning.update', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'earnings.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'earnings.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'earnings.update', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'price_lists.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'price_lists.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'price_lists.update', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'reference_data.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'reference_data.manage', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'expenses.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'expenses.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'expenses.update', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'current_accounts.summary.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'current_accounts.ledger.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'current_accounts.ledger.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'current_accounts.settings.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'current_accounts.settings.update', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'ledger.receipts.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'ledger.receipts.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'ledger.receipts.print', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'ledger.receipts.return', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'ledger.receipts.backfill', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'ledger.corrections.create', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'journey.settlements.preview', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'journey.settlements.zero_gold', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'journey.settlements.partial_payout', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'journey.settlements.close', CURRENT_TIMESTAMP);

UPDATE authz_roles
SET description = 'Tenant-wide administration through explicit delegated permissions.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'authz-role-tenant-admin';

PRAGMA foreign_keys = ON;
