package db

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"
)

func TestBackfillLegacyExpenseAuditSnapshotsClassifiesLegacyRows(t *testing.T) {
	database, err := Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate database: %v", err)
	}
	if err := SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	now := time.Now().UTC()
	globalPerson := GlobalPerson{
		BaseModel:               BaseModel{ID: "legacy-backfill-global-person", CreatedAt: now, UpdatedAt: now},
		FirstName:               "Legacy",
		LastName:                "Backfill",
		Nickname:                "LegacyBackfill",
		CPF:                     "11122233344",
		RG:                      "RGBACK-GLOBAL",
		Cellular:                "11999990001",
		Email:                   "legacy-backfill-global@example.com",
		Country:                 "Brasil",
		ProfileCompletionStatus: "COMPLETE",
		CanCreateCollaborator:   true,
	}
	if err := database.Create(&globalPerson).Error; err != nil {
		t.Fatalf("create global person: %v", err)
	}

	person := Person{
		BaseModel:               BaseModel{ID: "legacy-backfill-person", CreatedAt: now, UpdatedAt: now},
		TenantID:                DefaultTenantID,
		FirstName:               "Legacy",
		LastName:                "Backfill",
		Nickname:                "LegacyBackfill",
		CPF:                     "11122233344",
		RG:                      "RGBACK123",
		Cellular:                "11999990000",
		Email:                   "legacy-backfill@example.com",
		ProfileCompletionStatus: "COMPLETE",
		CanCreateCollaborator:   true,
		StatusID:                "ref-person-status-active",
	}
	if err := database.Create(&person).Error; err != nil {
		t.Fatalf("create person: %v", err)
	}

	journeyStart := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	collaborator := CollaboratorJourney{
		BaseModel:        BaseModel{ID: "legacy-backfill-collaborator", CreatedAt: now, UpdatedAt: now},
		TenantID:         DefaultTenantID,
		PersonID:         person.ID,
		JourneyStartDate: journeyStart,
		DefaultEndDate:   journeyStart.AddDate(0, 0, 90),
		ProjectedEndDate: journeyStart.AddDate(0, 0, 90),
		PaymentMethodID:  "ref-method-daily",
		PaymentValue:     100,
		SectorID:         "ref-sector-mining",
		LocationID:       "ref-location-main-mine",
		TaskID:           "ref-task-miner",
		StatusID:         "ref-collaborator-status-active",
	}
	if err := database.Create(&collaborator).Error; err != nil {
		t.Fatalf("create collaborator: %v", err)
	}

	canteenExpense := Expense{
		BaseModel:         BaseModel{ID: "legacy-canteen-expense", CreatedAt: now, UpdatedAt: now},
		TenantID:          DefaultTenantID,
		PersonID:          globalPerson.ID,
		CollaboratorID:    collaborator.ID,
		ExpenseCategoryID: "ref-expense-category-canteen",
		ValueUnitID:       "ref-value-unit-brl",
		Amount:            42.50,
		ExpenseDate:       journeyStart,
		Description:       "Legacy canteen lunch",
		Active:            true,
	}
	flightExpense := Expense{
		BaseModel:         BaseModel{ID: "legacy-flight-expense", CreatedAt: now, UpdatedAt: now},
		TenantID:          DefaultTenantID,
		PersonID:          globalPerson.ID,
		CollaboratorID:    collaborator.ID,
		ExpenseCategoryID: "ref-expense-category-flight",
		ValueUnitID:       "ref-value-unit-gold-gram",
		Amount:            1.25,
		ExpenseDate:       journeyStart,
		Description:       "Legacy flight in gold",
		Active:            true,
	}
	if err := database.Create(&canteenExpense).Error; err != nil {
		t.Fatalf("create canteen expense: %v", err)
	}
	if err := database.Create(&flightExpense).Error; err != nil {
		t.Fatalf("create flight expense: %v", err)
	}

	if err := BackfillLegacyExpenseAuditSnapshots(database); err != nil {
		t.Fatalf("backfill legacy expense snapshots: %v", err)
	}

	var canteen Expense
	if err := database.First(&canteen, "id = ?", canteenExpense.ID).Error; err != nil {
		t.Fatalf("find canteen expense: %v", err)
	}
	if canteen.PriceListItemID != nil {
		t.Fatalf("legacy backfill must not invent price list item ids, got %#v", canteen.PriceListItemID)
	}
	if canteen.PriceListItemCode != "LEGACY_CANTEEN_DIRECT_ENTRY" || canteen.ItemType != "CANTEEN" {
		t.Fatalf("expected canteen legacy classification, got code=%q itemType=%q", canteen.PriceListItemCode, canteen.ItemType)
	}
	if canteen.CurrencyCode != "BRL" || canteen.CalculationMethod != "LEGACY_DIRECT_ENTRY" {
		t.Fatalf("expected BRL legacy calculation, got currency=%q method=%q", canteen.CurrencyCode, canteen.CalculationMethod)
	}
	assertFloatPtr(t, canteen.Quantity, 1, "canteen quantity")
	assertFloatPtr(t, canteen.UnitPriceBRL, 42.50, "canteen unitPriceBrl")
	assertFloatPtr(t, canteen.UnitPriceAmount, 42.50, "canteen unitPriceAmount")
	assertFloatPtr(t, canteen.TotalAmount, 42.50, "canteen totalAmount")
	assertLegacyDetail(t, canteen.CalculationDetailsJSON, "legacyExpenseCategoryCode", "CANTEEN")
	assertLegacyDetail(t, canteen.CalculationDetailsJSON, "source", "migration_000032_backfill_legacy_expense_audit_snapshots")

	var flight Expense
	if err := database.First(&flight, "id = ?", flightExpense.ID).Error; err != nil {
		t.Fatalf("find flight expense: %v", err)
	}
	if flight.PriceListItemCode != "LEGACY_ADMINISTRATIVE_DIRECT_ENTRY" || flight.ItemType != "ADMINISTRATIVE" {
		t.Fatalf("expected administrative legacy classification, got code=%q itemType=%q", flight.PriceListItemCode, flight.ItemType)
	}
	if flight.CurrencyCode != "GOLD_GRAM" || flight.CalculationMethod != "LEGACY_DIRECT_ENTRY" {
		t.Fatalf("expected gold legacy calculation, got currency=%q method=%q", flight.CurrencyCode, flight.CalculationMethod)
	}
	if flight.UnitPriceBRL != nil {
		t.Fatalf("gold legacy expense should not invent a BRL unit price, got %#v", *flight.UnitPriceBRL)
	}
	assertFloatPtr(t, flight.Quantity, 1, "flight quantity")
	assertFloatPtr(t, flight.UnitPriceAmount, 1.25, "flight unitPriceAmount")
	assertFloatPtr(t, flight.TotalAmount, 1.25, "flight totalAmount")
	assertLegacyDetail(t, flight.CalculationDetailsJSON, "legacyExpenseCategoryCode", "FLIGHT")
}

func assertFloatPtr(t *testing.T, got *float64, want float64, label string) {
	t.Helper()
	if got == nil {
		t.Fatalf("expected %s to be %.4f, got nil", label, want)
	}
	if *got != want {
		t.Fatalf("expected %s to be %.4f, got %.4f", label, want, *got)
	}
}

func assertLegacyDetail(t *testing.T, payload string, key string, want string) {
	t.Helper()
	var details map[string]any
	if err := json.Unmarshal([]byte(payload), &details); err != nil {
		t.Fatalf("decode legacy detail JSON: %v payload=%q", err, payload)
	}
	if got, _ := details[key].(string); got != want {
		t.Fatalf("expected detail %s=%q, got %#v from %s", key, want, details[key], payload)
	}
}
