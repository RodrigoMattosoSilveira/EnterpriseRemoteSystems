package accruals

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

func (r *gormRepository) FindValueUnitByCode(ctx context.Context, code string) (*db.ReferenceData, error) {
	var row db.ReferenceData
	err := r.db.WithContext(ctx).First(&row, "tenant_id = ? AND type = ? AND code = ? AND active = ?", defaultTenantID, "value_unit", code, true).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ListReadyItemsByRun(ctx context.Context, runID string) ([]db.AccrualItem, error) {
	var rows []db.AccrualItem
	err := r.db.WithContext(ctx).Where("tenant_id = ? AND accrual_run_id = ? AND status = ?", defaultTenantID, runID, ItemStatusReady).Order("created_at ASC").Find(&rows).Error
	return rows, err
}

func (r *gormRepository) PendingItemCountByRun(ctx context.Context, runID string) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&db.AccrualItem{}).Where("tenant_id = ? AND accrual_run_id = ? AND status = ?", defaultTenantID, runID, ItemStatusPending).Count(&count).Error
	return count, err
}

func (r *gormRepository) PostedItemKeysForWorkPeriod(ctx context.Context, workPeriodID string) (map[string]bool, error) {
	type row struct {
		WorkPeriodAssignmentID string
		CalculationType        string
		Direction              string
	}
	var rows []row
	err := r.db.WithContext(ctx).Model(&db.AccrualItem{}).
		Select("work_period_assignment_id, calculation_type, direction").
		Where("tenant_id = ? AND work_period_id = ? AND status = ? AND work_period_assignment_id IS NOT NULL", defaultTenantID, workPeriodID, ItemStatusPosted).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(rows))
	for _, row := range rows {
		out[itemKey(row.WorkPeriodAssignmentID, row.CalculationType, row.Direction)] = true
	}
	return out, nil
}

func (r *gormRepository) PostReadyItems(ctx context.Context, run *db.AccrualRun, readyItems []db.AccrualItem, entries []db.LedgerEntry, workPeriodStatus string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if len(entries) > 0 {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&entries).Error; err != nil {
				return err
			}
		}
		ids := make([]string, 0, len(readyItems))
		for _, item := range readyItems {
			ids = append(ids, item.ID)
		}
		if len(ids) > 0 {
			if err := tx.Model(&db.AccrualItem{}).
				Where("tenant_id = ? AND accrual_run_id = ? AND id IN ? AND status = ?", defaultTenantID, run.ID, ids, ItemStatusReady).
				Updates(map[string]any{"status": ItemStatusPosted, "updated_at": run.UpdatedAt}).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&db.AccrualRun{}).
			Where("id = ? AND tenant_id = ?", run.ID, defaultTenantID).
			Updates(map[string]any{"status": run.Status, "updated_at": run.UpdatedAt}).Error; err != nil {
			return err
		}
		return tx.Model(&db.WorkPeriod{}).
			Where("id = ? AND tenant_id = ?", run.WorkPeriodID, defaultTenantID).
			Updates(map[string]any{"status": workPeriodStatus, "updated_at": run.UpdatedAt}).Error
	})
}
