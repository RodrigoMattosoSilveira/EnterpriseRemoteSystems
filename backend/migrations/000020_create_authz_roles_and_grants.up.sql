PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS authz_actors (
  id TEXT PRIMARY KEY,
  actor_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  person_id TEXT NULL,
  collaborator_id TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS authz_roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NULL,
  scope_type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS authz_permissions (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS authz_role_permissions (
  role_id TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  FOREIGN KEY (role_id) REFERENCES authz_roles(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (permission_code) REFERENCES authz_permissions(code) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS authz_actor_role_grants (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT '*',
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES authz_actors(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES authz_roles(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_authz_actor_role_tenant ON authz_actor_role_grants(actor_id, role_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_authz_actors_person ON authz_actors(person_id);
CREATE INDEX IF NOT EXISTS idx_authz_actors_collaborator ON authz_actors(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_authz_actors_active ON authz_actors(active);
CREATE INDEX IF NOT EXISTS idx_authz_roles_scope_active ON authz_roles(scope_type, active);
CREATE INDEX IF NOT EXISTS idx_authz_actor_role_grants_actor_active ON authz_actor_role_grants(actor_id, active);
CREATE INDEX IF NOT EXISTS idx_authz_actor_role_grants_tenant_active ON authz_actor_role_grants(tenant_id, active);

INSERT OR IGNORE INTO authz_roles (id, code, label, description, scope_type, active, created_at, updated_at) VALUES
('authz-role-application-admin', 'APPLICATION_ADMIN', 'Application Administrator', 'CRU all records across all tenants.', 'APPLICATION', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'TENANT_ADMIN', 'Tenant Administrator', 'CRU all records for the assigned tenant.', 'TENANT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz-role-earnings-operator', 'EARNINGS_OPERATOR', 'Earnings Operator', 'Planning and earning operations for the assigned tenant.', 'TENANT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'EXPENSE_OPERATOR', 'Expense Operator', 'Expense, price list, current account summary, and receipt operations for the assigned tenant.', 'TENANT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('authz-role-person', 'PERSON', 'Person', 'Self-service read/update access for a person and linked collaborator records.', 'SELF', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at) VALUES
('*', 'All permissions', 'Wildcard permission for application and tenant administrators.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.read', 'Read tenants', 'Read tenant records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.create', 'Create tenants', 'Create tenant records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tenants.update', 'Update tenants', 'Update tenant records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('people.read', 'Read people', 'Read tenant person records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('people.create', 'Create people', 'Create tenant person records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('people.update', 'Update people', 'Update tenant person records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('people.self.read', 'Read own person', 'Read the actor''s own person record.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('people.self.update', 'Update own person', 'Update the actor''s own person record.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('collaborators.read', 'Read collaborators', 'Read tenant collaborator records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('collaborators.create', 'Create collaborators', 'Create tenant collaborator records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('collaborators.update', 'Update collaborators', 'Update tenant collaborator records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('collaborators.self.read', 'Read own collaborator', 'Read the actor''s linked collaborator record.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('planning.read', 'Read planning', 'Read tenant planning records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('planning.create', 'Create planning', 'Create tenant planning records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('planning.update', 'Update planning', 'Update tenant planning records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('earnings.read', 'Read earnings', 'Read tenant earning records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('earnings.create', 'Create earnings', 'Create tenant earning records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('earnings.update', 'Update earnings', 'Update tenant earning records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_lists.read', 'Read price lists', 'Read tenant price list records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_lists.create', 'Create price lists', 'Create tenant price list records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('price_lists.update', 'Update price lists', 'Update tenant price list records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('expenses.read', 'Read expenses', 'Read tenant expense records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('expenses.create', 'Create expenses', 'Create tenant expense records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('expenses.update', 'Update expenses', 'Update tenant expense records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('current_accounts.summary.read', 'Read current account summary', 'Read tenant collaborator current account summaries.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('current_accounts.ledger.read', 'Read current account ledger', 'Read tenant collaborator current account ledger records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('current_accounts.ledger.create', 'Create current account ledger', 'Create tenant current account ledger records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('current_accounts.self.summary.read', 'Read own current account summary', 'Read the actor''s own current account summary.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('current_accounts.self.ledger.read', 'Read own current account ledger', 'Read the actor''s own current account ledger records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('assignments.self.current.read', 'Read own current assignment', 'Read the actor''s current assignment.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ledger.receipts.read', 'Read receipts', 'Read tenant receipt records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ledger.receipts.create', 'Create receipts', 'Create tenant receipt records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ledger.receipts.print', 'Print receipts', 'Mark tenant receipts as printed.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ledger.receipts.return', 'Return receipts', 'Record signed and returned tenant receipts.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ledger.receipts.backfill', 'Backfill receipts', 'Backfill missing tenant receipt obligations.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ledger.receipts.self.read', 'Read own receipts', 'Read the actor''s own receipt records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ledger.corrections.create', 'Create ledger corrections', 'Create tenant ledger correction records.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('journey.settlements.preview', 'Preview journey settlements', 'Preview tenant journey settlements.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('journey.settlements.zero_gold', 'Zero Gold settlement', 'Post tenant Zero Gold settlements.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('journey.settlements.partial_payout', 'Partial payout settlement', 'Post tenant partial payout settlements.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('journey.settlements.close', 'Close journey', 'Close tenant journeys.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at) VALUES
('authz-role-application-admin', '*', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', '*', CURRENT_TIMESTAMP),
('authz-role-earnings-operator', 'collaborators.read', CURRENT_TIMESTAMP),
('authz-role-earnings-operator', 'planning.read', CURRENT_TIMESTAMP),
('authz-role-earnings-operator', 'planning.create', CURRENT_TIMESTAMP),
('authz-role-earnings-operator', 'planning.update', CURRENT_TIMESTAMP),
('authz-role-earnings-operator', 'earnings.read', CURRENT_TIMESTAMP),
('authz-role-earnings-operator', 'earnings.create', CURRENT_TIMESTAMP),
('authz-role-earnings-operator', 'current_accounts.summary.read', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'collaborators.read', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'price_lists.read', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'price_lists.create', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'price_lists.update', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'current_accounts.summary.read', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'expenses.read', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'expenses.create', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'ledger.receipts.read', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'ledger.receipts.create', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'ledger.receipts.print', CURRENT_TIMESTAMP),
('authz-role-expense-operator', 'ledger.receipts.return', CURRENT_TIMESTAMP),
('authz-role-person', 'people.self.read', CURRENT_TIMESTAMP),
('authz-role-person', 'people.self.update', CURRENT_TIMESTAMP),
('authz-role-person', 'collaborators.self.read', CURRENT_TIMESTAMP),
('authz-role-person', 'current_accounts.self.summary.read', CURRENT_TIMESTAMP),
('authz-role-person', 'current_accounts.self.ledger.read', CURRENT_TIMESTAMP),
('authz-role-person', 'assignments.self.current.read', CURRENT_TIMESTAMP),
('authz-role-person', 'ledger.receipts.self.read', CURRENT_TIMESTAMP);

PRAGMA foreign_keys = ON;
