-- Bite 30K.3B physically removes the identity compatibility schema made
-- inert by 30K.3A. The migration fails closed unless the canonical identity
-- graph is complete enough to make the retired storage disposable.
--
-- The migration records its own schema_migrations marker inside the same
-- transaction as the destructive DDL. Runners use INSERT OR IGNORE after a
-- successful file execution, so schema and migration history commit atomically.
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TEMP TABLE bite30k3b_guard (id INTEGER);
CREATE TEMP TRIGGER bite30k3b_verify_canonical_foundation
BEFORE INSERT ON bite30k3b_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM auth_user_accounts a
  WHERE NOT EXISTS (SELECT 1 FROM auth_account_actors aa WHERE aa.account_id = a.id)
)
OR EXISTS (
  SELECT 1 FROM auth_account_actors aa
  WHERE aa.scope_type = 'TENANT'
    AND (
      aa.tenant_id IS NULL OR TRIM(aa.tenant_id) = ''
      OR aa.membership_id IS NULL OR TRIM(aa.membership_id) = ''
      OR NOT EXISTS (
        SELECT 1
        FROM person_tenant_memberships m
        JOIN auth_account_people ap
          ON ap.account_id = aa.account_id AND ap.person_id = m.person_id
        WHERE m.id = aa.membership_id AND m.tenant_id = aa.tenant_id
      )
    )
)
OR EXISTS (
  SELECT 1 FROM auth_account_actors aa
  WHERE aa.scope_type = 'GLOBAL'
    AND (aa.tenant_id IS NOT NULL OR aa.membership_id IS NOT NULL)
)
OR EXISTS (
  SELECT 1
  FROM auth_account_actors aa
  JOIN auth_account_people ap ON ap.account_id = aa.account_id
  WHERE aa.scope_type = 'GLOBAL'
)
OR EXISTS (
  SELECT 1
  FROM auth_account_actors g
  JOIN auth_account_actors t ON t.account_id = g.account_id AND t.scope_type = 'TENANT'
  WHERE g.scope_type = 'GLOBAL'
)
OR EXISTS (
  SELECT 1 FROM collaborator_journeys c
  WHERE c.membership_id IS NULL OR TRIM(c.membership_id) = ''
     OR NOT EXISTS (
       SELECT 1 FROM person_tenant_memberships m
       WHERE m.id = c.membership_id AND m.tenant_id = c.tenant_id
     )
)
OR EXISTS (
  SELECT 1 FROM people p
  WHERE NOT EXISTS (
    SELECT 1
    FROM person_tenant_memberships m
    JOIN global_people gp ON gp.id = m.person_id
    WHERE m.legacy_person_id = p.id AND m.tenant_id = p.tenant_id
  )
)
OR EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN authz_roles r ON r.id = g.role_id
  WHERE r.code = 'PERSON' OR r.scope_type = 'SELF'
)
BEGIN
  SELECT RAISE(ABORT, 'physical_legacy_identity_removal_canonical_foundation_incomplete');
END;
INSERT INTO bite30k3b_guard(id) VALUES (1);
DROP TRIGGER bite30k3b_verify_canonical_foundation;
DROP TABLE bite30k3b_guard;

-- PERSON/SELF authorization became intrinsic in Bite 30D. No grant row may be
-- deleted here; the guard above requires an explicit archival decision first if
-- historical grant rows still reference this obsolete catalog state.
DELETE FROM authz_role_permissions
WHERE role_id IN (SELECT id FROM authz_roles WHERE code = 'PERSON' OR scope_type = 'SELF');
DELETE FROM authz_roles
WHERE code = 'PERSON' OR scope_type = 'SELF';

