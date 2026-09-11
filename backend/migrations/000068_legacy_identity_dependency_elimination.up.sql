-- Bite 30K.3A makes canonical identity the only writable/runtime identity while
-- deliberately preserving the legacy columns and data for one final release.
-- Bite 30K.3B will physically remove those structures after this bridge has
-- proven that no current writer or runtime path depends on them.
PRAGMA foreign_keys = ON;

-- Fail before relaxing legacy constraints if canonical foundations are
-- incomplete. 30K.3A is not allowed to synthesize identity from legacy fields.
CREATE TEMP TABLE bite30k3a_guard (id INTEGER);
CREATE TEMP TRIGGER bite30k3a_verify_canonical_foundation
BEFORE INSERT ON bite30k3a_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM auth_user_accounts a
  WHERE NOT EXISTS (
    SELECT 1 FROM auth_account_actors aa WHERE aa.account_id = a.id
  )
)
OR EXISTS (
  SELECT 1
  FROM auth_account_actors aa
  WHERE aa.scope_type = 'TENANT'
    AND (
      aa.tenant_id IS NULL OR TRIM(aa.tenant_id) = ''
      OR aa.membership_id IS NULL OR TRIM(aa.membership_id) = ''
      OR NOT EXISTS (
        SELECT 1
        FROM person_tenant_memberships m
        JOIN auth_account_people ap
          ON ap.account_id = aa.account_id
         AND ap.person_id = m.person_id
        WHERE m.id = aa.membership_id
          AND m.tenant_id = aa.tenant_id
      )
    )
)
OR EXISTS (
  SELECT 1
  FROM auth_account_actors aa
  WHERE aa.scope_type = 'GLOBAL'
    AND (aa.tenant_id IS NOT NULL OR aa.membership_id IS NOT NULL)
)
OR EXISTS (
  SELECT 1
  FROM auth_account_actors global_binding
  JOIN auth_account_people ap
    ON ap.account_id = global_binding.account_id
  WHERE global_binding.scope_type = 'GLOBAL'
)
OR EXISTS (
  SELECT 1
  FROM auth_account_actors global_binding
  JOIN auth_account_actors tenant_binding
    ON tenant_binding.account_id = global_binding.account_id
   AND tenant_binding.scope_type = 'TENANT'
  WHERE global_binding.scope_type = 'GLOBAL'
)
OR EXISTS (
  SELECT 1
  FROM collaborator_journeys c
  WHERE c.membership_id IS NULL OR TRIM(c.membership_id) = ''
    OR NOT EXISTS (
      SELECT 1
      FROM person_tenant_memberships m
      WHERE m.id = c.membership_id
        AND m.tenant_id = c.tenant_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'legacy_identity_dependency_elimination_canonical_foundation_incomplete');
END;
INSERT INTO bite30k3a_guard(id) VALUES (1);
DROP TRIGGER bite30k3a_verify_canonical_foundation;
DROP TABLE bite30k3a_guard;

-- Rebuild the two tables whose legacy compatibility columns are still NOT
-- NULL. Existing values are retained exactly, but future canonical writers can
-- and must leave the compatibility values NULL.
PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

ALTER TABLE auth_user_accounts RENAME TO auth_user_accounts_legacy_30k3a;

CREATE TABLE auth_user_accounts (
  id TEXT PRIMARY KEY,
  actor_id TEXT NULL,
  login TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (LENGTH(TRIM(login)) BETWEEN 1 AND 254),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
  last_login_at DATETIME,
  password_changed_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  security_suspended INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (actor_id) REFERENCES authz_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

INSERT INTO auth_user_accounts (
  id, actor_id, login, password_hash, active, must_change_password,
  last_login_at, password_changed_at, created_at, updated_at, security_suspended
)
SELECT
  id, actor_id, login, password_hash, active, must_change_password,
  last_login_at, password_changed_at, created_at, updated_at, security_suspended
FROM auth_user_accounts_legacy_30k3a;

DROP TABLE auth_user_accounts_legacy_30k3a;

CREATE INDEX idx_auth_user_accounts_active ON auth_user_accounts(active);
CREATE INDEX idx_auth_user_accounts_security_suspended ON auth_user_accounts(security_suspended);

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

-- Historical actor_id values are retained but canonical writers must never
-- create or mutate them after this migration.
CREATE TRIGGER trg_auth_user_accounts_legacy_actor_insert_prohibited
BEFORE INSERT ON auth_user_accounts
WHEN NEW.actor_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'legacy_authentication_actor_write_prohibited');
END;

CREATE TRIGGER trg_auth_user_accounts_legacy_actor_update_prohibited
BEFORE UPDATE OF actor_id ON auth_user_accounts
WHEN COALESCE(NEW.actor_id, '') <> COALESCE(OLD.actor_id, '')
BEGIN
  SELECT RAISE(ABORT, 'legacy_authentication_actor_write_prohibited');
END;

ALTER TABLE collaborator_journeys RENAME TO collaborator_journeys_legacy_30k3a;

CREATE TABLE collaborator_journeys (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  person_id TEXT NULL,
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
  FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (membership_id) REFERENCES person_tenant_memberships(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (payment_method_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (sector_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (task_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (status_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

INSERT INTO collaborator_journeys (
  id, created_at, updated_at, tenant_id, person_id,
  journey_start_date, default_end_date, extension_days, projected_end_date,
  payment_method_id, payment_value, sector_id, location_id, task_id, status_id,
  notes, closed_at, fixed_monthly_brl_amount, daily_brl_amount,
  gold_commission_percent, time_off_gold_split_percent,
  sick_day_off_replacement_gold_grams, planning_availability, membership_id
)
SELECT
  id, created_at, updated_at, tenant_id, person_id,
  journey_start_date, default_end_date, extension_days, projected_end_date,
  payment_method_id, payment_value, sector_id, location_id, task_id, status_id,
  notes, closed_at, fixed_monthly_brl_amount, daily_brl_amount,
  gold_commission_percent, time_off_gold_split_percent,
  sick_day_off_replacement_gold_grams, planning_availability, membership_id
FROM collaborator_journeys_legacy_30k3a;

DROP TABLE collaborator_journeys_legacy_30k3a;

CREATE INDEX idx_collaborator_journeys_tenant_id ON collaborator_journeys(tenant_id);
CREATE INDEX idx_collaborator_journeys_projected_end_date ON collaborator_journeys(projected_end_date);
CREATE INDEX idx_collaborator_journeys_payment_method_id ON collaborator_journeys(payment_method_id);
CREATE INDEX idx_collaborator_journeys_sector_id ON collaborator_journeys(sector_id);
CREATE INDEX idx_collaborator_journeys_location_id ON collaborator_journeys(location_id);
CREATE INDEX idx_collaborator_journeys_task_id ON collaborator_journeys(task_id);
CREATE INDEX idx_collaborator_journeys_status_id ON collaborator_journeys(status_id);
CREATE INDEX idx_collaborator_journeys_membership_id ON collaborator_journeys(membership_id);
CREATE INDEX idx_collaborator_journeys_tenant_membership_closed ON collaborator_journeys(tenant_id, membership_id, closed_at);
CREATE INDEX idx_collaborator_journeys_tenant_open_created
ON collaborator_journeys(tenant_id, created_at DESC, journey_start_date DESC)
WHERE closed_at IS NULL;

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

CREATE TRIGGER trg_collaborator_membership_required_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NEW.membership_id IS NULL OR TRIM(NEW.membership_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_required');
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

CREATE TRIGGER trg_collaborator_membership_identity_immutable
BEFORE UPDATE OF tenant_id, membership_id ON collaborator_journeys
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
  OR COALESCE(NEW.membership_id, '') <> COALESCE(OLD.membership_id, '')
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_identity_immutable');
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

CREATE TRIGGER trg_collaborator_journeys_legacy_person_insert_prohibited
BEFORE INSERT ON collaborator_journeys
WHEN NEW.person_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'legacy_collaborator_person_write_prohibited');
END;

CREATE TRIGGER trg_collaborator_journeys_legacy_person_update_prohibited
BEFORE UPDATE OF person_id ON collaborator_journeys
WHEN COALESCE(NEW.person_id, '') <> COALESCE(OLD.person_id, '')
BEGIN
  SELECT RAISE(ABORT, 'legacy_collaborator_person_write_prohibited');
END;

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;

-- The remaining legacy identity columns stay physically present for 30K.3B,
-- but 30K.3A prevents any new identity from being written to them. Remove
-- active constraints whose only purpose was legacy primary/projection behavior.
DROP INDEX IF EXISTS ux_auth_account_actors_account_primary;
DROP TRIGGER IF EXISTS trg_person_membership_legacy_projection_insert;
DROP TRIGGER IF EXISTS trg_person_membership_legacy_projection_update;

CREATE TRIGGER IF NOT EXISTS trg_auth_account_actors_legacy_primary_insert_prohibited
BEFORE INSERT ON auth_account_actors
WHEN NEW.is_primary <> 0
BEGIN
  SELECT RAISE(ABORT, 'legacy_primary_actor_write_prohibited');
END;
CREATE TRIGGER IF NOT EXISTS trg_auth_account_actors_legacy_primary_update_prohibited
BEFORE UPDATE OF is_primary ON auth_account_actors
WHEN NEW.is_primary <> OLD.is_primary
BEGIN
  SELECT RAISE(ABORT, 'legacy_primary_actor_write_prohibited');
END;

CREATE TRIGGER IF NOT EXISTS trg_authz_actors_legacy_identity_insert_prohibited
BEFORE INSERT ON authz_actors
WHEN NEW.person_id IS NOT NULL OR NEW.collaborator_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'legacy_actor_identity_write_prohibited');
END;
CREATE TRIGGER IF NOT EXISTS trg_authz_actors_legacy_identity_update_prohibited
BEFORE UPDATE OF person_id, collaborator_id ON authz_actors
WHEN COALESCE(NEW.person_id, '') <> COALESCE(OLD.person_id, '')
  OR COALESCE(NEW.collaborator_id, '') <> COALESCE(OLD.collaborator_id, '')
BEGIN
  SELECT RAISE(ABORT, 'legacy_actor_identity_write_prohibited');
END;

CREATE TRIGGER IF NOT EXISTS trg_person_membership_legacy_projection_insert_prohibited
BEFORE INSERT ON person_tenant_memberships
WHEN NEW.legacy_person_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'legacy_membership_person_write_prohibited');
END;
CREATE TRIGGER IF NOT EXISTS trg_person_membership_legacy_projection_update_prohibited
BEFORE UPDATE OF legacy_person_id ON person_tenant_memberships
WHEN COALESCE(NEW.legacy_person_id, '') <> COALESCE(OLD.legacy_person_id, '')
BEGIN
  SELECT RAISE(ABORT, 'legacy_membership_person_write_prohibited');
END;
