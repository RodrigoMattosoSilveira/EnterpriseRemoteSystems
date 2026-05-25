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
			Type:      "person_status", Code: "ACTIVE", Label: "Active",
			Description: "Currently under contract", Active: true, SortOrder: 10,
		},
		{
			BaseModel: BaseModel{ID: "ref-person-status-inactive", CreatedAt: now, UpdatedAt: now},
			Type:      "person_status", Code: "INACTIVE", Label: "Inactive",
			Description: "Out of contract but eligible to return", Active: true, SortOrder: 20,
		},
		{
			BaseModel: BaseModel{ID: "ref-person-status-discontinued", CreatedAt: now, UpdatedAt: now},
			Type:      "person_status", Code: "DISCONTINUED", Label: "Discontinued",
			Description: "Out of contract and not expected to return", Active: true, SortOrder: 30,
		},
	}

	for _, row := range rows {
		if err := database.Where("id = ?", row.ID).FirstOrCreate(&row).Error; err != nil {
			return err
		}
	}

	return nil
}
