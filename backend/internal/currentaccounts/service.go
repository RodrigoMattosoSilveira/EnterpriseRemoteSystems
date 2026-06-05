package currentaccounts

import "context"

type Service interface {
	ListEntries(ctx context.Context, collaboratorID string, filter LedgerEntryListFilter) (*LedgerEntryListResult, error)
	ListBalances(ctx context.Context, collaboratorID string) ([]CurrentAccountBalanceDTO, error)
}
