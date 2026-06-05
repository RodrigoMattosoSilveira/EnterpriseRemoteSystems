package expenses

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) List(ctx context.Context, filter ExpenseListFilter) ([]db.Expense, int64, error) {
	var rows []db.Expense
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.Expense{}).
		Where("tenant_id = ?", defaultTenantID).
		Preload("Collaborator.Person").
		Preload("ExpenseCategory").
		Preload("ValueUnit")

	if filter.CollaboratorID != "" {
		q = q.Where("collaborator_id = ?", filter.CollaboratorID)
	}
	if filter.ExpenseCategoryID != "" {
		q = q.Where("expense_category_id = ?", filter.ExpenseCategoryID)
	}
	if filter.ValueUnitID != "" {
		q = q.Where("value_unit_id = ?", filter.ValueUnitID)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	pageSize := filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}

	err := q.Order("expense_date DESC, created_at DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) Create(ctx context.Context, expense *db.Expense) error {
	return r.db.WithContext(ctx).Create(expense).Error
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.Expense, error) {
	var row db.Expense
	err := r.db.WithContext(ctx).
		Preload("Collaborator.Person").
		Preload("ExpenseCategory").
		Preload("ValueUnit").
		First(&row, "id = ? AND tenant_id = ?", id, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error) {
	var row db.CollaboratorJourney
	err := r.db.WithContext(ctx).
		Preload("Status").
		First(&row, "id = ? AND tenant_id = ?", collaboratorID, defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.ReferenceData{}).
		Where("id = ? AND tenant_id = ? AND type = ? AND active = ?", id, defaultTenantID, typ, true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
