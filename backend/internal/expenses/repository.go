package expenses

import (
	"context"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	List(ctx context.Context, filter normalizedExpenseListFilter) ([]db.Expense, int64, error)
	Create(ctx context.Context, expense *db.Expense) error
	Update(ctx context.Context, expense *db.Expense) error
	FindByID(ctx context.Context, id string) (*db.Expense, error)
	FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error)
	ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error)
}

type normalizedExpenseListFilter struct {
	CollaboratorID    string
	ExpenseCategoryID string
	ValueUnitID       string
	DateFrom          *time.Time
	DateTo            *time.Time
	IncludeInactive   bool
	Page              int
	PageSize          int
}
