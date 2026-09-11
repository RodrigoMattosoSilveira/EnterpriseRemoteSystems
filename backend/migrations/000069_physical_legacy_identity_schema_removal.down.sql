-- Bite 30K.3B physically removes identity compatibility columns/table. New
-- canonical rows created after this migration have no legacy representation, so
-- a synthetic down migration would invent identity. Restore the verified
-- pre-000069 database backup instead.
PRAGMA foreign_keys = ON;

CREATE TEMP TABLE bite30k3b_down_guard (id INTEGER);
CREATE TEMP TRIGGER bite30k3b_down_requires_backup
BEFORE INSERT ON bite30k3b_down_guard
BEGIN
  SELECT RAISE(ABORT, '30K.3B rollback requires restoring the verified pre-000069 database backup');
END;
INSERT INTO bite30k3b_down_guard(id) VALUES (1);
