PRAGMA foreign_keys = ON;

-- Gold-price administration is a sensitive tenant-level function. It used to
-- piggyback on price_lists.* permissions, which unintentionally allowed
-- EXPENSE_OPERATOR actors to list, record, replace, and deactivate gold prices.
INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at)
VALUES (
  'gold_prices.manage',
  'Manage gold prices',
  'List, record, replace, and deactivate sensitive tenant gold-price administration records.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at)
VALUES ('authz-role-tenant-admin', 'gold_prices.manage', CURRENT_TIMESTAMP);

PRAGMA foreign_keys = ON;
