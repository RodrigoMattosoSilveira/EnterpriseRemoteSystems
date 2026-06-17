ALTER TABLE ledger_entries
  ADD COLUMN second_approved_by TEXT NULL;

ALTER TABLE ledger_entries
  ADD COLUMN second_approved_at DATETIME NULL;

ALTER TABLE ledger_entries
  ADD COLUMN second_approval_notes TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_second_approved_by
  ON ledger_entries(second_approved_by);

ALTER TABLE journey_settlements
  ADD COLUMN second_approved_by TEXT NULL;

ALTER TABLE journey_settlements
  ADD COLUMN second_approved_at DATETIME NULL;

ALTER TABLE journey_settlements
  ADD COLUMN second_approval_notes TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_journey_settlements_second_approved_by
  ON journey_settlements(second_approved_by);