-- SQLite reparses trigger bodies during table replacement. Remove every trigger
-- that is owned by or queries one of the identity tables, then restore the
-- non-legacy guards after all replacement tables have their final names.
DROP TRIGGER IF EXISTS trg_accrual_financial_owner_consistency_insert;
DROP TRIGGER IF EXISTS trg_accrual_items_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_accrual_items_same_tenant_update;
DROP TRIGGER IF EXISTS trg_auth_account_actor_global_no_person_insert;
DROP TRIGGER IF EXISTS trg_auth_account_actor_global_no_tenant_actor_insert;
DROP TRIGGER IF EXISTS trg_auth_account_actor_identity_immutable;
DROP TRIGGER IF EXISTS trg_auth_account_actor_tenant_no_global_actor_insert;
DROP TRIGGER IF EXISTS trg_auth_account_actor_tenant_person_insert;
DROP TRIGGER IF EXISTS trg_auth_account_actors_legacy_primary_insert_prohibited;
DROP TRIGGER IF EXISTS trg_auth_account_actors_legacy_primary_update_prohibited;
DROP TRIGGER IF EXISTS trg_auth_account_people_no_global_actor_insert;
DROP TRIGGER IF EXISTS trg_auth_user_accounts_delete_prohibited;
DROP TRIGGER IF EXISTS trg_auth_user_accounts_legacy_actor_insert_prohibited;
DROP TRIGGER IF EXISTS trg_auth_user_accounts_legacy_actor_update_prohibited;
DROP TRIGGER IF EXISTS trg_auth_user_accounts_login_normalized_insert;
DROP TRIGGER IF EXISTS trg_auth_user_accounts_login_normalized_update;
DROP TRIGGER IF EXISTS trg_auth_user_accounts_password_hash_required_insert;
DROP TRIGGER IF EXISTS trg_auth_user_accounts_password_hash_required_update;
DROP TRIGGER IF EXISTS trg_authz_actors_legacy_identity_insert_prohibited;
DROP TRIGGER IF EXISTS trg_authz_actors_legacy_identity_update_prohibited;
DROP TRIGGER IF EXISTS trg_authz_grants_actor_scope_insert;
DROP TRIGGER IF EXISTS trg_authz_grants_actor_scope_update;
DROP TRIGGER IF EXISTS trg_collaborator_journey_zero_balance_close;
DROP TRIGGER IF EXISTS trg_collaborator_journeys_legacy_person_insert_prohibited;
DROP TRIGGER IF EXISTS trg_collaborator_journeys_legacy_person_update_prohibited;
DROP TRIGGER IF EXISTS trg_collaborator_journeys_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_collaborator_journeys_same_tenant_update;
DROP TRIGGER IF EXISTS trg_collaborator_journeys_tenant_exists_insert;
DROP TRIGGER IF EXISTS trg_collaborator_journeys_tenant_immutable;
DROP TRIGGER IF EXISTS trg_collaborator_membership_active_insert;
DROP TRIGGER IF EXISTS trg_collaborator_membership_consistency_insert;
DROP TRIGGER IF EXISTS trg_collaborator_membership_identity_immutable;
DROP TRIGGER IF EXISTS trg_collaborator_membership_protect_history_delete;
DROP TRIGGER IF EXISTS trg_collaborator_membership_required_insert;
DROP TRIGGER IF EXISTS trg_collaborator_membership_single_open_journey_insert;
DROP TRIGGER IF EXISTS trg_collaborator_membership_single_open_journey_update;
DROP TRIGGER IF EXISTS trg_expense_financial_owner_consistency_insert;
DROP TRIGGER IF EXISTS trg_expense_financial_owner_consistency_update;
DROP TRIGGER IF EXISTS trg_expenses_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_expenses_same_tenant_update;
DROP TRIGGER IF EXISTS trg_journey_settlements_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_journey_settlements_same_tenant_update;
DROP TRIGGER IF EXISTS trg_ledger_entries_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_ledger_entries_same_tenant_update;
DROP TRIGGER IF EXISTS trg_ledger_financial_owner_consistency_insert;
DROP TRIGGER IF EXISTS trg_ledger_receipts_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_ledger_receipts_same_tenant_update;
DROP TRIGGER IF EXISTS trg_people_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_people_same_tenant_update;
DROP TRIGGER IF EXISTS trg_people_search_index_delete;
DROP TRIGGER IF EXISTS trg_people_search_index_insert;
DROP TRIGGER IF EXISTS trg_people_search_index_update;
DROP TRIGGER IF EXISTS trg_global_person_search_index_update;
DROP TRIGGER IF EXISTS trg_people_tenant_exists_insert;
DROP TRIGGER IF EXISTS trg_people_tenant_immutable;
DROP TRIGGER IF EXISTS trg_person_membership_identity_immutable;
DROP TRIGGER IF EXISTS trg_person_membership_legacy_projection_insert_prohibited;
DROP TRIGGER IF EXISTS trg_person_membership_legacy_projection_update_prohibited;
DROP TRIGGER IF EXISTS trg_person_membership_tenant_status_insert;
DROP TRIGGER IF EXISTS trg_person_membership_tenant_status_update;
DROP TRIGGER IF EXISTS trg_support_access_lease_approval_tenant_administrator;
DROP TRIGGER IF EXISTS trg_support_access_lease_permission_allowlist;
DROP TRIGGER IF EXISTS trg_support_access_lease_request_global_application_actor;
DROP TRIGGER IF EXISTS trg_support_access_lease_termination_tenant_administrator;
DROP TRIGGER IF EXISTS trg_tenant_admin_distinct_person_insert;
DROP TRIGGER IF EXISTS trg_tenant_admin_distinct_person_update;
DROP TRIGGER IF EXISTS trg_tenant_admin_global_person_insert;
DROP TRIGGER IF EXISTS trg_tenant_admin_global_person_update;
DROP TRIGGER IF EXISTS trg_tenant_admin_person_cross_tenant_insert;
DROP TRIGGER IF EXISTS trg_tenant_admin_person_cross_tenant_update;
DROP TRIGGER IF EXISTS trg_work_period_assignments_same_tenant_insert;
DROP TRIGGER IF EXISTS trg_work_period_assignments_same_tenant_update;

-- Rebuild auth_user_accounts without its retired identity column(s).
CREATE TABLE auth_user_accounts_30k3b_new (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (LENGTH(TRIM(login)) BETWEEN 1 AND 254),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  last_login_at DATETIME,
  password_changed_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  security_suspended INTEGER NOT NULL DEFAULT 0
);
INSERT INTO auth_user_accounts_30k3b_new (id, login, password_hash, active, must_change_password, last_login_at, password_changed_at, created_at, updated_at, security_suspended)
SELECT id, login, password_hash, active, must_change_password, last_login_at, password_changed_at, created_at, updated_at, security_suspended
FROM auth_user_accounts;
DROP TABLE auth_user_accounts;
ALTER TABLE auth_user_accounts_30k3b_new RENAME TO auth_user_accounts;
CREATE INDEX idx_auth_user_accounts_active ON auth_user_accounts(active);
CREATE INDEX idx_auth_user_accounts_security_suspended ON auth_user_accounts(security_suspended);

-- Rebuild auth_account_actors without its retired identity column(s).
CREATE TABLE auth_account_actors_30k3b_new (
  account_id TEXT NOT NULL,
  actor_id TEXT NOT NULL UNIQUE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL', 'TENANT')),
  tenant_id TEXT NULL,
  membership_id TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (account_id, actor_id),
  FOREIGN KEY (account_id) REFERENCES auth_user_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (actor_id) REFERENCES authz_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (membership_id) REFERENCES person_tenant_memberships(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (scope_type = 'GLOBAL' AND tenant_id IS NULL AND membership_id IS NULL) OR
    (scope_type = 'TENANT' AND tenant_id IS NOT NULL)
  )
);
INSERT INTO auth_account_actors_30k3b_new (account_id, actor_id, scope_type, tenant_id, membership_id, created_at, updated_at)
SELECT account_id, actor_id, scope_type, tenant_id, membership_id, created_at, updated_at
FROM auth_account_actors;
DROP TABLE auth_account_actors;
ALTER TABLE auth_account_actors_30k3b_new RENAME TO auth_account_actors;
CREATE INDEX idx_auth_account_actors_membership
  ON auth_account_actors(membership_id);
CREATE INDEX idx_auth_account_actors_tenant
  ON auth_account_actors(tenant_id, account_id);
CREATE UNIQUE INDEX ux_auth_account_actors_account_global
  ON auth_account_actors(account_id)
  WHERE scope_type = 'GLOBAL';
CREATE UNIQUE INDEX ux_auth_account_actors_account_tenant
  ON auth_account_actors(account_id, tenant_id)
  WHERE scope_type = 'TENANT';

