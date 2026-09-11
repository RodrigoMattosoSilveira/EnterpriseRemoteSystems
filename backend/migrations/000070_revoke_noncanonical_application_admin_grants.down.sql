-- This migration revokes historically effective authorization that cannot be
-- proven to have canonical GLOBAL Authentication ownership. Automatically
-- reactivating those grants would restore invalid standing authority. Restore
-- the verified pre-000070 database backup if rollback is required.
PRAGMA foreign_keys = ON;

CREATE TEMP TABLE bite30k3b_admin_reconciliation_down_guard (id INTEGER);
CREATE TEMP TRIGGER bite30k3b_admin_reconciliation_down_requires_backup
BEFORE INSERT ON bite30k3b_admin_reconciliation_down_guard
BEGIN
  SELECT RAISE(ABORT, '30K.3B Application Administrator reconciliation rollback requires restoring the verified pre-000070 database backup');
END;
INSERT INTO bite30k3b_admin_reconciliation_down_guard(id) VALUES (1);
