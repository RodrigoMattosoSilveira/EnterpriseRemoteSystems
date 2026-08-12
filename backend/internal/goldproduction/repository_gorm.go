package goldproduction

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) ListByWorkPeriod(ctx context.Context, workPeriodID string, filter normalizedGoldProductionEntryListFilter) ([]db.GoldProductionEntry, int64, error) {
	var rows []db.GoldProductionEntry
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.GoldProductionEntry{}).
		Where("tenant_id = ? AND work_period_id = ?", tenantctx.TenantID(ctx), workPeriodID).
		Preload("Location")

	if !filter.IncludeInactive {
		q = q.Where("active = ?", true)
	}
	if filter.LocationID != "" {
		q = q.Where("location_id = ?", filter.LocationID)
	}
	if filter.DateFrom != nil {
		q = q.Where("production_date >= ?", *filter.DateFrom)
	}
	if filter.DateTo != nil {
		q = q.Where("production_date <= ?", *filter.DateTo)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := q.Order("production_date ASC, created_at ASC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) Create(ctx context.Context, entry *db.GoldProductionEntry) error {
	return r.db.WithContext(ctx).Create(entry).Error
}

func (r *gormRepository) Update(ctx context.Context, entry *db.GoldProductionEntry) error {
	return r.db.WithContext(ctx).
		Model(&db.GoldProductionEntry{}).
		Where("id = ? AND tenant_id = ?", entry.ID, tenantctx.TenantID(ctx)).
		Updates(map[string]any{
			"location_id":         entry.LocationID,
			"production_date":     entry.ProductionDate,
			"gold_grams_produced": entry.GoldGramsProduced,
			"active":              entry.Active,
			"notes":               entry.Notes,
			"updated_at":          entry.UpdatedAt,
		}).Error
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.GoldProductionEntry, error) {
	var row db.GoldProductionEntry
	err := r.db.WithContext(ctx).
		Preload("WorkPeriod").
		Preload("Location").
		First(&row, "id = ? AND tenant_id = ?", id, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindWorkPeriodByID(ctx context.Context, id string) (*db.WorkPeriod, error) {
	var row db.WorkPeriod
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", id, tenantctx.TenantID(ctx)).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ExistsActiveLocation(ctx context.Context, id string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.ReferenceData{}).
		Where("id = ? AND tenant_id = ? AND type = ? AND active = ?", id, tenantctx.TenantID(ctx), "location", true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) ExistsActiveEntryForPeriodLocationDate(ctx context.Context, workPeriodID string, locationID string, productionDate time.Time, excludeID string) (bool, error) {
	var count int64
	q := r.db.WithContext(ctx).
		Model(&db.GoldProductionEntry{}).
		Where("tenant_id = ? AND work_period_id = ? AND location_id = ? AND production_date = ? AND active = ?", tenantctx.TenantID(ctx), workPeriodID, locationID, productionDate, true)
	if excludeID != "" {
		q = q.Where("id <> ?", excludeID)
	}
	err := q.Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
