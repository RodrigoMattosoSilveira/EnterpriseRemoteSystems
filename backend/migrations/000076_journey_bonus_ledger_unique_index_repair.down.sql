DROP INDEX IF EXISTS ux_collaborator_journey_bonus_ledger_entry;

CREATE UNIQUE INDEX ux_collaborator_journey_bonus_ledger_entry
  ON collaborator_journeys(bonus_ledger_entry_id)
  WHERE bonus_ledger_entry_id IS NOT NULL;
