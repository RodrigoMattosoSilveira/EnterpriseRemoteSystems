package expenses

import "context"

type Service interface {
	List(ctx context.Context, filter ExpenseListFilter) (*ExpenseListResult, error)
	Create(ctx context.Context, req CreateExpenseRequest, actorUserID string) (*ExpenseDTO, error)
	CreateCanteenBatch(ctx context.Context, req CreateCanteenExpenseBatchRequest, actorUserID string) (*CreateCanteenExpenseBatchResult, error)
	GetByID(ctx context.Context, id string) (*ExpenseDTO, error)
	Update(ctx context.Context, id string, req UpdateExpenseRequest, actorUserID string) (*ExpenseDTO, error)
	Cancel(ctx context.Context, id string, req CancelExpenseRequest, actorUserID string) (*ExpenseDTO, error)
	Deactivate(ctx context.Context, id string, actorUserID string) (*ExpenseDTO, error)
	Delete(ctx context.Context, id string, actorUserID string) error
}
