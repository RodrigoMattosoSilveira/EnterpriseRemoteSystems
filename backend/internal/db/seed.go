package db

import (
	"time"

	"gorm.io/gorm"
)

func SeedReferenceData(database *gorm.DB) error {
	now := time.Now().UTC()
	rows := []ReferenceData{
		{
			BaseModel: BaseModel{ID: "ref-person-status-active", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "person_status", Code: "ACTIVE", Label: "Active",
			Description: "Currently under contract", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-person-status-inactive", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "person_status", Code: "INACTIVE", Label: "Inactive",
			Description: "Out of contract but eligible to return", Active: true, SortOrder: 20,
		},
		{
			BaseModel: BaseModel{ID: "ref-person-status-discontinued", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "person_status", Code: "DISCONTINUED", Label: "Discontinued",
			Description: "Out of contract and not expected to return", Active: true, SortOrder: 30,
		},
		{
			BaseModel: BaseModel{ID: "ref-collaborator-status-active", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "collaborator_status", Code: "ACTIVE", Label: "Active",
			Description: "Active collaborator journey", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-collaborator-status-finished", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "collaborator_status", Code: "FINISHED", Label: "Finished",
			Description: "Finished collaborator journey", Active: true, SortOrder: 20,
		},
		{
			BaseModel: BaseModel{ID: "ref-method-daily", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "method", Code: "DAILY", Label: "Daily wage",
			Description: "Paid by daily wage", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-method-salary", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "method", Code: "SALARY", Label: "Salary",
			Description: "Paid by salary", Active: true, SortOrder: 20,
		},
		{
			BaseModel: BaseModel{ID: "ref-method-commission", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "method", Code: "COMMISSION", Label: "Commission",
			Description: "Paid by production commission", Active: true, SortOrder: 30,
		},
		{
			BaseModel: BaseModel{ID: "ref-sector-mining", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "sector", Code: "MINING", Label: "Mining",
			Description: "Mining operations", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-location-main-mine", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "location", Code: "MAIN_MINE", Label: "Main Mine",
			Description: "Default mine location", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-task-miner", CreatedAt: now, UpdatedAt: now},
			TenantID:  "default",
			Type:      "task", Code: "MINER", Label: "Miner",
			Description: "Mining collaborator task", Active: true, SortOrder: 10,
		},
	}

	for _, row := range rows {
		if err := database.Where("id = ?", row.ID).FirstOrCreate(&row).Error; err != nil {
			return err
		}
	}

	return nil
}
