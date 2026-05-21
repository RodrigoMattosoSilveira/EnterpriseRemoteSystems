package referencedata

import (
	"context"
	"gorm.io/gorm"
	"enterpriseremotesystems/backend/internal/db"
)

type gormRepository struct{ database *gorm.DB }

func NewGormRepository(database *gorm.DB) Repository { return &gormRepository{database: database} }
func (r *gormRepository) ListByType(ctx context.Context, typ string) ([]db.ReferenceData, error) {
	var rows []db.ReferenceData
	err := r.database.WithContext(ctx).Where("type = ?", typ).Order("sort_order asc, label asc").Find(&rows).Error
	return rows, err
}
func (r *gormRepository) Create(ctx context.Context, item *db.ReferenceData) error {
	return r.database.WithContext(ctx).Create(item).Error
}
