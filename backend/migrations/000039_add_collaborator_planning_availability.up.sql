-- Bite 26D: collaborator-level availability defaults for work-period planning.
--
-- Work Period plans still model replacements one period at a time. This
-- collaborator-level value is copied into newly constructed planning templates
-- so long-term Day Off / Leave of Absence defaults can flow forward until an
-- authorized actor changes the collaborator back to ACTIVE.

ALTER TABLE collaborator_journeys
    ADD COLUMN planning_availability TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (planning_availability IN ('ACTIVE', 'DAY_OFF', 'LEAVE_OF_ABSENCE'));
