PRAGMA foreign_keys = ON;

-- Bite 30F makes Person–Tenant Membership the enduring parent of every
-- Collaborator Journey. The legacy person_id column remains temporarily for
-- downstream Bite 30G/30J compatibility.
ALTER TABLE collaborator_journeys ADD COLUMN membership_id TEXT NULL;

UPDATE collaborator_journeys
SET membership_id = (
  SELECT m.id
  FROM person_tenant_memberships m
  WHERE m.tenant_id = collaborator_journeys.tenant_id
    AND m.legacy_person_id = collaborator_journeys.person_id
  LIMIT 1
)
WHERE membership_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_membership_id
ON collaborator_journeys(membership_id);

CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_tenant_membership_closed
ON collaborator_journeys(tenant_id, membership_id, closed_at);

-- Existing Journeys must all resolve to the membership foundation established
-- in Bite 30B before the cutover can continue.
CREATE TEMP TABLE bite30f_membership_backfill_guard (id INTEGER);
CREATE TEMP TRIGGER bite30f_verify_collaborator_membership_backfill
BEFORE INSERT ON bite30f_membership_backfill_guard
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM collaborator_journeys c
  WHERE c.membership_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM person_tenant_memberships m
       WHERE m.id = c.membership_id
         AND m.tenant_id = c.tenant_id
         AND m.legacy_person_id = c.person_id
     )
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_backfill_incomplete');
END;
INSERT INTO bite30f_membership_backfill_guard(id) VALUES (1);
DROP TRIGGER bite30f_verify_collaborator_membership_backfill;
DROP TABLE bite30f_membership_backfill_guard;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_membership_required_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NEW.membership_id IS NULL OR TRIM(NEW.membership_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_membership_consistency_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NEW.membership_id IS NOT NULL
  AND TRIM(NEW.membership_id) <> ''
  AND NOT EXISTS (
  SELECT 1
  FROM person_tenant_memberships m
  WHERE m.id = NEW.membership_id
    AND m.tenant_id = NEW.tenant_id
    AND m.legacy_person_id = NEW.person_id
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_invalid');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_membership_active_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NEW.membership_id IS NOT NULL
  AND TRIM(NEW.membership_id) <> ''
  AND NOT EXISTS (
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

CREATE TRIGGER IF NOT EXISTS trg_collaborator_membership_single_open_journey_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NEW.membership_id IS NOT NULL
  AND TRIM(NEW.membership_id) <> ''
  AND NEW.closed_at IS NULL
  AND EXISTS (
  SELECT 1
  FROM collaborator_journeys c
  WHERE c.membership_id = NEW.membership_id
    AND c.tenant_id = NEW.tenant_id
    AND c.closed_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_open_journey_exists');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_membership_single_open_journey_update
BEFORE UPDATE OF closed_at ON collaborator_journeys
FOR EACH ROW
WHEN NEW.closed_at IS NULL
  AND OLD.closed_at IS NOT NULL
  AND NEW.membership_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM collaborator_journeys c
    WHERE c.id <> NEW.id
      AND c.membership_id = NEW.membership_id
      AND c.tenant_id = NEW.tenant_id
      AND c.closed_at IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_open_journey_exists');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_membership_identity_immutable
BEFORE UPDATE OF tenant_id, membership_id, person_id ON collaborator_journeys
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
  OR COALESCE(NEW.membership_id, '') <> COALESCE(OLD.membership_id, '')
  OR NEW.person_id <> OLD.person_id
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_identity_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_membership_protect_history_delete
BEFORE DELETE ON person_tenant_memberships
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM collaborator_journeys c WHERE c.membership_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'collaborator_membership_history_protected');
END;
