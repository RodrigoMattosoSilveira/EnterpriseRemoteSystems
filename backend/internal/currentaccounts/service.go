package currentaccounts

import "context"

type Service interface {
	SettlementPreview(ctx context.Context, collaboratorID string) (*SettlementPreviewDTO, error)
	GetDetail(ctx context.Context, collaboratorID string, filter LedgerEntryListFilter) (*CurrentAccountDetailDTO, error)
	ListEntries(ctx context.Context, collaboratorID string, filter LedgerEntryListFilter) (*LedgerEntryListResult, error)
	ListBalances(ctx context.Context, collaboratorID string) ([]CurrentAccountBalanceDTO, error)
	ReverseEntry(ctx context.Context, entryID, authorizedBy string, req ReverseLedgerEntryRequest) (*LedgerCorrectionResult, error)
	ReplaceEntry(ctx context.Context, entryID, authorizedBy string, req ReplaceLedgerEntryRequest) (*LedgerCorrectionResult, error)
	AuthorizeCorrection(providedKey string) error
}
