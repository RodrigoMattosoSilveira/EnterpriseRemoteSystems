CREATE TABLE IF NOT EXISTS journey_bonus_awards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  collaborator_journey_id TEXT NOT NULL,
  receipt_number TEXT NOT NULL UNIQUE,
  value_unit_code TEXT NOT NULL CHECK (value_unit_code IN ('BRL', 'GOLD_GRAM')),
  amount REAL NOT NULL CHECK (amount > 0),
  effective_date DATE NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING_APPROVAL', 'POSTED')),
  requested_by_actor_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  requested_at DATETIME NOT NULL,
  approved_by_actor_id TEXT NULL,
  approved_by_user_id TEXT NULL,
  approved_at DATETIME NULL,
  ledger_entry_id TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_journey_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_journey_bonus_awards_journey_status
  ON journey_bonus_awards(tenant_id, collaborator_journey_id, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_journey_bonus_awards_ledger_entry
  ON journey_bonus_awards(ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL AND trim(ledger_entry_id) <> '';

CREATE TRIGGER IF NOT EXISTS trg_journey_bonus_award_terminal_immutable
BEFORE UPDATE ON journey_bonus_awards
WHEN OLD.status = 'POSTED'
BEGIN
  SELECT RAISE(ABORT, 'posted Journey bonus award is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_bonus_award_no_delete
BEFORE DELETE ON journey_bonus_awards
BEGIN
  SELECT RAISE(ABORT, 'Journey bonus award evidence cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_bonus_award_second_admin
BEFORE UPDATE OF status, approved_by_actor_id ON journey_bonus_awards
WHEN NEW.status = 'POSTED'
 AND trim(COALESCE(NEW.approved_by_actor_id, '')) = trim(OLD.requested_by_actor_id)
BEGIN
  SELECT RAISE(ABORT, 'Journey bonus award requires approval by a different Tenant Administrator');
END;

DROP TRIGGER IF EXISTS trg_journey_close_requires_bonus_resolution;
CREATE TRIGGER trg_journey_close_requires_bonus_resolution
BEFORE UPDATE OF closed_at ON collaborator_journeys
WHEN OLD.closed_at IS NULL
 AND NEW.closed_at IS NOT NULL
 AND EXISTS (
   SELECT 1 FROM journey_bonus_awards a
   WHERE a.collaborator_journey_id = OLD.id
     AND a.tenant_id = OLD.tenant_id
     AND a.status = 'PENDING_APPROVAL'
 )
BEGIN
  SELECT RAISE(ABORT, 'pending Journey bonus award must be approved before closure');
END;

-- Preserve any pre-refinement one-time bonus evidence as historical awards.
INSERT OR IGNORE INTO journey_bonus_awards (
  id, tenant_id, collaborator_journey_id, receipt_number, value_unit_code, amount,
  effective_date, description, status, requested_by_actor_id, requested_by_user_id,
  requested_at, approved_by_actor_id, approved_by_user_id, approved_at, ledger_entry_id,
  created_at, updated_at
)
SELECT
  'legacy-bonus-' || cj.id,
  cj.tenant_id,
  cj.id,
  'JBA-LEGACY-' || cj.id,
  'BRL',
  cj.bonus_brl_amount,
  COALESCE((SELECT le.effective_date FROM ledger_entries le WHERE le.id = cj.bonus_ledger_entry_id), cj.journey_start_date),
  cj.bonus_description,
  CASE WHEN cj.bonus_posted_at IS NOT NULL THEN 'POSTED' ELSE 'PENDING_APPROVAL' END,
  'legacy-migration',
  'legacy-migration',
  COALESCE(cj.created_at, CURRENT_TIMESTAMP),
  CASE WHEN cj.bonus_posted_at IS NOT NULL THEN 'legacy-migration' ELSE NULL END,
  CASE WHEN cj.bonus_posted_at IS NOT NULL THEN 'legacy-migration' ELSE NULL END,
  cj.bonus_posted_at,
  NULLIF(trim(cj.bonus_ledger_entry_id), ''),
  COALESCE(cj.created_at, CURRENT_TIMESTAMP),
  COALESCE(cj.updated_at, CURRENT_TIMESTAMP)
FROM collaborator_journeys cj
WHERE cj.bonus_brl_amount IS NOT NULL AND cj.bonus_brl_amount > 0
  AND (cj.bonus_posted_at IS NOT NULL OR cj.closed_at IS NULL);