-- Rebuild authz_actors without its retired identity column(s).
CREATE TABLE authz_actors_30k3b_new (
  id TEXT PRIMARY KEY,
  actor_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
INSERT INTO authz_actors_30k3b_new (id, actor_key, display_name, active, created_at, updated_at)
SELECT id, actor_key, display_name, active, created_at, updated_at
FROM authz_actors;
DROP TABLE authz_actors;
ALTER TABLE authz_actors_30k3b_new RENAME TO authz_actors;
CREATE INDEX idx_authz_actors_active ON authz_actors(active);

-- Rebuild person_tenant_memberships without its retired identity column(s).
CREATE TABLE person_tenant_memberships_30k3b_new (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  status_id TEXT NOT NULL,
  notes TEXT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (person_id) REFERENCES global_people(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (status_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO person_tenant_memberships_30k3b_new (id, created_at, updated_at, tenant_id, person_id, status_id, notes)
SELECT id, created_at, updated_at, tenant_id, person_id, status_id, notes
FROM person_tenant_memberships;
DROP TABLE person_tenant_memberships;
ALTER TABLE person_tenant_memberships_30k3b_new RENAME TO person_tenant_memberships;
CREATE INDEX idx_person_tenant_memberships_person
ON person_tenant_memberships(person_id);
CREATE INDEX idx_person_tenant_memberships_status
ON person_tenant_memberships(tenant_id, status_id);
CREATE INDEX idx_person_tenant_memberships_tenant
ON person_tenant_memberships(tenant_id);
CREATE UNIQUE INDEX ux_person_tenant_membership
ON person_tenant_memberships(person_id, tenant_id);

-- Rebuild collaborator_journeys without its retired identity column(s).
CREATE TABLE collaborator_journeys_30k3b_new (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  journey_start_date DATE NOT NULL,
  default_end_date DATE NOT NULL,
  extension_days INTEGER NOT NULL DEFAULT 0,
  projected_end_date DATE NOT NULL,
  payment_method_id TEXT NOT NULL,
  payment_value REAL NOT NULL,
  sector_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status_id TEXT NOT NULL,
  notes TEXT NULL,
  closed_at DATETIME NULL,
  fixed_monthly_brl_amount REAL NULL,
  daily_brl_amount REAL NULL,
  gold_commission_percent REAL NULL,
  time_off_gold_split_percent REAL NULL,
  sick_day_off_replacement_gold_grams REAL NULL,
  planning_availability TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (planning_availability IN ('ACTIVE', 'DAY_OFF', 'LEAVE_OF_ABSENCE')),
  membership_id TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (membership_id) REFERENCES person_tenant_memberships(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (payment_method_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (sector_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (task_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (status_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
INSERT INTO collaborator_journeys_30k3b_new (id, created_at, updated_at, tenant_id, journey_start_date, default_end_date, extension_days, projected_end_date, payment_method_id, payment_value, sector_id, location_id, task_id, status_id, notes, closed_at, fixed_monthly_brl_amount, daily_brl_amount, gold_commission_percent, time_off_gold_split_percent, sick_day_off_replacement_gold_grams, planning_availability, membership_id)
SELECT id, created_at, updated_at, tenant_id, journey_start_date, default_end_date, extension_days, projected_end_date, payment_method_id, payment_value, sector_id, location_id, task_id, status_id, notes, closed_at, fixed_monthly_brl_amount, daily_brl_amount, gold_commission_percent, time_off_gold_split_percent, sick_day_off_replacement_gold_grams, planning_availability, membership_id
FROM collaborator_journeys;
DROP TABLE collaborator_journeys;
ALTER TABLE collaborator_journeys_30k3b_new RENAME TO collaborator_journeys;
CREATE INDEX idx_collaborator_journeys_location_id ON collaborator_journeys(location_id);
CREATE INDEX idx_collaborator_journeys_membership_id ON collaborator_journeys(membership_id);
CREATE INDEX idx_collaborator_journeys_payment_method_id ON collaborator_journeys(payment_method_id);
CREATE INDEX idx_collaborator_journeys_projected_end_date ON collaborator_journeys(projected_end_date);
CREATE INDEX idx_collaborator_journeys_sector_id ON collaborator_journeys(sector_id);
CREATE INDEX idx_collaborator_journeys_status_id ON collaborator_journeys(status_id);
CREATE INDEX idx_collaborator_journeys_task_id ON collaborator_journeys(task_id);
CREATE INDEX idx_collaborator_journeys_tenant_id ON collaborator_journeys(tenant_id);
CREATE INDEX idx_collaborator_journeys_tenant_membership_closed ON collaborator_journeys(tenant_id, membership_id, closed_at);
CREATE INDEX idx_collaborator_journeys_tenant_open_created
ON collaborator_journeys(tenant_id, created_at DESC, journey_start_date DESC)
WHERE closed_at IS NULL;

-- Replace the old tenant-local search projection with the canonical Membership
-- -> Global Person projection before dropping the legacy Person table.
DROP TABLE IF EXISTS people_search_index;
CREATE TABLE people_search_index (
  membership_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  search_text TEXT NOT NULL,
  FOREIGN KEY (membership_id) REFERENCES person_tenant_memberships(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES global_people(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_people_search_index_tenant ON people_search_index (tenant_id, membership_id);
CREATE INDEX idx_people_search_index_person ON people_search_index (person_id, tenant_id);
INSERT INTO people_search_index (membership_id, person_id, tenant_id, search_text)
SELECT m.id, m.person_id, m.tenant_id,
       LOWER(COALESCE(gp.first_name, '')) || char(31) ||
       LOWER(COALESCE(gp.last_name, '')) || char(31) ||
       LOWER(COALESCE(gp.nickname, '')) || char(31) ||
       LOWER(TRIM(COALESCE(gp.first_name, '') || ' ' || COALESCE(gp.last_name, '')))
FROM person_tenant_memberships m
JOIN global_people gp ON gp.id = m.person_id;

DROP TABLE people;

-- Restore current integrity/authorization triggers. Legacy write-prohibition
-- triggers and triggers owned by the removed people table intentionally stay gone.
CREATE TRIGGER trg_accrual_financial_owner_consistency_insert
BEFORE INSERT ON accrual_items
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM collaborator_journeys c
  JOIN person_tenant_memberships m
    ON m.id = c.membership_id
   AND m.tenant_id = c.tenant_id
  WHERE c.id = NEW.collaborator_id
    AND c.tenant_id = NEW.tenant_id
    AND m.person_id = NEW.person_id
)
BEGIN
  SELECT RAISE(ABORT, 'accrual_item_person_tenant_journey_mismatch');
END;
CREATE TRIGGER trg_accrual_items_same_tenant_insert
BEFORE INSERT ON accrual_items
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM accrual_runs a WHERE a.id = NEW.accrual_run_id AND a.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR (NEW.work_period_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_period_assignments a WHERE a.id = NEW.work_period_assignment_id AND a.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_accrual_items_same_tenant_update
BEFORE UPDATE ON accrual_items
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM accrual_runs a WHERE a.id = NEW.accrual_run_id AND a.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR (NEW.work_period_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_period_assignments a WHERE a.id = NEW.work_period_assignment_id AND a.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_auth_account_actor_global_no_person_insert
BEFORE INSERT ON auth_account_actors
FOR EACH ROW
WHEN NEW.scope_type = 'GLOBAL' AND EXISTS (
  SELECT 1 FROM auth_account_people ap WHERE ap.account_id = NEW.account_id
)
BEGIN
  SELECT RAISE(ABORT, 'authentication_global_actor_cannot_have_person');
END;
CREATE TRIGGER trg_auth_account_actor_global_no_tenant_actor_insert
BEFORE INSERT ON auth_account_actors
FOR EACH ROW
WHEN NEW.scope_type = 'GLOBAL' AND EXISTS (
  SELECT 1 FROM auth_account_actors aa
  WHERE aa.account_id = NEW.account_id AND aa.scope_type = 'TENANT'
)
BEGIN
  SELECT RAISE(ABORT, 'authentication_global_account_cannot_have_tenant_actor');
END;
CREATE TRIGGER trg_auth_account_actor_identity_immutable
BEFORE UPDATE OF account_id, actor_id, scope_type, tenant_id, membership_id ON auth_account_actors
FOR EACH ROW
WHEN NEW.account_id <> OLD.account_id
  OR NEW.actor_id <> OLD.actor_id
  OR NEW.scope_type <> OLD.scope_type
  OR COALESCE(NEW.tenant_id, '') <> COALESCE(OLD.tenant_id, '')
  OR COALESCE(NEW.membership_id, '') <> COALESCE(OLD.membership_id, '')
BEGIN
  SELECT RAISE(ABORT, 'authentication_account_actor_identity_immutable');
END;
CREATE TRIGGER trg_auth_account_actor_tenant_no_global_actor_insert
BEFORE INSERT ON auth_account_actors
FOR EACH ROW
WHEN NEW.scope_type = 'TENANT' AND EXISTS (
  SELECT 1 FROM auth_account_actors aa
  WHERE aa.account_id = NEW.account_id AND aa.scope_type = 'GLOBAL'
)
BEGIN
  SELECT RAISE(ABORT, 'authentication_global_account_cannot_have_tenant_actor');
END;
CREATE TRIGGER trg_auth_account_actor_tenant_person_insert
BEFORE INSERT ON auth_account_actors
FOR EACH ROW
WHEN NEW.scope_type = 'TENANT' AND NEW.membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM person_tenant_memberships m
    JOIN auth_account_people ap ON ap.account_id = NEW.account_id
    WHERE m.id = NEW.membership_id
      AND m.tenant_id = NEW.tenant_id
      AND m.person_id = ap.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'authentication_tenant_actor_person_mismatch');
END;
CREATE TRIGGER trg_auth_account_people_no_global_actor_insert
BEFORE INSERT ON auth_account_people
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM auth_account_actors aa
  WHERE aa.account_id = NEW.account_id AND aa.scope_type = 'GLOBAL'
)
BEGIN
  SELECT RAISE(ABORT, 'authentication_global_actor_cannot_have_person');
END;
CREATE TRIGGER trg_auth_user_accounts_delete_prohibited
BEFORE DELETE ON auth_user_accounts
BEGIN
  SELECT RAISE(ABORT, 'authentication_account_deletion_not_allowed');
END;
CREATE TRIGGER trg_auth_user_accounts_login_normalized_insert
BEFORE INSERT ON auth_user_accounts
WHEN NEW.login COLLATE BINARY <> LOWER(TRIM(NEW.login)) COLLATE BINARY OR TRIM(NEW.login) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_login_must_be_normalized');
END;
CREATE TRIGGER trg_auth_user_accounts_login_normalized_update
BEFORE UPDATE OF login ON auth_user_accounts
WHEN NEW.login COLLATE BINARY <> LOWER(TRIM(NEW.login)) COLLATE BINARY OR TRIM(NEW.login) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_login_must_be_normalized');
END;
CREATE TRIGGER trg_auth_user_accounts_password_hash_required_insert
BEFORE INSERT ON auth_user_accounts
WHEN TRIM(NEW.password_hash) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_password_hash_required');
END;
CREATE TRIGGER trg_auth_user_accounts_password_hash_required_update
BEFORE UPDATE OF password_hash ON auth_user_accounts
WHEN TRIM(NEW.password_hash) = ''
BEGIN
  SELECT RAISE(ABORT, 'authentication_password_hash_required');
END;
CREATE TRIGGER trg_authz_grants_actor_scope_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.active = 1 AND (
  EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND (r.scope_type = 'SELF' OR r.code = 'PERSON')
  )
  OR EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND r.scope_type = 'TENANT'
      AND NOT EXISTS (
        SELECT 1 FROM auth_account_actors aa
        WHERE aa.actor_id = NEW.actor_id
          AND aa.scope_type = 'TENANT'
          AND aa.tenant_id = NEW.tenant_id
      )
  )
  OR EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND r.scope_type = 'APPLICATION'
      AND EXISTS (
        SELECT 1 FROM auth_account_actors aa
        WHERE aa.actor_id = NEW.actor_id
          AND aa.scope_type = 'TENANT'
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'authorization_actor_scope_invalid');
END;
CREATE TRIGGER trg_authz_grants_actor_scope_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.active = 1 AND (
  EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND (r.scope_type = 'SELF' OR r.code = 'PERSON')
  )
  OR EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND r.scope_type = 'TENANT'
      AND NOT EXISTS (
        SELECT 1 FROM auth_account_actors aa
        WHERE aa.actor_id = NEW.actor_id
          AND aa.scope_type = 'TENANT'
          AND aa.tenant_id = NEW.tenant_id
      )
  )
  OR EXISTS (
    SELECT 1 FROM authz_roles r
    WHERE r.id = NEW.role_id
      AND r.scope_type = 'APPLICATION'
      AND EXISTS (
        SELECT 1 FROM auth_account_actors aa
        WHERE aa.actor_id = NEW.actor_id
          AND aa.scope_type = 'TENANT'
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'authorization_actor_scope_invalid');
END;
CREATE TRIGGER trg_collaborator_journey_zero_balance_close
BEFORE UPDATE OF status_id, closed_at ON collaborator_journeys
FOR EACH ROW
WHEN (
  (NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL)
  OR (
    NEW.status_id <> OLD.status_id
    AND EXISTS (
      SELECT 1 FROM reference_data status
      WHERE status.id = NEW.status_id
        AND status.tenant_id = NEW.tenant_id
        AND status.type = 'collaborator_status'
        AND status.code = 'FINISHED'
    )
  )
)
AND EXISTS (
  SELECT 1 FROM ledger_entries le
  WHERE le.tenant_id = NEW.tenant_id
    AND le.collaborator_id = NEW.id
    AND le.active = 1
  GROUP BY le.value_unit_id
  HAVING ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.000000001
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_journey_non_zero_balance');
END;
CREATE TRIGGER trg_collaborator_journeys_same_tenant_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1 FROM person_tenant_memberships m
    WHERE m.id = NEW.membership_id AND m.tenant_id = NEW.tenant_id
  )
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.payment_method_id AND r.tenant_id = NEW.tenant_id AND r.type = 'method')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.sector_id AND r.tenant_id = NEW.tenant_id AND r.type = 'sector')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.task_id AND r.tenant_id = NEW.tenant_id AND r.type = 'task')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.status_id AND r.tenant_id = NEW.tenant_id AND r.type = 'collaborator_status')
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_collaborator_journeys_same_tenant_update
BEFORE UPDATE ON collaborator_journeys
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1 FROM person_tenant_memberships m
    WHERE m.id = NEW.membership_id AND m.tenant_id = NEW.tenant_id
  )
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.payment_method_id AND r.tenant_id = NEW.tenant_id AND r.type = 'method')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.sector_id AND r.tenant_id = NEW.tenant_id AND r.type = 'sector')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.task_id AND r.tenant_id = NEW.tenant_id AND r.type = 'task')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.status_id AND r.tenant_id = NEW.tenant_id AND r.type = 'collaborator_status')
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_collaborator_journeys_tenant_exists_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;
CREATE TRIGGER trg_collaborator_journeys_tenant_immutable
BEFORE UPDATE OF tenant_id ON collaborator_journeys
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;
CREATE TRIGGER trg_collaborator_membership_active_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM person_tenant_memberships m
  JOIN reference_data s
    ON s.id = m.status_id
   AND s.tenant_id = m.tenant_id
   AND s.type = 'person_status'
   AND s.code = 'ACTIVE'
   AND s.active = 1
  WHERE m.id = NEW.membership_id
    AND m.tenant_id = NEW.tenant_id
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_inactive');
END;
CREATE TRIGGER trg_collaborator_membership_consistency_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM person_tenant_memberships m
  WHERE m.id = NEW.membership_id AND m.tenant_id = NEW.tenant_id
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_invalid');
END;
CREATE TRIGGER trg_collaborator_membership_identity_immutable
BEFORE UPDATE OF tenant_id, membership_id ON collaborator_journeys
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
  OR COALESCE(NEW.membership_id, '') <> COALESCE(OLD.membership_id, '')
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_identity_immutable');
END;
CREATE TRIGGER trg_collaborator_membership_protect_history_delete
BEFORE DELETE ON person_tenant_memberships
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM collaborator_journeys c WHERE c.membership_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_history_protected');
END;
CREATE TRIGGER trg_collaborator_membership_required_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NEW.membership_id IS NULL OR TRIM(NEW.membership_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_required');
END;
CREATE TRIGGER trg_collaborator_membership_single_open_journey_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NEW.closed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM collaborator_journeys c
    WHERE c.membership_id = NEW.membership_id
      AND c.tenant_id = NEW.tenant_id
      AND c.closed_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_open_journey_exists');
END;
CREATE TRIGGER trg_collaborator_membership_single_open_journey_update
BEFORE UPDATE OF closed_at ON collaborator_journeys
FOR EACH ROW
WHEN NEW.closed_at IS NULL
  AND OLD.closed_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM collaborator_journeys c
    WHERE c.id <> NEW.id
      AND c.membership_id = NEW.membership_id
      AND c.tenant_id = NEW.tenant_id
      AND c.closed_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_open_journey_exists');
END;
CREATE TRIGGER trg_expense_financial_owner_consistency_insert
BEFORE INSERT ON expenses
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM collaborator_journeys c
  JOIN person_tenant_memberships m
    ON m.id = c.membership_id
   AND m.tenant_id = c.tenant_id
  WHERE c.id = NEW.collaborator_id
    AND c.tenant_id = NEW.tenant_id
    AND m.person_id = NEW.person_id
)
BEGIN
  SELECT RAISE(ABORT, 'expense_person_tenant_journey_mismatch');
END;
CREATE TRIGGER trg_expense_financial_owner_consistency_update
BEFORE UPDATE OF tenant_id, person_id, collaborator_id ON expenses
FOR EACH ROW
WHEN NEW.person_id IS NULL OR TRIM(NEW.person_id) = ''
  OR NOT EXISTS (
    SELECT 1
    FROM collaborator_journeys c
    JOIN person_tenant_memberships m
      ON m.id = c.membership_id
     AND m.tenant_id = c.tenant_id
    WHERE c.id = NEW.collaborator_id
      AND c.tenant_id = NEW.tenant_id
      AND m.person_id = NEW.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'expense_person_tenant_journey_mismatch');
END;
CREATE TRIGGER trg_expenses_same_tenant_insert
BEFORE INSERT ON expenses
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.expense_category_id AND r.tenant_id = NEW.tenant_id AND r.type = 'expense_category')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.price_list_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expense_price_list_items p WHERE p.id = NEW.price_list_item_id AND p.tenant_id = NEW.tenant_id))
  OR (NEW.gold_price_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gold_prices g WHERE g.id = NEW.gold_price_id AND g.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_expenses_same_tenant_update
BEFORE UPDATE ON expenses
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.expense_category_id AND r.tenant_id = NEW.tenant_id AND r.type = 'expense_category')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.price_list_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expense_price_list_items p WHERE p.id = NEW.price_list_item_id AND p.tenant_id = NEW.tenant_id))
  OR (NEW.gold_price_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gold_prices g WHERE g.id = NEW.gold_price_id AND g.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_journey_settlements_same_tenant_insert
BEFORE INSERT ON journey_settlements
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_journey_settlements_same_tenant_update
BEFORE UPDATE ON journey_settlements
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_ledger_entries_same_tenant_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.related_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.related_entry_id AND l.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_ledger_entries_same_tenant_update
BEFORE UPDATE ON ledger_entries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.related_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.related_entry_id AND l.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_ledger_financial_owner_consistency_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM collaborator_journeys c
  JOIN person_tenant_memberships m
    ON m.id = c.membership_id
   AND m.tenant_id = c.tenant_id
  WHERE c.id = NEW.collaborator_id
    AND c.tenant_id = NEW.tenant_id
    AND m.person_id = NEW.person_id
)
BEGIN
  SELECT RAISE(ABORT, 'ledger_entry_person_tenant_journey_mismatch');
