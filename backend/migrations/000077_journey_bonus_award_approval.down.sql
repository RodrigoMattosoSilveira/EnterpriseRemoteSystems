DROP TRIGGER IF EXISTS trg_journey_close_requires_bonus_resolution;
DROP TRIGGER IF EXISTS trg_journey_bonus_award_second_admin;
DROP TRIGGER IF EXISTS trg_journey_bonus_award_no_delete;
DROP TRIGGER IF EXISTS trg_journey_bonus_award_terminal_immutable;
DROP INDEX IF EXISTS ux_journey_bonus_awards_ledger_entry;
DROP INDEX IF EXISTS idx_journey_bonus_awards_journey_status;
DROP TABLE IF EXISTS journey_bonus_awards;
