CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_status_insert_guard
BEFORE INSERT ON ledger_receipts
BEGIN
  SELECT RAISE(ABORT, 'ledger receipt ISSUED status requires issued_at and issued_by')
  WHERE NEW.status = 'ISSUED'
    AND (NEW.issued_at IS NULL OR COALESCE(TRIM(NEW.issued_by), '') = '');

  SELECT RAISE(ABORT, 'ledger receipt PRINTED status requires issued_at, issued_by, and printed_at')
  WHERE NEW.status = 'PRINTED'
    AND (NEW.issued_at IS NULL OR COALESCE(TRIM(NEW.issued_by), '') = '' OR NEW.printed_at IS NULL);

  SELECT RAISE(ABORT, 'ledger receipt SIGNED status requires signed_at')
  WHERE NEW.status = 'SIGNED'
    AND NEW.signed_at IS NULL;

  SELECT RAISE(ABORT, 'ledger receipt RETURNED status requires signed_at, returned_at, received_by, and signed_document_ref')
  WHERE NEW.status = 'RETURNED'
    AND (NEW.signed_at IS NULL OR NEW.returned_at IS NULL OR COALESCE(TRIM(NEW.received_by), '') = '' OR COALESCE(TRIM(NEW.signed_document_ref), '') = '');

  SELECT RAISE(ABORT, 'ledger receipt CANCELLED status requires cancelled_at, cancelled_by, and cancellation_reason')
  WHERE NEW.status = 'CANCELLED'
    AND (NEW.cancelled_at IS NULL OR COALESCE(TRIM(NEW.cancelled_by), '') = '' OR COALESCE(TRIM(NEW.cancellation_reason), '') = '');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_status_update_guard
BEFORE UPDATE ON ledger_receipts
BEGIN
  SELECT RAISE(ABORT, 'ledger receipt RETURNED status is terminal')
  WHERE OLD.status = 'RETURNED' AND NEW.status <> 'RETURNED';

  SELECT RAISE(ABORT, 'ledger receipt CANCELLED status is terminal')
  WHERE OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED';

  SELECT RAISE(ABORT, 'ledger receipt ISSUED status requires issued_at and issued_by')
  WHERE NEW.status = 'ISSUED'
    AND (NEW.issued_at IS NULL OR COALESCE(TRIM(NEW.issued_by), '') = '');

  SELECT RAISE(ABORT, 'ledger receipt PRINTED status requires issued_at, issued_by, and printed_at')
  WHERE NEW.status = 'PRINTED'
    AND (NEW.issued_at IS NULL OR COALESCE(TRIM(NEW.issued_by), '') = '' OR NEW.printed_at IS NULL);

  SELECT RAISE(ABORT, 'ledger receipt SIGNED status requires signed_at')
  WHERE NEW.status = 'SIGNED'
    AND NEW.signed_at IS NULL;

  SELECT RAISE(ABORT, 'ledger receipt RETURNED status requires signed_at, returned_at, received_by, and signed_document_ref')
  WHERE NEW.status = 'RETURNED'
    AND (NEW.signed_at IS NULL OR NEW.returned_at IS NULL OR COALESCE(TRIM(NEW.received_by), '') = '' OR COALESCE(TRIM(NEW.signed_document_ref), '') = '');

  SELECT RAISE(ABORT, 'ledger receipt CANCELLED status requires cancelled_at, cancelled_by, and cancellation_reason')
  WHERE NEW.status = 'CANCELLED'
    AND (NEW.cancelled_at IS NULL OR COALESCE(TRIM(NEW.cancelled_by), '') = '' OR COALESCE(TRIM(NEW.cancellation_reason), '') = '');
END;
