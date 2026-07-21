package db

import (
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

type referenceDataSeed struct {
	DefaultID   string
	Type        string
	Code        string
	Label       string
	Description string
	SortOrder   int
}

type expensePriceListSeed struct {
	ItemType     string
	Code         string
	Description  string
	UnitPriceBRL float64
	SortOrder    int
}

var tenantReferenceDataSeeds = []referenceDataSeed{
	{DefaultID: "ref-person-status-active", Type: "person_status", Code: "ACTIVE", Label: "Active", Description: "Currently under contract", SortOrder: 10},
	{DefaultID: "ref-person-status-inactive", Type: "person_status", Code: "INACTIVE", Label: "Inactive", Description: "Out of contract but eligible to return", SortOrder: 20},
	{DefaultID: "ref-person-status-discontinued", Type: "person_status", Code: "DISCONTINUED", Label: "Discontinued", Description: "Out of contract and not expected to return", SortOrder: 30},
	{DefaultID: "ref-collaborator-status-active", Type: "collaborator_status", Code: "ACTIVE", Label: "Active", Description: "Active collaborator journey", SortOrder: 10},
	{DefaultID: "ref-collaborator-status-finished", Type: "collaborator_status", Code: "FINISHED", Label: "Finished", Description: "Finished collaborator journey", SortOrder: 20},
	{DefaultID: "ref-method-daily", Type: "method", Code: "DAILY", Label: "Daily wage", Description: "Paid by daily wage", SortOrder: 10},
	{DefaultID: "ref-method-salary", Type: "method", Code: "SALARY", Label: "Salary", Description: "Paid by salary", SortOrder: 20},
	{DefaultID: "ref-method-commission", Type: "method", Code: "COMMISSION", Label: "Commission", Description: "Paid by production commission", SortOrder: 30},
	{DefaultID: "ref-sector-mining", Type: "sector", Code: "MINING", Label: "Mining", Description: "Mining operations", SortOrder: 10},
	{Type: "sector", Code: "UNDERGROUND_MINING", Label: "Underground Mining", Description: "Mine extraction and underground production work", SortOrder: 20},
	{Type: "sector", Code: "PROCESSING", Label: "Processing", Description: "Ore handling, processing, and production support", SortOrder: 30},
	{Type: "sector", Code: "SITE_SUPPORT", Label: "Site Support", Description: "Logistics, supplies, and camp/site support work", SortOrder: 40},
	{Type: "sector", Code: "MAINTENANCE", Label: "Maintenance", Description: "Equipment, infrastructure, and site maintenance work", SortOrder: 50},
	{DefaultID: "ref-location-main-mine", Type: "location", Code: "MAIN_MINE", Label: "Main Mine", Description: "Default mine location", SortOrder: 10},
	{Type: "location", Code: "NORTH_PIT", Label: "North Pit", Description: "North production area", SortOrder: 20},
	{Type: "location", Code: "SOUTH_PIT", Label: "South Pit", Description: "South production area", SortOrder: 30},
	{Type: "location", Code: "PROCESSING_PLANT", Label: "Processing Plant", Description: "Ore and gold processing area", SortOrder: 40},
	{Type: "location", Code: "CAMP", Label: "Camp", Description: "Camp and lodging area", SortOrder: 50},
	{DefaultID: "ref-task-miner", Type: "task", Code: "MINER", Label: "Miner", Description: "Mining collaborator task", SortOrder: 10},
	{Type: "task", Code: "DRILLING", Label: "Drilling", Description: "Drilling and preparation work", SortOrder: 20},
	{Type: "task", Code: "HAULING", Label: "Hauling", Description: "Hauling ore, supplies, or site materials", SortOrder: 30},
	{Type: "task", Code: "GOLD_PROCESSING", Label: "Gold Processing", Description: "Gold processing and production support", SortOrder: 40},
	{Type: "task", Code: "EQUIPMENT_MAINTENANCE", Label: "Equipment Maintenance", Description: "Equipment inspection, repair, and maintenance", SortOrder: 50},
	{Type: "task", Code: "CAMP_SUPPORT", Label: "Camp Support", Description: "Camp support, meals, cleaning, and logistics", SortOrder: 60},
	{DefaultID: "ref-expense-category-canteen", Type: "expense_category", Code: "CANTEEN", Label: "Canteen", Description: "Canteen expense", SortOrder: 10},
	{DefaultID: "ref-expense-category-flight", Type: "expense_category", Code: "FLIGHT", Label: "Flight", Description: "Flight expense", SortOrder: 20},
	{DefaultID: "ref-expense-category-cargo", Type: "expense_category", Code: "CARGO", Label: "Cargo", Description: "Cargo expense", SortOrder: 30},
	{DefaultID: "ref-expense-category-administrative", Type: "expense_category", Code: "ADMINISTRATIVE", Label: "Administrative", Description: "Administrative price-list expense", SortOrder: 35},
	{DefaultID: "ref-expense-category-other", Type: "expense_category", Code: "OTHER", Label: "Other", Description: "Other expense", SortOrder: 40},
	{DefaultID: "ref-value-unit-brl", Type: "value_unit", Code: "BRL", Label: "Brazilian Real", Description: "Brazilian Real monetary value", SortOrder: 10},
	{DefaultID: "ref-value-unit-gold-gram", Type: "value_unit", Code: "GOLD_GRAM", Label: "Gold Gram", Description: "Grams of gold", SortOrder: 20},
}

var tenantExpensePriceListSeeds = []expensePriceListSeed{
	{ItemType: "CANTEEN", Code: "CANTEEN_WATER_BOTTLE", Description: "Water bottle", UnitPriceBRL: 7.50, SortOrder: 10},
	{ItemType: "CANTEEN", Code: "CANTEEN_MEAL", Description: "Meal", UnitPriceBRL: 35.00, SortOrder: 20},
	{ItemType: "CANTEEN", Code: "CANTEEN_SNACK", Description: "Canteen snack", UnitPriceBRL: 12.25, SortOrder: 30},
	{ItemType: "ADMINISTRATIVE", Code: "ADMINISTRATIVE_PROCESSING_FEE", Description: "Administrative processing fee", UnitPriceBRL: 25.00, SortOrder: 10},
	{ItemType: "ADMINISTRATIVE", Code: "ADMINISTRATIVE_DOCUMENT_COPY", Description: "Document copy or print", UnitPriceBRL: 2.50, SortOrder: 20},
}

func SeedTenants(database *gorm.DB) error {
	now := time.Now().UTC()
	tenant := Tenant{
		BaseModel: BaseModel{ID: DefaultTenantID, CreatedAt: now, UpdatedAt: now},
		Code:      "DEFAULT", Name: "Default Tenant",
		Description: "Default tenant used until tenant selection is introduced",
		Active:      true,
	}
	return database.Where("id = ?", tenant.ID).FirstOrCreate(&tenant).Error
}

// SeedReferenceData retains the historic startup entry point, but now provisions
// the tenant-scoped reference baseline for every tenant. Non-default tenants also
// receive starter price-list data. The default tenant's price list remains owned
// by migration 000031 so AutoMigrate-based tests preserve their historic setup.
func SeedReferenceData(database *gorm.DB) error {
	if err := SeedTenants(database); err != nil {
		return err
	}

	var tenants []Tenant
	if err := database.Order("id ASC").Find(&tenants).Error; err != nil {
		return fmt.Errorf("list tenants for seed provisioning: %w", err)
	}
	for _, tenant := range tenants {
		if err := seedTenantData(database, tenant.ID, tenant.ID != DefaultTenantID); err != nil {
			return fmt.Errorf("seed tenant %s: %w", tenant.ID, err)
		}
	}
	return nil
}

// SeedTenantData provisions the complete baseline for a newly created tenant.
// Existing natural keys are never overwritten, preserving tenant administrator
// renames, deactivations, and price revisions.
func SeedTenantData(database *gorm.DB, tenantID string) error {
	return seedTenantData(database, tenantID, true)
}

func seedTenantData(database *gorm.DB, tenantID string, includePriceList bool) error {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" || tenantID == "*" {
		return fmt.Errorf("a specific tenant id is required for seed provisioning")
	}

	return database.Transaction(func(tx *gorm.DB) error {
		var tenant Tenant
		if err := tx.First(&tenant, "id = ?", tenantID).Error; err != nil {
			return fmt.Errorf("find tenant: %w", err)
		}
		now := time.Now().UTC()
		for _, seed := range tenantReferenceDataSeeds {
			if tenantID == DefaultTenantID && seed.DefaultID == "" {
				continue
			}
			id := tenantSeedID("ref", tenantID, seed.Type, seed.Code)
			if tenantID == DefaultTenantID && seed.DefaultID != "" {
				id = seed.DefaultID
			}
			row := ReferenceData{
				BaseModel: BaseModel{ID: id, CreatedAt: now, UpdatedAt: now},
				TenantID:  tenantID, Type: seed.Type, Code: seed.Code, Label: seed.Label,
				Description: seed.Description, Active: true, SortOrder: seed.SortOrder,
			}
			if err := tx.Where("tenant_id = ? AND type = ? AND code = ?", tenantID, seed.Type, seed.Code).
				FirstOrCreate(&row).Error; err != nil {
				return fmt.Errorf("seed reference data %s/%s: %w", seed.Type, seed.Code, err)
			}
		}

		if !includePriceList {
			return nil
		}
		for _, seed := range tenantExpensePriceListSeeds {
			row := ExpensePriceListItem{
				BaseModel: BaseModel{ID: tenantSeedID("expense-price-list", tenantID, seed.ItemType, seed.Code), CreatedAt: now, UpdatedAt: now},
				TenantID:  tenantID, ItemType: seed.ItemType, Code: seed.Code,
				Description: seed.Description, UnitPriceBRL: seed.UnitPriceBRL,
				Active: true, SortOrder: seed.SortOrder,
			}
			if err := tx.Where("tenant_id = ? AND item_type = ? AND code = ?", tenantID, seed.ItemType, seed.Code).
				FirstOrCreate(&row).Error; err != nil {
				return fmt.Errorf("seed price-list item %s/%s: %w", seed.ItemType, seed.Code, err)
			}
		}
		return nil
	})
}

func tenantSeedID(kind string, tenantID string, parts ...string) string {
	values := append([]string{"seed", kind, tenantID}, parts...)
	for i, value := range values {
		value = strings.ToLower(strings.TrimSpace(value))
		value = strings.NewReplacer("_", "-", " ", "-", "/", "-").Replace(value)
		values[i] = value
	}
	return strings.Join(values, "-")
}
