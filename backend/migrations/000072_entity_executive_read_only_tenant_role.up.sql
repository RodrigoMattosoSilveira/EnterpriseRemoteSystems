PRAGMA foreign_keys = ON;

-- Bite 32.6.2: add a genuine Tenant-scoped read-only executive Role.  The
-- Role is deliberately scope_type=TENANT so Bite 32 cross-Tenant delegated
-- Role isolation applies automatically, including lifecycle-suspended grants.
INSERT OR IGNORE INTO authz_permissions(code, label, description, created_at, updated_at) VALUES
('authz.tenant_actors.read', 'Read tenant Actors', 'Read Account-bound Actors and lifecycle state for the selected tenant.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.tenant_role_grants.read', 'Read tenant role grants', 'Read delegated Tenant Role Grants without authority to create or revoke them.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz.tenant_audit.read', 'Read tenant authorization audit', 'Read authorization audit records for the selected tenant only.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('gold_prices.read', 'Read gold prices', 'Read sensitive tenant gold-price history without mutation authority.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('gold_production.read', 'Read gold production', 'Read tenant Gold Production entries without mutation authority.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO authz_roles(id, code, label, description, scope_type, active, created_at, updated_at) VALUES
('authz-role-tenant-viewer', 'TENANT_VIEWER', 'Entity Executive (Read Only)', 'Read-only visibility across Tenant business, authorization, support-access, and audit records.', 'TENANT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- The Tenant Administrator keeps its existing mutation authority and gains the
-- corresponding explicit reads used by shared read routes.
INSERT OR IGNORE INTO authz_role_permissions(role_id, permission_code, created_at) VALUES
('authz-role-tenant-admin', 'authz.tenant_actors.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'authz.tenant_role_grants.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'authz.tenant_audit.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'gold_prices.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'gold_production.read', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO authz_role_permissions(role_id, permission_code, created_at) VALUES
('authz-role-tenant-viewer', 'authz.self.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'authz.tenant_actors.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'authz.tenant_role_grants.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'authz.tenant_audit.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'support_access_leases.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'tenants.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'people.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'collaborators.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'planning.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'earnings.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'price_lists.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'gold_prices.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'gold_production.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'reference_data.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'expenses.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'current_accounts.summary.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'current_accounts.ledger.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'current_accounts.settings.read', CURRENT_TIMESTAMP),
('authz-role-tenant-viewer', 'ledger.receipts.read', CURRENT_TIMESTAMP);

PRAGMA foreign_keys = ON;
