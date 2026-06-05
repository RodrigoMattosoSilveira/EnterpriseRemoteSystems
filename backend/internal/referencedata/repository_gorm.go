package referencedata

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type gormRepository struct{ database *gorm.DB }

func NewGormRepository(database *gorm.DB) Repository { return &gormRepository{database: database} }

func (r *gormRepository) ListByType(ctx context.Context, tenantID string, typ string) ([]db.ReferenceData, error) {
	var rows []db.ReferenceData
	err := r.database.WithContext(ctx).
		Where("tenant_id = ? AND type = ?", tenantID, typ).
		Order("sort_order asc, label asc").
		Find(&rows).Error
	return rows, err
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	if err := r.database.WithContext(ctx).First(&row, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) Create(ctx context.Context, item *db.ReferenceData) error {
	return r.database.WithContext(ctx).Create(item).Error
}

func (r *gormRepository) Update(ctx context.Context, item *db.ReferenceData) error {
	return r.database.WithContext(ctx).Save(item).Error
}

func (r *gormRepository) ExistsByTenantTypeCode(ctx context.Context, tenantID string, typ string, code string, excludeID string) (bool, error) {
	return r.exists(ctx, tenantID, typ, "code", code, excludeID)
}

func (r *gormRepository) ExistsByTenantTypeLabel(ctx context.Context, tenantID string, typ string, label string, excludeID string) (bool, error) {
	return r.exists(ctx, tenantID, typ, "label", label, excludeID)
}

func (r *gormRepository) exists(ctx context.Context, tenantID string, typ string, column string, value string, excludeID string) (bool, error) {
	var count int64
	q := r.database.WithContext(ctx).
		Model(&db.ReferenceData{}).
		Where("tenant_id = ? AND type = ? AND "+column+" = ?", tenantID, typ, value)
	if excludeID != "" {
		q = q.Where("id <> ?", excludeID)
	}
	if err := q.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) ExistsActiveTenantByID(ctx context.Context, tenantID string) (bool, error) {
	var count int64
	err := r.database.WithContext(ctx).
		Model(&db.Tenant{}).
		Where("id = ? AND active = ?", tenantID, true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
