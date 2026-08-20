package db

import (
	"fmt"
	"strings"

	"enterpriseremotesystems/backend/internal/shared/textsearch"
	"gorm.io/gorm"
)

const peopleSearchSeparator = "char(31)"

func InstallPeopleSearchIndex(database *gorm.DB) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS people_search_index (
			person_id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			search_text TEXT NOT NULL,
			FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE CASCADE ON DELETE CASCADE,
			FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT
		)`,
		`CREATE INDEX IF NOT EXISTS idx_people_search_index_tenant
			ON people_search_index (tenant_id, person_id)`,
		`INSERT INTO people_search_index (person_id, tenant_id, search_text)
		 SELECT people.id, people.tenant_id, ` + peopleSearchTextSQL("people") + `
		   FROM people
		  WHERE 1 = 1
		 ON CONFLICT(person_id) DO UPDATE SET
		   tenant_id = excluded.tenant_id,
		   search_text = excluded.search_text`,
		`DROP TRIGGER IF EXISTS trg_people_search_index_insert`,
		`DROP TRIGGER IF EXISTS trg_people_search_index_update`,
		`DROP TRIGGER IF EXISTS trg_people_search_index_delete`,
		`CREATE TRIGGER trg_people_search_index_insert
		 AFTER INSERT ON people
		 BEGIN
		   INSERT INTO people_search_index (person_id, tenant_id, search_text)
		   VALUES (NEW.id, NEW.tenant_id, ` + peopleSearchTextSQL("NEW") + `)
		   ON CONFLICT(person_id) DO UPDATE SET
		     tenant_id = excluded.tenant_id,
		     search_text = excluded.search_text;
		 END`,
		`CREATE TRIGGER trg_people_search_index_update
		 AFTER UPDATE OF tenant_id, first_name, last_name, nickname ON people
		 BEGIN
		   INSERT INTO people_search_index (person_id, tenant_id, search_text)
		   VALUES (NEW.id, NEW.tenant_id, ` + peopleSearchTextSQL("NEW") + `)
		   ON CONFLICT(person_id) DO UPDATE SET
		     tenant_id = excluded.tenant_id,
		     search_text = excluded.search_text;
		 END`,
		`CREATE TRIGGER trg_people_search_index_delete
		 AFTER DELETE ON people
		 BEGIN
		   DELETE FROM people_search_index WHERE person_id = OLD.id;
		 END`,
	}

	for _, statement := range statements {
		if err := database.Exec(statement).Error; err != nil {
			return fmt.Errorf("install people search index: %w", err)
		}
	}
	return nil
}

func peopleSearchTextSQL(prefix string) string {
	firstName := textsearch.SQLNormalize(prefix + ".first_name")
	lastName := textsearch.SQLNormalize(prefix + ".last_name")
	nickname := textsearch.SQLNormalize(prefix + ".nickname")
	fullName := textsearch.SQLNormalize(
		"TRIM(COALESCE(" + prefix + ".first_name, '') || ' ' || COALESCE(" + prefix + ".last_name, ''))",
	)

	return strings.Join(
		[]string{firstName, lastName, nickname, fullName},
		" || "+peopleSearchSeparator+" || ",
	)
}
