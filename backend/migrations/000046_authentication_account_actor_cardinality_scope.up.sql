PRAGMA foreign_keys = ON;

-- Bite 30C makes Account -> Actor ownership explicit and one-to-many while
-- retaining auth_user_accounts.actor_id as a temporary compatibility/default
-- pointer until the later session/tenant-selection and legacy-removal bites.
CREATE TABLE IF NOT EXISTS auth_account_people (
  account_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (account_id) REFERENCES auth_user_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (person_id) REFERENCES global_people(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS auth_account_actors (
  account_id TEXT NOT NULL,
  actor_id TEXT NOT NULL UNIQUE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('GLOBAL', 'TENANT')),
  tenant_id TEXT NULL,
  membership_id TEXT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_account_actors_account_tenant
  ON auth_account_actors(account_id, tenant_id)
  WHERE scope_type = 'TENANT';
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_account_actors_account_global
  ON auth_account_actors(account_id)
  WHERE scope_type = 'GLOBAL';
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_account_actors_account_primary
  ON auth_account_actors(account_id)
  WHERE is_primary = 1;
CREATE INDEX IF NOT EXISTS idx_auth_account_actors_tenant
  ON auth_account_actors(tenant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_auth_account_actors_membership
  ON auth_account_actors(membership_id);

-- Global Actors and ordinary Person Accounts are mutually exclusive.
CREATE TRIGGER IF NOT EXISTS trg_auth_account_people_no_global_actor_insert
BEFORE INSERT ON auth_account_people
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM auth_account_actors aa
  WHERE aa.account_id = NEW.account_id AND aa.scope_type = 'GLOBAL'
)
BEGIN
  SELECT RAISE(ABORT, 'authentication_global_actor_cannot_have_person');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_account_actor_global_no_person_insert
BEFORE INSERT ON auth_account_actors
FOR EACH ROW
WHEN NEW.scope_type = 'GLOBAL' AND EXISTS (
  SELECT 1 FROM auth_account_people ap WHERE ap.account_id = NEW.account_id
)
BEGIN
  SELECT RAISE(ABORT, 'authentication_global_actor_cannot_have_person');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_account_actor_global_no_tenant_actor_insert
BEFORE INSERT ON auth_account_actors
FOR EACH ROW
WHEN NEW.scope_type = 'GLOBAL' AND EXISTS (
  SELECT 1 FROM auth_account_actors aa
  WHERE aa.account_id = NEW.account_id AND aa.scope_type = 'TENANT'
)
BEGIN
  SELECT RAISE(ABORT, 'authentication_global_account_cannot_have_tenant_actor');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_account_actor_tenant_no_global_actor_insert
BEFORE INSERT ON auth_account_actors
FOR EACH ROW
WHEN NEW.scope_type = 'TENANT' AND EXISTS (
  SELECT 1 FROM auth_account_actors aa
  WHERE aa.account_id = NEW.account_id AND aa.scope_type = 'GLOBAL'
)
BEGIN
  SELECT RAISE(ABORT, 'authentication_global_account_cannot_have_tenant_actor');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_account_actor_tenant_person_insert
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

CREATE TRIGGER IF NOT EXISTS trg_auth_account_actor_identity_immutable
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

-- Backfill ordinary Account -> Person identity from the Bite 30B legacy
-- projection. Application Administrator accounts are deliberately excluded.
INSERT OR IGNORE INTO auth_account_people (account_id, person_id, created_at, updated_at)
SELECT
  a.id,
  m.person_id,
  a.created_at,
  CURRENT_TIMESTAMP
FROM auth_user_accounts a
JOIN authz_actors az ON az.id = a.actor_id
JOIN person_tenant_memberships m ON m.legacy_person_id = az.person_id
WHERE NOT EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN authz_roles r ON r.id = g.role_id
  WHERE g.actor_id = az.id
    AND g.tenant_id = '*'
    AND r.code = 'APPLICATION_ADMIN'
);

-- Existing Application Administrators become explicit global Actor bindings.
INSERT OR IGNORE INTO auth_account_actors (
  account_id, actor_id, scope_type, tenant_id, membership_id, is_primary, created_at, updated_at
)
SELECT
  a.id,
  a.actor_id,
  'GLOBAL',
  NULL,
  NULL,
  1,
  a.created_at,
  CURRENT_TIMESTAMP
FROM auth_user_accounts a
WHERE EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN authz_roles r ON r.id = g.role_id
  WHERE g.actor_id = a.actor_id
    AND g.tenant_id = '*'
    AND r.code = 'APPLICATION_ADMIN'
);

-- Backfill the ordinary one-tenant case immediately. The idempotent runtime
-- foundation repair handles historical multi-tenant Actors by splitting them
-- into one Actor per Person-Tenant Membership without changing the Account.
INSERT OR IGNORE INTO auth_account_actors (
  account_id, actor_id, scope_type, tenant_id, membership_id, is_primary, created_at, updated_at
)
SELECT
  a.id,
  a.actor_id,
  'TENANT',
  m.tenant_id,
  m.id,
  1,
  a.created_at,
  CURRENT_TIMESTAMP
FROM auth_user_accounts a
JOIN authz_actors az ON az.id = a.actor_id
JOIN person_tenant_memberships m ON m.legacy_person_id = az.person_id
WHERE EXISTS (SELECT 1 FROM auth_account_people ap WHERE ap.account_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM auth_account_actors aa WHERE aa.account_id = a.id);
