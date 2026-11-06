-- Byte 35.3: Actual work references are distinct from informed assignment references.
-- Existing assignments keep NULL overrides: actual sector/location/task defaults to informed.
ALTER TABLE work_period_assignments ADD COLUMN actual_sector_id TEXT NULL REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE work_period_assignments ADD COLUMN actual_location_id TEXT NULL REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE work_period_assignments ADD COLUMN actual_task_id TEXT NULL REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE TRIGGER trg_byte353_actual_references_insert
BEFORE INSERT ON work_period_assignments
WHEN (NEW.actual_sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM reference_data WHERE id = NEW.actual_sector_id AND tenant_id = NEW.tenant_id AND type = 'sector' AND active = 1
  )) OR (NEW.actual_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM reference_data WHERE id = NEW.actual_location_id AND tenant_id = NEW.tenant_id AND type = 'location' AND active = 1
  )) OR (NEW.actual_task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM reference_data WHERE id = NEW.actual_task_id AND tenant_id = NEW.tenant_id AND type = 'task' AND active = 1
  ))
BEGIN SELECT RAISE(ABORT, 'invalid actual work sector, location or task'); END;

CREATE TRIGGER trg_byte353_actual_references_update
BEFORE UPDATE OF actual_sector_id, actual_location_id, actual_task_id, tenant_id ON work_period_assignments
WHEN (NEW.actual_sector_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM reference_data WHERE id = NEW.actual_sector_id AND tenant_id = NEW.tenant_id AND type = 'sector' AND active = 1
  )) OR (NEW.actual_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM reference_data WHERE id = NEW.actual_location_id AND tenant_id = NEW.tenant_id AND type = 'location' AND active = 1
  )) OR (NEW.actual_task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM reference_data WHERE id = NEW.actual_task_id AND tenant_id = NEW.tenant_id AND type = 'task' AND active = 1
  ))
BEGIN SELECT RAISE(ABORT, 'invalid actual work sector, location or task'); END;
