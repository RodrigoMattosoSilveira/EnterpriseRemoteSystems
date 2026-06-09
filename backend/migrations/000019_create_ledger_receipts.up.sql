BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS ledger_receipts (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  collaborator_id TEXT NOT NULL,
  ledger_entry_id TEXT NOT NULL,
  receipt_number TEXT NULL,
  receipt_type TEXT NOT NULL DEFAULT 'LEDGER_DEBIT',
  status TEXT NOT NULL DEFAULT 'PENDING_ISSUE',
  issued_at DATETIME NULL,
  issued_by TEXT NULL,
  printed_at DATETIME NULL,
  signed_at DATETIME NULL,
  returned_at DATETIME NULL,
  received_by TEXT NULL,
  signed_document_ref TEXT NULL,
  cancelled_at DATETIME NULL,
  cancelled_by TEXT NULL,
  cancellation_reason TEXT NULL,
  notes TEXT NULL,
  CHECK (receipt_type IN ('LEDGER_DEBIT')),
  CHECK (status IN ('PENDING_ISSUE', 'ISSUED', 'PRINTED', 'SIGNED', 'RETURNED', 'CANCELLED')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (ledger_entry_id),
  UNIQUE (tenant_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_ledger_receipts_tenant_id
  ON ledger_receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_receipts_collaborator_id
  ON ledger_receipts(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_ledger_receipts_status
  ON ledger_receipts(status);
CREATE INDEX IF NOT EXISTS idx_ledger_receipts_receipt_type
  ON ledger_receipts(receipt_type);
CREATE INDEX IF NOT EXISTS idx_ledger_receipts_issued_by
  ON ledger_receipts(issued_by);
CREATE INDEX IF NOT EXISTS idx_ledger_receipts_received_by
  ON ledger_receipts(received_by);
CREATE INDEX IF NOT EXISTS idx_ledger_receipts_cancelled_by
  ON ledger_receipts(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_ledger_receipts_tenant_collaborator_status
  ON ledger_receipts(tenant_id, collaborator_id, status);

COMMIT;
