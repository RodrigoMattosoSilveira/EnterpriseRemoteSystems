DROP TRIGGER IF EXISTS trg_byte353_posted_accrual_work_attribution_immutable;
DROP TRIGGER IF EXISTS trg_byte353_ledger_work_attribution_immutable;
-- Rollback of metadata columns only; do not roll back posted financial evidence in Production.
ALTER TABLE ledger_entries DROP COLUMN work_task_label;
ALTER TABLE ledger_entries DROP COLUMN work_task_id;
ALTER TABLE ledger_entries DROP COLUMN work_location_label;
ALTER TABLE ledger_entries DROP COLUMN work_location_id;
ALTER TABLE ledger_entries DROP COLUMN work_sector_label;
ALTER TABLE ledger_entries DROP COLUMN work_sector_id;
ALTER TABLE accrual_items DROP COLUMN work_task_label;
ALTER TABLE accrual_items DROP COLUMN work_task_id;
ALTER TABLE accrual_items DROP COLUMN work_location_label;
ALTER TABLE accrual_items DROP COLUMN work_location_id;
ALTER TABLE accrual_items DROP COLUMN work_sector_label;
ALTER TABLE accrual_items DROP COLUMN work_sector_id;
