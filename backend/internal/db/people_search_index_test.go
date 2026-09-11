package db

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestPeopleSearchIndexTracksCanonicalMembershipAndGlobalPersonNames(t *testing.T) {
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
	person := GlobalPerson{
		BaseModel: BaseModel{ID: "global-person-search-index-test", CreatedAt: now, UpdatedAt: now},
		FirstName: "João", LastName: "D'Ávila", Nickname: "Áurea",
		CPF: "12345678901", RG: "SEARCH-INDEX-RG", Cellular: "11999990001",
		Email: "search-index@example.test", Country: "Brasil",
		ProfileCompletionStatus: "COMPLETE", OperationalActive: true,
	}
	if err := database.Create(&person).Error; err != nil {
		t.Fatalf("create global person: %v", err)
	}
	membership := PersonTenantMembership{
		BaseModel: BaseModel{ID: "membership-search-index-test", CreatedAt: now, UpdatedAt: now},
		TenantID:  DefaultTenantID, PersonID: person.ID, StatusID: "ref-person-status-active",
	}
	if err := database.Create(&membership).Error; err != nil {
		t.Fatalf("create membership: %v", err)
	}

	assertSearchProjectionContains(t, database, membership.ID, "joao")
	assertSearchProjectionContains(t, database, membership.ID, "d'avila")
	assertSearchProjectionContains(t, database, membership.ID, "aurea")
	assertSearchProjectionContains(t, database, membership.ID, "joao d'avila")

	if err := database.Model(&GlobalPerson{}).
		Where("id = ?", person.ID).
		Updates(map[string]any{
			"first_name": "María",
			"nickname":   "Mína",
			"updated_at": now.Add(time.Minute),
		}).Error; err != nil {
		t.Fatalf("update global person names: %v", err)
	}

	assertSearchProjectionContains(t, database, membership.ID, "maria")
	assertSearchProjectionContains(t, database, membership.ID, "mina")
}

func assertSearchProjectionContains(t *testing.T, database *gorm.DB, membershipID, want string) {
	t.Helper()

	var searchText string
	if err := database.Raw(
		"SELECT search_text FROM people_search_index WHERE membership_id = ?",
		membershipID,
	).Scan(&searchText).Error; err != nil {
		t.Fatalf("read search projection: %v", err)
	}
	if !strings.Contains(searchText, want) {
		t.Fatalf("expected search projection %q to contain %q", searchText, want)
	}
}
