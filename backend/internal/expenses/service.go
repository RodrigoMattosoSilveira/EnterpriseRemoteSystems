package expenses

import "context"

type Service interface {
	List(ctx context.Context, filter ExpenseListFilter) ([]ExpenseDTO, int64, error)
	Create(ctx context.Context, req CreateExpenseRequest, actorUserID string) (*ExpenseDTO, error)
	GetByID(ctx context.Context, id string) (*ExpenseDTO, error)
}
