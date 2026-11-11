-- Byte 35.5: no unsafe automatic downgrade of immutable historical balances.
-- Recovery must use the established verified Bite 33.4/33.5 restore gate and
-- an approved matching code revision, never delete financial audit evidence.
BEGIN IMMEDIATE;
CREATE TEMP TABLE byte355_downgrade_refused (n INTEGER CHECK(n = 0));
INSERT INTO byte355_downgrade_refused(n) VALUES (1);
ROLLBACK;
