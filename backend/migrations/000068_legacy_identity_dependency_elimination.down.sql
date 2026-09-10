-- 30K.3A intentionally permits new canonical Accounts/Journeys/Memberships to
-- omit the retired compatibility identity columns. Re-establishing the old
-- NOT NULL/legacy writer contract would require inventing identity links.
-- Roll back by restoring the verified database backup taken before 000068.
CREATE TEMP TABLE bite30k3a_down_requires_backup (id INTEGER);
CREATE TEMP TRIGGER bite30k3a_down_refuse
BEFORE INSERT ON bite30k3a_down_requires_backup
BEGIN
  SELECT RAISE(ABORT, '30K.3A rollback requires restoring the verified pre-000068 database backup');
END;
INSERT INTO bite30k3a_down_requires_backup(id) VALUES (1);
