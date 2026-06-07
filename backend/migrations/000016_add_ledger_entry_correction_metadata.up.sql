ALTER TABLE ledger_entries
  ADD COLUMN correction_type TEXT NOT NULL DEFAULT 'ORIGINAL';

ALTER TABLE ledger_entries
  ADD COLUMN related_entry_id TEXT NULL;

ALTER TABLE ledger_entries
  ADD COLUMN correction_reason TEXT NULL;

ALTER TABLE ledger_entries
  ADD COLUMN authorized_by TEXT NULL;

ALTER TABLE ledger_entries
  ADD COLUMN authorized_at DATETIME NULL;

