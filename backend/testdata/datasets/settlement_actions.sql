-- ERS resettable test dataset: settlement actions
-- Purpose: provide stable collaborators for manual and E2E testing of
-- Zero Gold, Partial Payout, and Close Journey sensitive correction forms.
--
-- This dataset is intended for disposable local/dev/test databases only.
-- It assumes migrations have already been applied.

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- Keep the second-person approval policy disabled for this base dataset so
-- reason-code/reason-text tests can focus on Bite 20B behavior.
INSERT INTO tenant_settings (
  id, tenant_id, key, value, description, updated_by, created_at, updated_at
) VALUES (
  'ers-testdata-setting-second-person-approval',
  'default',
  'current_accounts.require_second_person_approval_for_sensitive_operations',
  'false',
  'Test-data default: second-person approval disabled unless a test enables it.',
  'testdata@ers.local',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(tenant_id, key) DO UPDATE SET
  value = excluded.value,
  description = excluded.description,
  updated_by = excluded.updated_by,
  updated_at = CURRENT_TIMESTAMP;


-- Reference data normally created by application bootstrap. The reset script runs
-- migrations first, then this dataset, so include the workflow references that
-- tests need even when the API has not bootstrapped the database yet.
INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
) VALUES
  ('ref-collaborator-status-active', 'default', 'collaborator_status', 'ACTIVE', 'Active', 'Active collaborator journey', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ref-collaborator-status-finished', 'default', 'collaborator_status', 'FINISHED', 'Finished', 'Finished collaborator journey', 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ref-method-daily', 'default', 'method', 'DAILY', 'Daily wage', 'Paid by daily wage', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ref-sector-mining', 'default', 'sector', 'MINING', 'Mining', 'Mining operations', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ref-location-main-mine', 'default', 'location', 'MAIN_MINE', 'Main Mine', 'Default mine location', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ref-task-miner', 'default', 'task', 'MINER', 'Miner', 'Mining collaborator task', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Authorization actors that can be selected through the development Authz UI.
INSERT OR IGNORE INTO authz_actors (
  id, actor_key, display_name, active, created_at, updated_at
) VALUES
  ('ers-testdata-actor-tenant-admin', 'tenant-admin@test.ers', 'Test Tenant Admin', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ers-testdata-actor-expense-operator', 'expense-operator@test.ers', 'Test Expense Operator', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ers-testdata-actor-second-approver', 'second-approver@test.ers', 'Test Second Approver', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO authz_actor_role_grants (
  id, actor_id, role_id, tenant_id, active, created_at, updated_at
) VALUES
  ('ers-testdata-grant-tenant-admin', 'ers-testdata-actor-tenant-admin', 'authz-role-tenant-admin', 'default', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ers-testdata-grant-expense-operator', 'ers-testdata-actor-expense-operator', 'authz-role-expense-operator', 'default', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- People and active collaborator journeys.
INSERT OR IGNORE INTO people (
  id, tenant_id, first_name, last_name, nickname, cpf, rg, cellular, email,
  country, pix_key, profile_completion_status, can_create_collaborator,
  status_id, notes, created_at, updated_at
) VALUES
  (
    'ers-testdata-person-zero-gold', 'default', 'Zelia', 'Gold', 'Zelia Gold',
    '52998224725', 'TG-ZERO-001', '11987654321', 'zelia.gold@test.ers',
    'Brasil', 'zelia.gold@test.ers', 'COMPLETE', 1,
    'ref-person-status-active', 'Test data: collaborator with positive gold balance for Zero Gold.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ers-testdata-person-partial-payout', 'default', 'Paulo', 'Payout', 'Paulo Payout',
    '39053344705', 'TG-PAYOUT-001', '11987654322', 'paulo.payout@test.ers',
    'Brasil', 'paulo.payout@test.ers', 'COMPLETE', 1,
    'ref-person-status-active', 'Test data: collaborator with BRL and gold balances for Partial Payout.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ers-testdata-person-close-journey', 'default', 'Clara', 'Close', 'Clara Close',
    '11144477735', 'TG-CLOSE-001', '11987654323', 'clara.close@test.ers',
    'Brasil', 'clara.close@test.ers', 'COMPLETE', 1,
    'ref-person-status-active', 'Test data: collaborator with no blockers for Close Journey.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT OR IGNORE INTO collaborator_journeys (
  id, tenant_id, person_id, journey_start_date, default_end_date, extension_days,
  projected_end_date, payment_method_id, payment_value, daily_brl_amount,
  sector_id, location_id, task_id, status_id, notes, created_at, updated_at
) VALUES
  (
    'ers-testdata-collab-zero-gold', 'default', 'ers-testdata-person-zero-gold',
    '2026-04-01', '2026-06-30', 0, '2026-06-30',
    'ref-method-commission', 0, 0,
    'ref-sector-mining', 'ref-location-main-mine', 'ref-task-miner', 'ref-collaborator-status-active',
    'Test data: use Zero Gold. Gold balance starts at 8.500 grams.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ers-testdata-collab-partial-payout', 'default', 'ers-testdata-person-partial-payout',
    '2026-04-01', '2026-06-30', 0, '2026-06-30',
    'ref-method-daily', 350, 350,
    'ref-sector-mining', 'ref-location-main-mine', 'ref-task-miner', 'ref-collaborator-status-active',
    'Test data: use Partial Payout. BRL balance starts at 1250.00 and gold balance at 2.750 grams.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ers-testdata-collab-close-journey', 'default', 'ers-testdata-person-close-journey',
    '2026-03-01', '2026-05-30', 0, '2026-05-30',
    'ref-method-daily', 300, 300,
    'ref-sector-mining', 'ref-location-main-mine', 'ref-task-miner', 'ref-collaborator-status-active',
    'Test data: use Close Journey. No pending accruals and no negative balances.',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

-- Positive current-account balances.  These are credits only, so receipt
-- lifecycle rules for debits are not triggered during dataset load.
INSERT OR IGNORE INTO ledger_entries (
  id, tenant_id, collaborator_id, value_unit_id, entry_type, direction, amount,
  effective_date, source_type, source_id, description, active, correction_type,
  created_at, updated_at
) VALUES
  (
    'ers-testdata-ledger-zero-gold-credit', 'default', 'ers-testdata-collab-zero-gold',
    'ref-value-unit-gold-gram', 'EARNING_CREDIT', 'CREDIT', 8.500,
    '2026-06-15', 'TEST_DATA', 'ers-testdata-source-zero-gold-credit',
    'Seeded gold earning credit for Zero Gold testing.', 1, 'ORIGINAL',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ers-testdata-ledger-partial-payout-brl-credit', 'default', 'ers-testdata-collab-partial-payout',
    'ref-value-unit-brl', 'EARNING_CREDIT', 'CREDIT', 1250.00,
    '2026-06-15', 'TEST_DATA', 'ers-testdata-source-partial-payout-brl-credit',
    'Seeded BRL earning credit for Partial Payout testing.', 1, 'ORIGINAL',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ers-testdata-ledger-partial-payout-gold-credit', 'default', 'ers-testdata-collab-partial-payout',
    'ref-value-unit-gold-gram', 'EARNING_CREDIT', 'CREDIT', 2.750,
    '2026-06-15', 'TEST_DATA', 'ers-testdata-source-partial-payout-gold-credit',
    'Seeded gold earning credit for Partial Payout testing.', 1, 'ORIGINAL',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ers-testdata-ledger-close-journey-brl-credit', 'default', 'ers-testdata-collab-close-journey',
    'ref-value-unit-brl', 'EARNING_CREDIT', 'CREDIT', 600.00,
    '2026-06-15', 'TEST_DATA', 'ers-testdata-source-close-journey-brl-credit',
    'Seeded BRL earning credit for Close Journey testing.', 1, 'ORIGINAL',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'ers-testdata-ledger-close-journey-gold-credit', 'default', 'ers-testdata-collab-close-journey',
    'ref-value-unit-gold-gram', 'EARNING_CREDIT', 'CREDIT', 1.250,
    '2026-06-15', 'TEST_DATA', 'ers-testdata-source-close-journey-gold-credit',
    'Seeded gold earning credit for Close Journey testing.', 1, 'ORIGINAL',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

COMMIT;
