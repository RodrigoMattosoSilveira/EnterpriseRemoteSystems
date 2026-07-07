package workperiods

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) List(ctx context.Context, filter normalizedWorkPeriodListFilter) ([]db.WorkPeriod, int64, error) {
	var rows []db.WorkPeriod
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.WorkPeriod{}).
		Where("tenant_id = ?", defaultTenantID)

	if filter.DateFrom != nil {
		q = q.Where("work_date >= ?", formatDateForQuery(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where("work_date < ?", formatDateForQuery(filter.DateTo.AddDate(0, 0, 1)))
	}
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := q.Order("work_date DESC, starts_at ASC, period_code ASC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) Create(ctx context.Context, workPeriod *db.WorkPeriod) error {
	return r.db.WithContext(ctx).Create(workPeriod).Error
}

func (r *gormRepository) ExistsByDateAndCode(ctx context.Context, workDate time.Time, periodCode string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.WorkPeriod{}).
		Where("tenant_id = ? AND date(work_date) = ? AND period_code = ?", defaultTenantID, formatDateForQuery(workDate), periodCode).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) Update(ctx context.Context, workPeriod *db.WorkPeriod) error {
	return r.db.WithContext(ctx).
		Model(&db.WorkPeriod{}).
		Where("id = ? AND tenant_id = ?", workPeriod.ID, defaultTenantID).
		Updates(map[string]any{
			"work_date":         workPeriod.WorkDate,
			"period_code":       workPeriod.PeriodCode,
			"name":              workPeriod.Name,
			"starts_at":         workPeriod.StartsAt,
			"ends_at":           workPeriod.EndsAt,
			"status":            workPeriod.Status,
			"informed_at":       workPeriod.InformedAt,
			"accrual_opened_at": workPeriod.AccrualOpenedAt,
			"closed_at":         workPeriod.ClosedAt,
			"updated_at":        workPeriod.UpdatedAt,
		}).Error
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.WorkPeriod, error) {
	var row db.WorkPeriod
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func formatDateForQuery(value time.Time) string {
	return value.Format(dateLayout)
}

func (r *gormRepository) ListIncludedAssignmentsForRoster(ctx context.Context, workPeriodID string) ([]db.WorkPeriodAssignment, error) {
	var rows []db.WorkPeriodAssignment
	err := r.db.WithContext(ctx).
		Model(&db.WorkPeriodAssignment{}).
		Where("tenant_id = ? AND work_period_id = ? AND active = ? AND planned_status = ?", defaultTenantID, workPeriodID, true, "INCLUDED").
		Preload("Collaborator.Person").
		Preload("Sector").
		Preload("Location").
		Preload("Task").
		Order("collaborator_id ASC").
		Find(&rows).Error
	return rows, err
}
