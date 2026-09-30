PRAGMA foreign_keys = ON;

ALTER TABLE collaborator_journeys ADD COLUMN bonus_brl_amount REAL NULL CHECK (bonus_brl_amount IS NULL OR bonus_brl_amount > 0);
ALTER TABLE collaborator_journeys ADD COLUMN bonus_description TEXT NULL;
ALTER TABLE collaborator_journeys ADD COLUMN bonus_posted_at DATETIME NULL;
ALTER TABLE collaborator_journeys ADD COLUMN bonus_ledger_entry_id TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_collaborator_journey_bonus_ledger_entry
  ON collaborator_journeys(bonus_ledger_entry_id)
  WHERE bonus_ledger_entry_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_journey_bonus_config_immutable_after_post
BEFORE UPDATE OF bonus_brl_amount, bonus_description ON collaborator_journeys
WHEN OLD.bonus_posted_at IS NOT NULL
 AND (COALESCE(NEW.bonus_brl_amount, -1) <> COALESCE(OLD.bonus_brl_amount, -1)
   OR COALESCE(NEW.bonus_description, '') <> COALESCE(OLD.bonus_description, ''))
BEGIN
  SELECT RAISE(ABORT, 'posted_journey_bonus_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_bonus_post_guard
BEFORE UPDATE OF bonus_posted_at, bonus_ledger_entry_id ON collaborator_journeys
WHEN OLD.bonus_posted_at IS NULL AND NEW.bonus_posted_at IS NOT NULL
BEGIN
  SELECT CASE WHEN OLD.closed_at IS NOT NULL THEN RAISE(ABORT, 'journey_bonus_requires_open_journey') END;
  SELECT CASE WHEN NEW.bonus_brl_amount IS NULL OR NEW.bonus_brl_amount <= 0 THEN RAISE(ABORT, 'journey_bonus_requires_configured_amount') END;
  SELECT CASE WHEN NEW.bonus_ledger_entry_id IS NULL OR trim(NEW.bonus_ledger_entry_id) = '' THEN RAISE(ABORT, 'journey_bonus_requires_ledger_entry') END;
END;
