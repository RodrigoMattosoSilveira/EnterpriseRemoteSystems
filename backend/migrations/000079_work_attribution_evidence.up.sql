-- Byte 35.3 accrual and current-account evidence: store immutable work attribution snapshots.
-- Existing entries are intentionally left without attribution: their historical value cannot be proven retrospectively.
-- All columns are additive and default empty for existing financial history.
ALTER TABLE accrual_items ADD COLUMN work_sector_id TEXT NOT NULL DEFAULT '';
ALTER TABLE accrual_items ADD COLUMN work_sector_label TEXT NOT NULL DEFAULT '';
ALTER TABLE accrual_items ADD COLUMN work_location_id TEXT NOT NULL DEFAULT '';
ALTER TABLE accrual_items ADD COLUMN work_location_label TEXT NOT NULL DEFAULT '';
ALTER TABLE accrual_items ADD COLUMN work_task_id TEXT NOT NULL DEFAULT '';
ALTER TABLE accrual_items ADD COLUMN work_task_label TEXT NOT NULL DEFAULT '';
ALTER TABLE ledger_entries ADD COLUMN work_sector_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ledger_entries ADD COLUMN work_sector_label TEXT NOT NULL DEFAULT '';
ALTER TABLE ledger_entries ADD COLUMN work_location_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ledger_entries ADD COLUMN work_location_label TEXT NOT NULL DEFAULT '';
ALTER TABLE ledger_entries ADD COLUMN work_task_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ledger_entries ADD COLUMN work_task_label TEXT NOT NULL DEFAULT '';

-- A posted ledger snapshot is evidence, not a dynamic reference-data projection.
CREATE TRIGGER trg_byte353_ledger_work_attribution_immutable
BEFORE UPDATE OF work_sector_id, work_sector_label, work_location_id, work_location_label, work_task_id, work_task_label ON ledger_entries
WHEN OLD.work_sector_id IS NOT NEW.work_sector_id
 OR OLD.work_sector_label IS NOT NEW.work_sector_label
 OR OLD.work_location_id IS NOT NEW.work_location_id
 OR OLD.work_location_label IS NOT NEW.work_location_label
 OR OLD.work_task_id IS NOT NEW.work_task_id
 OR OLD.work_task_label IS NOT NEW.work_task_label
BEGIN SELECT RAISE(ABORT, 'posted ledger work attribution is immutable'); END;

-- Posted accrual items carry the same immutable evidence as their ledger entries.
CREATE TRIGGER trg_byte353_posted_accrual_work_attribution_immutable
BEFORE UPDATE OF work_sector_id, work_sector_label, work_location_id, work_location_label, work_task_id, work_task_label ON accrual_items
WHEN OLD.status = 'POSTED' AND (OLD.work_sector_id IS NOT NEW.work_sector_id
 OR OLD.work_sector_label IS NOT NEW.work_sector_label
 OR OLD.work_location_id IS NOT NEW.work_location_id
 OR OLD.work_location_label IS NOT NEW.work_location_label
 OR OLD.work_task_id IS NOT NEW.work_task_id
 OR OLD.work_task_label IS NOT NEW.work_task_label)
BEGIN SELECT RAISE(ABORT, 'posted accrual work attribution is immutable'); END;
