package db

import (
	"time"

	"gorm.io/gorm"
)

func SeedTenants(database *gorm.DB) error {
	now := time.Now().UTC()

	tenant := Tenant{
		BaseModel: BaseModel{
			ID:        DefaultTenantID,
			CreatedAt: now,
			UpdatedAt: now,
		},
		Code:        "DEFAULT",
		Name:        "Default Tenant",
		Description: "Default tenant used until tenant selection is introduced",
		Active:      true,
	}

	return database.Where("id = ?", tenant.ID).FirstOrCreate(&tenant).Error
}

func SeedReferenceData(database *gorm.DB) error {
	if err := SeedTenants(database); err != nil {
		return err
	}

	now := time.Now().UTC()

	rows := []ReferenceData{
		{
			BaseModel: BaseModel{ID: "ref-person-status-active", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "person_status", Code: "ACTIVE", Label: "Active",
			Description: "Currently under contract", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-person-status-inactive", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "person_status", Code: "INACTIVE", Label: "Inactive",
			Description: "Out of contract but eligible to return", Active: true, SortOrder: 20,
		},
		{
			BaseModel: BaseModel{ID: "ref-person-status-discontinued", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "person_status", Code: "DISCONTINUED", Label: "Discontinued",
			Description: "Out of contract and not expected to return", Active: true, SortOrder: 30,
		},
		{
			BaseModel: BaseModel{ID: "ref-collaborator-status-active", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "collaborator_status", Code: "ACTIVE", Label: "Active",
			Description: "Active collaborator journey", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-collaborator-status-finished", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "collaborator_status", Code: "FINISHED", Label: "Finished",
			Description: "Finished collaborator journey", Active: true, SortOrder: 20,
		},
		{
			BaseModel: BaseModel{ID: "ref-method-daily", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "method", Code: "DAILY", Label: "Daily wage",
			Description: "Paid by daily wage", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-method-salary", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "method", Code: "SALARY", Label: "Salary",
			Description: "Paid by salary", Active: true, SortOrder: 20,
		},
		{
			BaseModel: BaseModel{ID: "ref-method-commission", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "method", Code: "COMMISSION", Label: "Commission",
			Description: "Paid by production commission", Active: true, SortOrder: 30,
		},
		{
			BaseModel: BaseModel{ID: "ref-sector-mining", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "sector", Code: "MINING", Label: "Mining",
			Description: "Mining operations", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-location-main-mine", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "location", Code: "MAIN_MINE", Label: "Main Mine",
			Description: "Default mine location", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-task-miner", CreatedAt: now, UpdatedAt: now},
			TenantID:  DefaultTenantID,
			Type:      "task", Code: "MINER", Label: "Miner",
			Description: "Mining collaborator task", Active: true, SortOrder: 10,
		},
		{
			BaseModel:   BaseModel{ID: "ref-expense-category-canteen", CreatedAt: now, UpdatedAt: now},
			TenantID:    DefaultTenantID,
			Type:        "expense_category",
			Code:        "CANTEEN",
			Label:       "Canteen",
			Description: "Canteen expense", Active: true, SortOrder: 10,
		},
		{
			BaseModel:   BaseModel{ID: "ref-expense-category-flight", CreatedAt: now, UpdatedAt: now},
			TenantID:    DefaultTenantID,
			Type:        "expense_category",
			Code:        "FLIGHT",
			Label:       "Flight",
			Description: "Flight expense", Active: true, SortOrder: 20,
		},
		{
			BaseModel:   BaseModel{ID: "ref-expense-category-cargo", CreatedAt: now, UpdatedAt: now},
			TenantID:    DefaultTenantID,
			Type:        "expense_category",
			Code:        "CARGO",
			Label:       "Cargo",
			Description: "Cargo expense", Active: true, SortOrder: 30,
		},
		{
			BaseModel:   BaseModel{ID: "ref-expense-category-other", CreatedAt: now, UpdatedAt: now},
			TenantID:    DefaultTenantID,
			Type:        "expense_category",
			Code:        "OTHER",
			Label:       "Other",
			Description: "Other expense", Active: true, SortOrder: 40,
		},
		{
			BaseModel:   BaseModel{ID: "ref-value-unit-brl", CreatedAt: now, UpdatedAt: now},
			TenantID:    DefaultTenantID,
			Type:        "value_unit",
			Code:        "BRL",
			Label:       "Brazilian Real",
			Description: "Brazilian Real monetary value", Active: true, SortOrder: 10,
		},
		{
			BaseModel:   BaseModel{ID: "ref-value-unit-gold-gram", CreatedAt: now, UpdatedAt: now},
			TenantID:    DefaultTenantID,
			Type:        "value_unit",
			Code:        "GOLD_GRAM",
			Label:       "Gold Gram",
			Description: "Grams of gold", Active: true, SortOrder: 20,
		},
	}

	for _, row := range rows {
		if err := database.Where("id = ?", row.ID).FirstOrCreate(&row).Error; err != nil {
			return err
		}
	}

	return nil
}
