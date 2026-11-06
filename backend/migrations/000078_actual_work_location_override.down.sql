DROP TRIGGER IF EXISTS trg_byte353_actual_references_update;
DROP TRIGGER IF EXISTS trg_byte353_actual_references_insert;
ALTER TABLE work_period_assignments DROP COLUMN actual_task_id;
ALTER TABLE work_period_assignments DROP COLUMN actual_location_id;
ALTER TABLE work_period_assignments DROP COLUMN actual_sector_id;
