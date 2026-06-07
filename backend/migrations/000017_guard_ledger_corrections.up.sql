CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_entries_single_reversal
    ON ledger_entries(tenant_id, related_entry_id)
    WHERE correction_type = 'REVERSAL'
      AND related_entry_id IS NOT NULL;
