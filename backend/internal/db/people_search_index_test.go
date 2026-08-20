package db

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestPeopleSearchIndexTracksAccentInsensitivePersonNames(t *testing.T) {
	database, err := Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("get sql database: %v", err)
	}
	defer sqlDB.Close()

	if err := AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	if err := SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	now := time.Now().UTC()
	person := Person{
		BaseModel: BaseModel{
			ID:        "person-search-index-test",
			CreatedAt: now,
			UpdatedAt: now,
		},
		TenantID:                DefaultTenantID,
		FirstName:               "João",
		LastName:                "D'Ávila",
		Nickname:                "Áurea",
		CPF:                     "12345678901",
		RG:                      "SEARCH-INDEX-RG",
		Cellular:                "11999990001",
		Email:                   "search-index@example.test",
		Country:                 "Brasil",
		ProfileCompletionStatus: "COMPLETE",
		StatusID:                "ref-person-status-active",
	}
	if err := database.Create(&person).Error; err != nil {
		t.Fatalf("create person: %v", err)
	}

	assertSearchProjectionContains(t, database, person.ID, "joao")
	assertSearchProjectionContains(t, database, person.ID, "d'avila")
	assertSearchProjectionContains(t, database, person.ID, "aurea")
	assertSearchProjectionContains(t, database, person.ID, "joao d'avila")

	if err := database.Model(&Person{}).
		Where("id = ?", person.ID).
		Updates(map[string]any{
			"first_name": "María",
			"nickname":   "Mína",
			"updated_at": now.Add(time.Minute),
		}).Error; err != nil {
		t.Fatalf("update person names: %v", err)
	}

	assertSearchProjectionContains(t, database, person.ID, "maria")
	assertSearchProjectionContains(t, database, person.ID, "mina")
}

func assertSearchProjectionContains(t *testing.T, database *gorm.DB, personID, want string) {
	t.Helper()

	var searchText string
	if err := database.Raw(
		"SELECT search_text FROM people_search_index WHERE person_id = ?",
		personID,
	).Scan(&searchText).Error; err != nil {
		t.Fatalf("read search projection: %v", err)
	}
	if !strings.Contains(searchText, want) {
		t.Fatalf("expected search projection %q to contain %q", searchText, want)
	}
}
