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
	FindFinancialPostingByExpenseID(ctx context.Context, expenseID string) (*db.LedgerEntry, error)
	FindFinancialPostingsByExpenseIDs(ctx context.Context, expenseIDs []string) (map[string]*db.LedgerEntry, error)
	FindCollaboratorByID(ctx context.Context, collaboratorID string) (*db.CollaboratorJourney, error)
	ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error)
	FindActiveReferenceByID(ctx context.Context, id string, typ string) (*db.ReferenceData, error)
	FindActiveReferenceByCode(ctx context.Context, typ string, code string) (*db.ReferenceData, error)
	FindActivePriceListItemByID(ctx context.Context, id string) (*db.ExpensePriceListItem, error)
	FindLatestActiveGoldPrice(ctx context.Context) (*db.GoldPrice, error)
}

type normalizedExpenseListFilter struct {
	CollaboratorID    string
	ExpenseCategoryID string
	ValueUnitID       string
	ItemType          string
	PriceListItemID   string
	CurrencyCode      string
	DateFrom          *time.Time
	DateTo            *time.Time
	IncludeInactive   bool
	Page              int
	PageSize          int
}
