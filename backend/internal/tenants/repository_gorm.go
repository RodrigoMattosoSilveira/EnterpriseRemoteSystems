package tenants

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type gormRepository struct{ database *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{database: database} }

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.Tenant, error) {
	var tenant db.Tenant
	if err := r.database.WithContext(ctx).First(&tenant, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &tenant, nil
}

func (r *gormRepository) ExistsActiveByID(ctx context.Context, id string) (bool, error) {
	var count int64
	err := r.database.WithContext(ctx).
		Model(&db.Tenant{}).
		Where("id = ? AND active = ?", id, true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
