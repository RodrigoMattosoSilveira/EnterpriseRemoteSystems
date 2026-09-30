DROP TRIGGER IF EXISTS trg_journey_bonus_post_guard;
DROP TRIGGER IF EXISTS trg_journey_bonus_config_immutable_after_post;
DROP INDEX IF EXISTS ux_collaborator_journey_bonus_ledger_entry;
-- SQLite cannot drop these added columns safely without rebuilding collaborator_journeys.
