package db

import (
	"fmt"
	"strings"

	"enterpriseremotesystems/backend/internal/shared/textsearch"
	"gorm.io/gorm"
)

const (
	peopleSearchSeparator        = "char(31)"
	peopleSearchReplaceBatchSize = 8
)

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
		 SELECT people.id, people.tenant_id, ` + peopleSearchRawTextSQL("people") + `
		   FROM people
		  WHERE 1 = 1
		 ON CONFLICT(person_id) DO UPDATE SET
		   tenant_id = excluded.tenant_id,
		   search_text = excluded.search_text`,
	}

	statements = append(statements, peopleSearchNormalizeStatementsSQL("")...)
	statements = append(statements,
		`DROP TRIGGER IF EXISTS trg_people_search_index_insert`,
		`DROP TRIGGER IF EXISTS trg_people_search_index_update`,
		`DROP TRIGGER IF EXISTS trg_people_search_index_delete`,
		peopleSearchTriggerSQL("trg_people_search_index_insert", "AFTER INSERT ON people"),
		peopleSearchTriggerSQL("trg_people_search_index_update", "AFTER UPDATE OF tenant_id, first_name, last_name, nickname ON people"),
		`CREATE TRIGGER trg_people_search_index_delete
		 AFTER DELETE ON people
		 BEGIN
		   DELETE FROM people_search_index WHERE person_id = OLD.id;
		 END`,
	)

	for _, statement := range statements {
		if err := database.Exec(statement).Error; err != nil {
			return fmt.Errorf("install people search index: %w", err)
		}
	}
	return nil
}

func peopleSearchRawTextSQL(prefix string) string {
	firstName := "LOWER(COALESCE(" + prefix + ".first_name, ''))"
	lastName := "LOWER(COALESCE(" + prefix + ".last_name, ''))"
	nickname := "LOWER(COALESCE(" + prefix + ".nickname, ''))"
	fullName := "LOWER(TRIM(COALESCE(" + prefix + ".first_name, '') || ' ' || COALESCE(" + prefix + ".last_name, '')))"

	return strings.Join(
		[]string{firstName, lastName, nickname, fullName},
		" || "+peopleSearchSeparator+" || ",
	)
}

func peopleSearchNormalizeStatementsSQL(whereClause string) []string {
	replacements := textsearch.SQLReplacementPairs()
	statements := make([]string, 0, (len(replacements)+peopleSearchReplaceBatchSize-1)/peopleSearchReplaceBatchSize)

	for start := 0; start < len(replacements); start += peopleSearchReplaceBatchSize {
		end := start + peopleSearchReplaceBatchSize
		if end > len(replacements) {
			end = len(replacements)
		}

		expression := "search_text"
		for _, replacement := range replacements[start:end] {
			expression = "REPLACE(" + expression + ", '" + replacement[0] + "', '" + replacement[1] + "')"
		}

		statement := "UPDATE people_search_index SET search_text = " + expression
		if whereClause != "" {
			statement += " WHERE " + whereClause
		}
		statements = append(statements, statement)
	}

	return statements
}

func peopleSearchTriggerSQL(name, event string) string {
	statements := []string{
		`INSERT INTO people_search_index (person_id, tenant_id, search_text)
		 VALUES (NEW.id, NEW.tenant_id, ` + peopleSearchRawTextSQL("NEW") + `)
		 ON CONFLICT(person_id) DO UPDATE SET
		   tenant_id = excluded.tenant_id,
		   search_text = excluded.search_text`,
	}
	statements = append(statements, peopleSearchNormalizeStatementsSQL("person_id = NEW.id")...)

	return "CREATE TRIGGER " + name + "\n " + event + "\n BEGIN\n   " + strings.Join(statements, ";\n   ") + ";\n END"
}