END;
CREATE TRIGGER trg_ledger_receipts_same_tenant_insert
BEFORE INSERT ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.ledger_entry_id AND l.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_ledger_receipts_same_tenant_update
BEFORE UPDATE ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.ledger_entry_id AND l.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_person_membership_identity_immutable
BEFORE UPDATE OF tenant_id, person_id ON person_tenant_memberships
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id OR NEW.person_id <> OLD.person_id
BEGIN
  SELECT RAISE(ABORT, 'person_membership_identity_immutable');
END;
CREATE TRIGGER trg_person_membership_tenant_status_insert
BEFORE INSERT ON person_tenant_memberships
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM reference_data r
  WHERE r.id = NEW.status_id
    AND r.tenant_id = NEW.tenant_id
    AND r.type = 'person_status'
    AND r.active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'person_membership_status_invalid');
END;
CREATE TRIGGER trg_person_membership_tenant_status_update
BEFORE UPDATE OF tenant_id, status_id ON person_tenant_memberships
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM reference_data r
  WHERE r.id = NEW.status_id
    AND r.tenant_id = NEW.tenant_id
    AND r.type = 'person_status'
    AND r.active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'person_membership_status_invalid');
END;
CREATE TRIGGER trg_support_access_lease_approval_tenant_administrator
BEFORE UPDATE OF status ON tenant_support_access_leases
FOR EACH ROW
WHEN OLD.status = 'PENDING' AND NEW.status = 'APPROVED'
  AND (
    NEW.approved_at IS NULL
    OR NEW.approved_by_actor_id IS NULL
    OR julianday(NEW.expires_at) <= julianday(CURRENT_TIMESTAMP)
    OR NOT EXISTS (
      SELECT 1
      FROM tenant_support_access_lease_permissions p
      WHERE p.lease_id = NEW.id
    )
    OR NOT EXISTS (
      SELECT 1
      FROM authz_actor_role_grants g
      JOIN authz_roles r
        ON r.id = g.role_id
       AND r.code = 'TENANT_ADMIN'
       AND r.scope_type = 'TENANT'
       AND r.active = 1
      JOIN auth_account_actors aa
        ON aa.actor_id = g.actor_id
       AND aa.scope_type = 'TENANT'
       AND aa.tenant_id = g.tenant_id
      JOIN person_tenant_memberships m
        ON m.id = aa.membership_id
       AND m.tenant_id = aa.tenant_id
      JOIN reference_data status
        ON status.id = m.status_id
       AND status.tenant_id = m.tenant_id
       AND status.type = 'person_status'
       AND status.code = 'ACTIVE'
       AND status.active = 1
      WHERE g.actor_id = NEW.approved_by_actor_id
        AND g.tenant_id = NEW.tenant_id
        AND g.active = 1
        AND g.lifecycle_suspended = 0
        AND m.person_id IS NOT NULL
        AND TRIM(m.person_id) <> ''
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_tenant_administrator_required');
END;
CREATE TRIGGER trg_support_access_lease_permission_allowlist
BEFORE INSERT ON tenant_support_access_lease_permissions
FOR EACH ROW
WHEN NEW.permission_code NOT IN (
  'people.read', 'people.create', 'people.update',
  'collaborators.read', 'collaborators.create', 'collaborators.update', 'collaborators.work_assignment.update',
  'planning.read', 'planning.create', 'planning.update',
  'earnings.read', 'earnings.create', 'earnings.update',
  'price_lists.read', 'price_lists.create', 'price_lists.update',
  'gold_prices.manage', 'gold_production.manage',
  'reference_data.read', 'reference_data.manage',
  'expenses.read', 'expenses.create', 'expenses.update',
  'current_accounts.summary.read', 'current_accounts.ledger.read', 'current_accounts.ledger.create',
  'current_accounts.settings.read', 'current_accounts.settings.update',
  'ledger.receipts.read', 'ledger.receipts.create', 'ledger.receipts.print', 'ledger.receipts.return',
  'ledger.receipts.backfill', 'ledger.receipts.tenant.accept',
  'ledger.corrections.create',
  'journey.settlements.preview', 'journey.settlements.zero_gold', 'journey.settlements.partial_payout',
  'journey.settlements.final_tenant_payment', 'journey.settlements.final_collaborator_payment', 'journey.settlements.close'
)
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_permission_not_allowed');
END;
CREATE TRIGGER trg_support_access_lease_request_global_application_actor
BEFORE INSERT ON tenant_support_access_leases
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN authz_roles r
    ON r.id = g.role_id
   AND r.code = 'APPLICATION_ADMIN'
   AND r.scope_type = 'APPLICATION'
   AND r.active = 1
  JOIN authz_actors a
    ON a.id = g.actor_id
   AND a.active = 1
  JOIN auth_account_actors aa
    ON aa.actor_id = a.id
   AND aa.scope_type = 'GLOBAL'
  WHERE g.actor_id = NEW.application_actor_id
    AND g.tenant_id = '*'
    AND g.active = 1
    AND g.lifecycle_suspended = 0
    AND NEW.requested_by_actor_id = NEW.application_actor_id
)
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_application_administrator_required');
END;
CREATE TRIGGER trg_support_access_lease_termination_tenant_administrator
BEFORE UPDATE OF status ON tenant_support_access_leases
FOR EACH ROW
WHEN OLD.status = 'APPROVED' AND NEW.status = 'TERMINATED'
  AND (
    NEW.terminated_at IS NULL
    OR NEW.terminated_by_actor_id IS NULL
    OR julianday(NEW.expires_at) <= julianday(CURRENT_TIMESTAMP)
    OR NOT EXISTS (
      SELECT 1
      FROM authz_actor_role_grants g
      JOIN authz_roles r
        ON r.id = g.role_id
       AND r.code = 'TENANT_ADMIN'
       AND r.scope_type = 'TENANT'
       AND r.active = 1
      JOIN auth_account_actors aa
        ON aa.actor_id = g.actor_id
       AND aa.scope_type = 'TENANT'
       AND aa.tenant_id = g.tenant_id
      JOIN person_tenant_memberships m
        ON m.id = aa.membership_id
       AND m.tenant_id = aa.tenant_id
      JOIN reference_data status
        ON status.id = m.status_id
       AND status.tenant_id = m.tenant_id
       AND status.type = 'person_status'
       AND status.code = 'ACTIVE'
       AND status.active = 1
      WHERE g.actor_id = NEW.terminated_by_actor_id
        AND g.tenant_id = NEW.tenant_id
        AND g.active = 1
        AND g.lifecycle_suspended = 0
        AND m.person_id IS NOT NULL
        AND TRIM(m.person_id) <> ''
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_tenant_administrator_required');
END;
CREATE TRIGGER trg_tenant_admin_distinct_person_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.role_id = 'authz-role-tenant-admin'
     AND existing_g.active = 1
     AND existing_g.tenant_id = NEW.tenant_id
    JOIN auth_account_actors existing_aa
      ON existing_aa.actor_id = existing_g.actor_id
     AND existing_aa.scope_type = 'TENANT'
     AND existing_aa.tenant_id = existing_g.tenant_id
    JOIN person_tenant_memberships existing_m
      ON existing_m.id = existing_aa.membership_id
     AND existing_m.tenant_id = existing_aa.tenant_id
    WHERE new_aa.actor_id = NEW.actor_id
      AND new_aa.scope_type = 'TENANT'
      AND new_aa.tenant_id = NEW.tenant_id
      AND existing_m.person_id = new_m.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_distinct_person_required');
END;
CREATE TRIGGER trg_tenant_admin_distinct_person_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.role_id = 'authz-role-tenant-admin'
     AND existing_g.active = 1
     AND existing_g.tenant_id = NEW.tenant_id
     AND existing_g.id <> OLD.id
    JOIN auth_account_actors existing_aa
      ON existing_aa.actor_id = existing_g.actor_id
     AND existing_aa.scope_type = 'TENANT'
     AND existing_aa.tenant_id = existing_g.tenant_id
    JOIN person_tenant_memberships existing_m
      ON existing_m.id = existing_aa.membership_id
     AND existing_m.tenant_id = existing_aa.tenant_id
    WHERE new_aa.actor_id = NEW.actor_id
      AND new_aa.scope_type = 'TENANT'
      AND new_aa.tenant_id = NEW.tenant_id
      AND existing_m.person_id = new_m.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_distinct_person_required');
END;
CREATE TRIGGER trg_tenant_admin_global_person_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM auth_account_actors aa
    JOIN person_tenant_memberships m
      ON m.id = aa.membership_id
     AND m.tenant_id = aa.tenant_id
    WHERE aa.actor_id = NEW.actor_id
      AND aa.scope_type = 'TENANT'
      AND aa.tenant_id = NEW.tenant_id
      AND m.person_id IS NOT NULL
      AND TRIM(m.person_id) <> ''
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_global_person_required');
END;
CREATE TRIGGER trg_tenant_admin_global_person_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM auth_account_actors aa
    JOIN person_tenant_memberships m
      ON m.id = aa.membership_id
     AND m.tenant_id = aa.tenant_id
    WHERE aa.actor_id = NEW.actor_id
      AND aa.scope_type = 'TENANT'
      AND aa.tenant_id = NEW.tenant_id
      AND m.person_id IS NOT NULL
      AND TRIM(m.person_id) <> ''
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_global_person_required');
END;
CREATE TRIGGER trg_tenant_admin_person_cross_tenant_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.role_id = 'authz-role-tenant-admin'
     AND existing_g.active = 1
     AND existing_g.tenant_id <> NEW.tenant_id
    JOIN auth_account_actors existing_aa
      ON existing_aa.actor_id = existing_g.actor_id
     AND existing_aa.scope_type = 'TENANT'
     AND existing_aa.tenant_id = existing_g.tenant_id
    JOIN person_tenant_memberships existing_m
      ON existing_m.id = existing_aa.membership_id
     AND existing_m.tenant_id = existing_aa.tenant_id
    WHERE new_aa.actor_id = NEW.actor_id
      AND new_aa.scope_type = 'TENANT'
      AND new_aa.tenant_id = NEW.tenant_id
      AND existing_m.person_id = new_m.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_person_cross_tenant');
END;
CREATE TRIGGER trg_tenant_admin_person_cross_tenant_update
BEFORE UPDATE OF actor_id, role_id, tenant_id, active ON authz_actor_role_grants
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-tenant-admin'
  AND NEW.active = 1
  AND EXISTS (
    SELECT 1
    FROM auth_account_actors new_aa
    JOIN person_tenant_memberships new_m
      ON new_m.id = new_aa.membership_id
     AND new_m.tenant_id = new_aa.tenant_id
    JOIN authz_actor_role_grants existing_g
      ON existing_g.role_id = 'authz-role-tenant-admin'
     AND existing_g.active = 1
     AND existing_g.tenant_id <> NEW.tenant_id
     AND existing_g.id <> OLD.id
    JOIN auth_account_actors existing_aa
      ON existing_aa.actor_id = existing_g.actor_id
     AND existing_aa.scope_type = 'TENANT'
     AND existing_aa.tenant_id = existing_g.tenant_id
    JOIN person_tenant_memberships existing_m
      ON existing_m.id = existing_aa.membership_id
     AND existing_m.tenant_id = existing_aa.tenant_id
    WHERE new_aa.actor_id = NEW.actor_id
      AND new_aa.scope_type = 'TENANT'
      AND new_aa.tenant_id = NEW.tenant_id
      AND existing_m.person_id = new_m.person_id
  )
BEGIN
  SELECT RAISE(ABORT, 'tenant_administrator_person_cross_tenant');
END;
CREATE TRIGGER trg_work_period_assignments_same_tenant_insert
BEFORE INSERT ON work_period_assignments
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.sector_id AND r.tenant_id = NEW.tenant_id AND r.type = 'sector')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.task_id AND r.tenant_id = NEW.tenant_id AND r.type = 'task')
  OR (NEW.replacement_for_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_period_assignments a WHERE a.id = NEW.replacement_for_assignment_id AND a.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
CREATE TRIGGER trg_work_period_assignments_same_tenant_update
BEFORE UPDATE ON work_period_assignments
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.sector_id AND r.tenant_id = NEW.tenant_id AND r.type = 'sector')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.task_id AND r.tenant_id = NEW.tenant_id AND r.type = 'task')
  OR (NEW.replacement_for_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_period_assignments a WHERE a.id = NEW.replacement_for_assignment_id AND a.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER trg_person_membership_search_index_insert
AFTER INSERT ON person_tenant_memberships
BEGIN
  INSERT INTO people_search_index (membership_id, person_id, tenant_id, search_text)
  SELECT NEW.id, NEW.person_id, NEW.tenant_id,
         LOWER(COALESCE(gp.first_name, '')) || char(31) ||
         LOWER(COALESCE(gp.last_name, '')) || char(31) ||
         LOWER(COALESCE(gp.nickname, '')) || char(31) ||
         LOWER(TRIM(COALESCE(gp.first_name, '') || ' ' || COALESCE(gp.last_name, '')))
  FROM global_people gp WHERE gp.id = NEW.person_id
  ON CONFLICT(membership_id) DO UPDATE SET
    person_id = excluded.person_id,
    tenant_id = excluded.tenant_id,
    search_text = excluded.search_text;
END;

CREATE TRIGGER trg_person_membership_search_index_update
AFTER UPDATE OF person_id, tenant_id ON person_tenant_memberships
BEGIN
  INSERT INTO people_search_index (membership_id, person_id, tenant_id, search_text)
  SELECT NEW.id, NEW.person_id, NEW.tenant_id,
         LOWER(COALESCE(gp.first_name, '')) || char(31) ||
         LOWER(COALESCE(gp.last_name, '')) || char(31) ||
         LOWER(COALESCE(gp.nickname, '')) || char(31) ||
         LOWER(TRIM(COALESCE(gp.first_name, '') || ' ' || COALESCE(gp.last_name, '')))
  FROM global_people gp WHERE gp.id = NEW.person_id
  ON CONFLICT(membership_id) DO UPDATE SET
    person_id = excluded.person_id,
    tenant_id = excluded.tenant_id,
    search_text = excluded.search_text;
END;

CREATE TRIGGER trg_person_membership_search_index_delete
AFTER DELETE ON person_tenant_memberships
BEGIN
  DELETE FROM people_search_index WHERE membership_id = OLD.id;
END;

CREATE TRIGGER trg_global_person_search_index_update
AFTER UPDATE OF first_name, last_name, nickname ON global_people
BEGIN
  UPDATE people_search_index
  SET search_text = LOWER(COALESCE(NEW.first_name, '')) || char(31) ||
                    LOWER(COALESCE(NEW.last_name, '')) || char(31) ||
                    LOWER(COALESCE(NEW.nickname, '')) || char(31) ||
                    LOWER(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')))
  WHERE person_id = NEW.id;
END;

CREATE TEMP TABLE bite30k3b_post_guard (id INTEGER);
CREATE TEMP TRIGGER bite30k3b_verify_physical_removal
BEFORE INSERT ON bite30k3b_post_guard
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM pragma_table_info('auth_user_accounts') WHERE name = 'actor_id')
OR EXISTS (SELECT 1 FROM pragma_table_info('auth_account_actors') WHERE name = 'is_primary')
OR EXISTS (SELECT 1 FROM pragma_table_info('authz_actors') WHERE name IN ('person_id', 'collaborator_id'))
OR EXISTS (SELECT 1 FROM pragma_table_info('person_tenant_memberships') WHERE name = 'legacy_person_id')
OR EXISTS (SELECT 1 FROM pragma_table_info('collaborator_journeys') WHERE name = 'person_id')
OR NOT EXISTS (SELECT 1 FROM pragma_table_info('collaborator_journeys') WHERE name = 'membership_id' AND [notnull] = 1)
OR EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'people')
OR EXISTS (SELECT 1 FROM authz_roles WHERE code = 'PERSON' OR scope_type = 'SELF')
OR NOT EXISTS (SELECT 1 FROM pragma_table_info('people_search_index') WHERE name = 'membership_id')
BEGIN
  SELECT RAISE(ABORT, 'physical_legacy_identity_removal_verification_failed');
END;
INSERT INTO bite30k3b_post_guard(id) VALUES (1);
DROP TRIGGER bite30k3b_verify_physical_removal;
DROP TABLE bite30k3b_post_guard;

INSERT OR IGNORE INTO schema_migrations(filename)
VALUES ('000069_physical_legacy_identity_schema_removal.up.sql');

COMMIT;
PRAGMA foreign_keys = ON;
