package accruals

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) ListRunsByWorkPeriod(ctx context.Context, workPeriodID string, filter normalizedAccrualRunListFilter) ([]db.AccrualRun, int64, error) {
	var rows []db.AccrualRun
	var total int64
	q := r.db.WithContext(ctx).Model(&db.AccrualRun{}).Where("tenant_id = ? AND work_period_id = ?", defaultTenantID, workPeriodID)
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("created_at DESC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) CreateRun(ctx context.Context, run *db.AccrualRun) error {
	return r.db.WithContext(ctx).Create(run).Error
}

func (r *gormRepository) UpdateRun(ctx context.Context, run *db.AccrualRun) error {
	return r.db.WithContext(ctx).Model(&db.AccrualRun{}).Where("id = ? AND tenant_id = ?", run.ID, defaultTenantID).Updates(map[string]any{"status": run.Status, "accrual_date": run.AccrualDate, "notes": run.Notes, "updated_at": run.UpdatedAt}).Error
}

func (r *gormRepository) FindRunByID(ctx context.Context, id string) (*db.AccrualRun, error) {
	var row db.AccrualRun
	err := r.db.WithContext(ctx).Preload("WorkPeriod").First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindWorkPeriodByID(ctx context.Context, id string) (*db.WorkPeriod, error) {
	var row db.WorkPeriod
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ListItemsByRun(ctx context.Context, runID string, filter normalizedAccrualItemListFilter) ([]db.AccrualItem, int64, error) {
	var rows []db.AccrualItem
	var total int64
	q := r.db.WithContext(ctx).Model(&db.AccrualItem{}).Where("tenant_id = ? AND accrual_run_id = ?", defaultTenantID, runID).Preload("Collaborator.Person")
	if filter.Status != "" {
		q = q.Where("status = ?", filter.Status)
	}
	if filter.PendingReason != "" {
		q = q.Where("pending_reason = ?", filter.PendingReason)
	}
	if filter.CollaboratorID != "" {
		q = q.Where("collaborator_id = ?", filter.CollaboratorID)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := q.Order("status ASC, created_at ASC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) ReplaceItemsForRun(ctx context.Context, run *db.AccrualRun, items []db.AccrualItem) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id = ? AND accrual_run_id = ? AND status <> ?", defaultTenantID, run.ID, ItemStatusPosted).Delete(&db.AccrualItem{}).Error; err != nil {
			return err
		}
		if len(items) > 0 {
			if err := tx.Create(&items).Error; err != nil {
				return err
			}
		}
		return tx.Model(&db.AccrualRun{}).Where("id = ? AND tenant_id = ?", run.ID, defaultTenantID).Updates(map[string]any{"status": run.Status, "updated_at": run.UpdatedAt}).Error
	})
}

func (r *gormRepository) SummariesForRuns(ctx context.Context, runIDs []string) (map[string]AccrualSummaryDTO, error) {
	out := map[string]AccrualSummaryDTO{}
	for _, id := range runIDs {
		out[id] = AccrualSummaryDTO{}
	}
	if len(runIDs) == 0 {
		return out, nil
	}
	type row struct {
		AccrualRunID string
		Status       string
		Count        int
	}
	var rows []row
	err := r.db.WithContext(ctx).Model(&db.AccrualItem{}).Select("accrual_run_id, status, count(*) as count").Where("tenant_id = ? AND accrual_run_id IN ?", defaultTenantID, runIDs).Group("accrual_run_id, status").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		s := out[row.AccrualRunID]
		s.TotalItems += row.Count
		switch row.Status {
		case ItemStatusReady:
			s.ReadyItems += row.Count
		case ItemStatusPending:
			s.PendingItems += row.Count
		case ItemStatusSkipped:
			s.SkippedItems += row.Count
		case ItemStatusPosted:
			s.PostedItems += row.Count
		}
		out[row.AccrualRunID] = s
	}
	return out, nil
}

func (r *gormRepository) ListAssignmentsForCalculation(ctx context.Context, workPeriodID string) ([]db.WorkPeriodAssignment, error) {
	var rows []db.WorkPeriodAssignment
	err := r.db.WithContext(ctx).Where("tenant_id = ? AND work_period_id = ? AND active = ? AND planned_status = ?", defaultTenantID, workPeriodID, true, "INCLUDED").Preload("Collaborator.PaymentMethod").Preload("Collaborator.Person").Find(&rows).Error
	return rows, err
}

func (r *gormRepository) FindGoldProduction(ctx context.Context, workPeriodID string, locationID string) (*db.GoldProductionEntry, error) {
	var row db.GoldProductionEntry
	err := r.db.WithContext(ctx).First(&row, "tenant_id = ? AND work_period_id = ? AND location_id = ? AND active = ?", defaultTenantID, workPeriodID, locationID, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}
