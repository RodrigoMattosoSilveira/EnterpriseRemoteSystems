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

// InstallPeopleSearchIndex installs a derived search projection keyed by the
// canonical Person-Tenant Membership. The table is disposable and rebuilt at
// startup, so Bite 30K.1 can cut live search reads over without removing the
// legacy people table that remains for compatibility until 30K.3B.
func InstallPeopleSearchIndex(database *gorm.DB) error {
	statements := []string{
		`DROP TRIGGER IF EXISTS trg_people_search_index_insert`,
		`DROP TRIGGER IF EXISTS trg_people_search_index_update`,
		`DROP TRIGGER IF EXISTS trg_people_search_index_delete`,
		`DROP TRIGGER IF EXISTS trg_person_membership_search_index_insert`,
		`DROP TRIGGER IF EXISTS trg_person_membership_search_index_update`,
		`DROP TRIGGER IF EXISTS trg_person_membership_search_index_delete`,
		`DROP TRIGGER IF EXISTS trg_global_person_search_index_update`,
		`DROP TABLE IF EXISTS people_search_index`,
		`CREATE TABLE people_search_index (
			membership_id TEXT PRIMARY KEY,
			person_id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			search_text TEXT NOT NULL,
			FOREIGN KEY (membership_id) REFERENCES person_tenant_memberships(id) ON UPDATE CASCADE ON DELETE CASCADE,
			FOREIGN KEY (person_id) REFERENCES global_people(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
			FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT
		)`,
		`CREATE INDEX idx_people_search_index_tenant
			ON people_search_index (tenant_id, membership_id)`,
		`CREATE INDEX idx_people_search_index_person
			ON people_search_index (person_id, tenant_id)`,
		`INSERT INTO people_search_index (membership_id, person_id, tenant_id, search_text)
		 SELECT m.id, m.person_id, m.tenant_id, ` + peopleSearchRawTextSQL("gp") + `
		   FROM person_tenant_memberships m
		   JOIN global_people gp ON gp.id = m.person_id`,
	}
	statements = append(statements, peopleSearchNormalizeStatementsSQL("")...)
	statements = append(statements,
		peopleMembershipSearchTriggerSQL("trg_person_membership_search_index_insert", "AFTER INSERT ON person_tenant_memberships"),
		peopleMembershipSearchTriggerSQL("trg_person_membership_search_index_update", "AFTER UPDATE OF person_id, tenant_id ON person_tenant_memberships"),
		`CREATE TRIGGER trg_person_membership_search_index_delete
		 AFTER DELETE ON person_tenant_memberships
		 BEGIN
		   DELETE FROM people_search_index WHERE membership_id = OLD.id;
		 END`,
		peopleGlobalSearchUpdateTriggerSQL(),
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

func peopleMembershipSearchTriggerSQL(name, event string) string {
	statements := []string{
		`INSERT INTO people_search_index (membership_id, person_id, tenant_id, search_text)
		 SELECT NEW.id, NEW.person_id, NEW.tenant_id, ` + peopleSearchRawTextSQL("gp") + `
		   FROM global_people gp
		  WHERE gp.id = NEW.person_id
		 ON CONFLICT(membership_id) DO UPDATE SET
		   person_id = excluded.person_id,
		   tenant_id = excluded.tenant_id,
		   search_text = excluded.search_text`,
	}
	statements = append(statements, peopleSearchNormalizeStatementsSQL("membership_id = NEW.id")...)
	return "CREATE TRIGGER " + name + "\n " + event + "\n BEGIN\n   " + strings.Join(statements, ";\n   ") + ";\n END"
}

func peopleGlobalSearchUpdateTriggerSQL() string {
	statements := []string{
		`UPDATE people_search_index
		   SET search_text = ` + peopleSearchRawTextSQL("NEW") + `
		 WHERE person_id = NEW.id`,
	}
	statements = append(statements, peopleSearchNormalizeStatementsSQL("person_id = NEW.id")...)
	return "CREATE TRIGGER trg_global_person_search_index_update\n AFTER UPDATE OF first_name, last_name, nickname ON global_people\n BEGIN\n   " + strings.Join(statements, ";\n   ") + ";\n END"
}
