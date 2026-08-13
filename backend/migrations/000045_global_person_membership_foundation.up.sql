PRAGMA foreign_keys = ON;

-- Bite 30B introduces the authoritative global Person identity while retaining
-- the existing tenant-owned people rows as compatibility projections for the
-- later 30C-30G cutovers. No existing business foreign key is rewritten here.
CREATE TABLE IF NOT EXISTS global_people (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  nickname TEXT NOT NULL,
  cpf TEXT NOT NULL,
  rg TEXT NOT NULL,
  cellular TEXT NOT NULL,
  email TEXT NOT NULL,
  street1 TEXT NULL,
  street2 TEXT NULL,
  state TEXT NULL,
  cep TEXT NULL,
  city TEXT NULL,
  country TEXT NOT NULL DEFAULT 'Brasil',
  bank_name TEXT NULL,
  bank_number TEXT NULL,
  checking_account TEXT NULL,
  pix_key TEXT NULL,
  emergency_name TEXT NULL,
  emergency_cellular TEXT NULL,
  emergency_email TEXT NULL,
  profile_completion_status TEXT NOT NULL DEFAULT 'PERSONAL_ONLY',
  can_create_collaborator INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

-- CPF is the authoritative legal identity key used to collapse any historical
-- tenant-local duplicates into one global Person during this additive stage.
CREATE UNIQUE INDEX IF NOT EXISTS ux_global_people_cpf ON global_people(cpf);
CREATE INDEX IF NOT EXISTS idx_global_people_rg ON global_people(rg);
CREATE INDEX IF NOT EXISTS idx_global_people_cellular ON global_people(cellular);
CREATE INDEX IF NOT EXISTS idx_global_people_email ON global_people(email);
CREATE INDEX IF NOT EXISTS idx_global_people_pix_key ON global_people(pix_key) WHERE pix_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_global_people_name ON global_people(last_name, first_name, nickname);

-- Select one deterministic canonical row for each CPF, preferring the most
-- recently updated identity data. Existing tenant-local rows remain untouched
-- so no downstream foreign key changes occur in this bite.
INSERT OR IGNORE INTO global_people (
  id, first_name, last_name, nickname, cpf, rg, cellular, email,
  street1, street2, state, cep, city, country,
  bank_name, bank_number, checking_account, pix_key,
  emergency_name, emergency_cellular, emergency_email,
  profile_completion_status, can_create_collaborator,
  created_at, updated_at
)
SELECT
  p.id, p.first_name, p.last_name, p.nickname, p.cpf, p.rg, p.cellular, p.email,
  p.street1, p.street2, p.state, p.cep, p.city, p.country,
  p.bank_name, p.bank_number, p.checking_account, p.pix_key,
  p.emergency_name, p.emergency_cellular, p.emergency_email,
  p.profile_completion_status, p.can_create_collaborator,
  p.created_at, p.updated_at
FROM people p
WHERE p.id = (
  SELECT p2.id
  FROM people p2
  WHERE p2.cpf = p.cpf
  ORDER BY p2.updated_at DESC, p2.created_at ASC, p2.id ASC
  LIMIT 1
);

CREATE TABLE IF NOT EXISTS person_tenant_memberships (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  status_id TEXT NOT NULL,
  notes TEXT NULL,
  legacy_person_id TEXT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (person_id) REFERENCES global_people(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (status_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (legacy_person_id) REFERENCES people(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_person_tenant_membership
ON person_tenant_memberships(person_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_person_tenant_membership_legacy_person
ON person_tenant_memberships(legacy_person_id)
WHERE legacy_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_person_tenant_memberships_tenant
ON person_tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_person_tenant_memberships_person
ON person_tenant_memberships(person_id);
CREATE INDEX IF NOT EXISTS idx_person_tenant_memberships_status
ON person_tenant_memberships(tenant_id, status_id);

-- Every existing tenant-owned Person becomes a Membership of the canonical
-- global Person selected above. The legacy row is retained as a compatibility
-- projection until later Bite 30 cutovers remove that requirement.
INSERT OR IGNORE INTO person_tenant_memberships (
  id, created_at, updated_at, tenant_id, person_id, status_id, notes, legacy_person_id
)
SELECT
  'person-membership-' || p.id,
  p.created_at,
  p.updated_at,
  p.tenant_id,
  gp.id,
  p.status_id,
  p.notes,
  p.id
FROM people p
JOIN global_people gp ON gp.cpf = p.cpf;

CREATE TRIGGER IF NOT EXISTS trg_person_membership_tenant_status_insert
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

CREATE TRIGGER IF NOT EXISTS trg_person_membership_tenant_status_update
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

CREATE TRIGGER IF NOT EXISTS trg_person_membership_identity_immutable
BEFORE UPDATE OF tenant_id, person_id ON person_tenant_memberships
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id OR NEW.person_id <> OLD.person_id
BEGIN
  SELECT RAISE(ABORT, 'person_membership_identity_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_person_membership_legacy_projection_insert
BEFORE INSERT ON person_tenant_memberships
FOR EACH ROW
WHEN NEW.legacy_person_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM people lp
  JOIN global_people gp ON gp.id = NEW.person_id
  WHERE lp.id = NEW.legacy_person_id
    AND lp.tenant_id = NEW.tenant_id
    AND lp.cpf = gp.cpf
)
BEGIN
  SELECT RAISE(ABORT, 'person_membership_legacy_projection_invalid');
END;

CREATE TRIGGER IF NOT EXISTS trg_person_membership_legacy_projection_update
BEFORE UPDATE OF legacy_person_id ON person_tenant_memberships
FOR EACH ROW
WHEN NEW.legacy_person_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM people lp
  JOIN global_people gp ON gp.id = NEW.person_id
  WHERE lp.id = NEW.legacy_person_id
    AND lp.tenant_id = NEW.tenant_id
    AND lp.cpf = gp.cpf
)
BEGIN
  SELECT RAISE(ABORT, 'person_membership_legacy_projection_invalid');
END;
