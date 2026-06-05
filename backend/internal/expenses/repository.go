package expenses

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	List(ctx context.Context, filter ExpenseListFilter) ([]db.Expense, int64, error)
	Create(ctx context.Context, expense *db.Expense) error
	FindByID(ctx context.Context, id string) (*db.Expense, error)
	FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error)
	ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error)
}
