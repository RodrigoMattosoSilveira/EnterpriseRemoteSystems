-- Materialize the accent-insensitive Person search normalization once per
-- Person write. Keep each REPLACE expression shallow so both the sqlite3 CLI
-- used by migrations and the embedded SQLite engine stay below parser depth
-- limits. char(31) is an internal separator that prevents cross-field matches.
CREATE TABLE IF NOT EXISTS people_search_index (
    person_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    search_text TEXT NOT NULL,
    FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_people_search_index_tenant
ON people_search_index (tenant_id, person_id);

INSERT INTO people_search_index (person_id, tenant_id, search_text)
SELECT
    people.id,
    people.tenant_id,
    LOWER(COALESCE(people.first_name, '')) || char(31) || LOWER(COALESCE(people.last_name, '')) || char(31) || LOWER(COALESCE(people.nickname, '')) || char(31) || LOWER(TRIM(COALESCE(people.first_name, '') || ' ' || COALESCE(people.last_name, '')))
FROM people
WHERE 1 = 1
ON CONFLICT(person_id) DO UPDATE SET
    tenant_id = excluded.tenant_id,
    search_text = excluded.search_text;

UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'á', 'a'), 'Á', 'a'), 'à', 'a'), 'À', 'a'), 'â', 'a'), 'Â', 'a'), 'ã', 'a'), 'Ã', 'a');
UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ä', 'a'), 'Ä', 'a'), 'é', 'e'), 'É', 'e'), 'è', 'e'), 'È', 'e'), 'ê', 'e'), 'Ê', 'e');
UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ë', 'e'), 'Ë', 'e'), 'í', 'i'), 'Í', 'i'), 'ì', 'i'), 'Ì', 'i'), 'î', 'i'), 'Î', 'i');
UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ï', 'i'), 'Ï', 'i'), 'ó', 'o'), 'Ó', 'o'), 'ò', 'o'), 'Ò', 'o'), 'ô', 'o'), 'Ô', 'o');
UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'õ', 'o'), 'Õ', 'o'), 'ö', 'o'), 'Ö', 'o'), 'ú', 'u'), 'Ú', 'u'), 'ù', 'u'), 'Ù', 'u');
UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'û', 'u'), 'Û', 'u'), 'ü', 'u'), 'Ü', 'u'), 'ç', 'c'), 'Ç', 'c');

CREATE TRIGGER IF NOT EXISTS trg_people_search_index_insert
AFTER INSERT ON people
BEGIN
    INSERT INTO people_search_index (person_id, tenant_id, search_text)
    VALUES (NEW.id, NEW.tenant_id, LOWER(COALESCE(NEW.first_name, '')) || char(31) || LOWER(COALESCE(NEW.last_name, '')) || char(31) || LOWER(COALESCE(NEW.nickname, '')) || char(31) || LOWER(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''))))
    ON CONFLICT(person_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        search_text = excluded.search_text;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'á', 'a'), 'Á', 'a'), 'à', 'a'), 'À', 'a'), 'â', 'a'), 'Â', 'a'), 'ã', 'a'), 'Ã', 'a') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ä', 'a'), 'Ä', 'a'), 'é', 'e'), 'É', 'e'), 'è', 'e'), 'È', 'e'), 'ê', 'e'), 'Ê', 'e') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ë', 'e'), 'Ë', 'e'), 'í', 'i'), 'Í', 'i'), 'ì', 'i'), 'Ì', 'i'), 'î', 'i'), 'Î', 'i') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ï', 'i'), 'Ï', 'i'), 'ó', 'o'), 'Ó', 'o'), 'ò', 'o'), 'Ò', 'o'), 'ô', 'o'), 'Ô', 'o') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'õ', 'o'), 'Õ', 'o'), 'ö', 'o'), 'Ö', 'o'), 'ú', 'u'), 'Ú', 'u'), 'ù', 'u'), 'Ù', 'u') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'û', 'u'), 'Û', 'u'), 'ü', 'u'), 'Ü', 'u'), 'ç', 'c'), 'Ç', 'c') WHERE person_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_people_search_index_update
AFTER UPDATE OF tenant_id, first_name, last_name, nickname ON people
BEGIN
    INSERT INTO people_search_index (person_id, tenant_id, search_text)
    VALUES (NEW.id, NEW.tenant_id, LOWER(COALESCE(NEW.first_name, '')) || char(31) || LOWER(COALESCE(NEW.last_name, '')) || char(31) || LOWER(COALESCE(NEW.nickname, '')) || char(31) || LOWER(TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''))))
    ON CONFLICT(person_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        search_text = excluded.search_text;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'á', 'a'), 'Á', 'a'), 'à', 'a'), 'À', 'a'), 'â', 'a'), 'Â', 'a'), 'ã', 'a'), 'Ã', 'a') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ä', 'a'), 'Ä', 'a'), 'é', 'e'), 'É', 'e'), 'è', 'e'), 'È', 'e'), 'ê', 'e'), 'Ê', 'e') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ë', 'e'), 'Ë', 'e'), 'í', 'i'), 'Í', 'i'), 'ì', 'i'), 'Ì', 'i'), 'î', 'i'), 'Î', 'i') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'ï', 'i'), 'Ï', 'i'), 'ó', 'o'), 'Ó', 'o'), 'ò', 'o'), 'Ò', 'o'), 'ô', 'o'), 'Ô', 'o') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'õ', 'o'), 'Õ', 'o'), 'ö', 'o'), 'Ö', 'o'), 'ú', 'u'), 'Ú', 'u'), 'ù', 'u'), 'Ù', 'u') WHERE person_id = NEW.id;
    UPDATE people_search_index SET search_text = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(search_text, 'û', 'u'), 'Û', 'u'), 'ü', 'u'), 'Ü', 'u'), 'ç', 'c'), 'Ç', 'c') WHERE person_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_people_search_index_delete
AFTER DELETE ON people
BEGIN
    DELETE FROM people_search_index WHERE person_id = OLD.id;
END;
