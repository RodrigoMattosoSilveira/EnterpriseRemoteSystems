-- Bite 26C-1 repair migration.
--
-- The Work Period planning save flow now persists planning_availability, but
-- databases created before the Bite 26C-1 schema change do not have that
-- column. When the backend saves a selected collaborator plan, GORM inserts
-- planning_availability and SQLite returns:
--
--   table work_period_assignments has no column named planning_availability
--
-- This migration repairs databases that have reached the planning code change
-- without the matching table column.
--
-- Availability values are:
--   ACTIVE  = A
--   DAY_OFF = D
--   LICENSE = L

ALTER TABLE work_period_assignments
    ADD COLUMN planning_availability TEXT NOT NULL DEFAULT 'ACTIVE'
