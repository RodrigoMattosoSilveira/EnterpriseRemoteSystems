package expenses

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) List(ctx context.Context, filter normalizedExpenseListFilter) ([]db.Expense, int64, error) {
	var rows []db.Expense
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.Expense{}).
		Where("tenant_id = ?", defaultTenantID).
		Preload("Collaborator.Person").
		Preload("ExpenseCategory").
		Preload("ValueUnit")

	if !filter.IncludeInactive {
		q = q.Where("active = ?", true)
	}
	if filter.CollaboratorID != "" {
		q = q.Where("collaborator_id = ?", filter.CollaboratorID)
	}
	if filter.ExpenseCategoryID != "" {
		q = q.Where("expense_category_id = ?", filter.ExpenseCategoryID)
	}
	if filter.ValueUnitID != "" {
		q = q.Where("value_unit_id = ?", filter.ValueUnitID)
	}
	if filter.DateFrom != nil {
		q = q.Where("expense_date >= ?", formatDateForQuery(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		// Use an exclusive next-day upper bound instead of <= YYYY-MM-DD.
		// GORM/SQLite can persist date values with a midnight time component,
		// and lexical comparison against the bare date string can exclude
		// same-day rows in runtime/CI databases.
		q = q.Where("expense_date < ?", formatDateForQuery(filter.DateTo.AddDate(0, 0, 1)))
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := q.Order("expense_date DESC, created_at DESC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).Find(&rows).Error
	return rows, total, err
}

func (r *gormRepository) Create(ctx context.Context, expense *db.Expense) error {
	return r.db.WithContext(ctx).Create(expense).Error
}

func (r *gormRepository) Update(ctx context.Context, expense *db.Expense) error {
	return r.db.WithContext(ctx).
		Model(&db.Expense{}).
		Where("id = ? AND tenant_id = ?", expense.ID, defaultTenantID).
		Updates(map[string]any{
			"collaborator_id":     expense.CollaboratorID,
			"expense_category_id": expense.ExpenseCategoryID,
			"value_unit_id":       expense.ValueUnitID,
			"amount":              expense.Amount,
			"expense_date":        expense.ExpenseDate,
			"description":         expense.Description,
			"active":              expense.Active,
			"updated_at":          expense.UpdatedAt,
		}).Error
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.Expense, error) {
	var row db.Expense
	err := r.db.WithContext(ctx).
		Preload("Collaborator.Person").
		Preload("Collaborator.Status").
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

func formatDateForQuery(value time.Time) string {
	return value.Format(dateLayout)
}
