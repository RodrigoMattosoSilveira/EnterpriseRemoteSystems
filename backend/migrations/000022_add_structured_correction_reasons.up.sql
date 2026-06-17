ALTER TABLE ledger_entries
  ADD COLUMN correction_reason_code TEXT NULL;

ALTER TABLE ledger_entries
  ADD COLUMN correction_reason_text TEXT NULL;

UPDATE ledger_entries
SET correction_reason_text = correction_reason
WHERE correction_reason_text IS NULL
  AND correction_reason IS NOT NULL
  AND TRIM(correction_reason) <> '';

UPDATE ledger_entries
SET correction_reason_code = 'MANUAL_CORRECTION'
WHERE correction_reason_code IS NULL
  AND correction_reason_text IS NOT NULL
  AND TRIM(correction_reason_text) <> '';

CREATE INDEX IF NOT EXISTS idx_ledger_entries_correction_reason_code
  ON ledger_entries(correction_reason_code);

ALTER TABLE journey_settlements
  ADD COLUMN reason_code TEXT NULL;

ALTER TABLE journey_settlements
  ADD COLUMN reason_text TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_journey_settlements_reason_code
  ON journey_settlements(reason_code);

ALTER TABLE authz_audit_logs
  ADD COLUMN metadata_json TEXT NULL;
