DROP TRIGGER IF EXISTS trg_people_search_index_delete;
DROP TRIGGER IF EXISTS trg_people_search_index_update;
DROP TRIGGER IF EXISTS trg_people_search_index_insert;
DROP INDEX IF EXISTS idx_people_search_index_tenant;
DROP TABLE IF EXISTS people_search_index;
