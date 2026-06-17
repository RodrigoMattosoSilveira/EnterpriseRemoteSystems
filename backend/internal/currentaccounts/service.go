package currentaccounts

import "context"

type Service interface {
	BackfillDebitLedgerReceipts(ctx context.Context, authorizedBy string, dryRun bool, req ReceiptBackfillRequest) (*ReceiptBackfillResult, error)
	ListOutstandingReceipts(ctx context.Context, filter ReceiptListFilter) (*OutstandingReceiptListResult, error)
	GetPrintableReceipt(ctx context.Context, ledgerEntryID string) (*PrintableReceiptDTO, error)
	PrintReceipt(ctx context.Context, ledgerEntryID, printedBy string) (*PrintableReceiptDTO, error)
	ReturnReceipt(ctx context.Context, ledgerEntryID, receivedBy string, req ReturnReceiptRequest) (*PrintableReceiptDTO, error)
	FinancialProjection(ctx context.Context, collaboratorID string) (*FinancialProjectionDTO, error)
	SettlementPreview(ctx context.Context, collaboratorID string) (*SettlementPreviewDTO, error)
	ZeroGold(ctx context.Context, collaboratorID, authorizedBy string, req ZeroGoldRequest) (*ZeroGoldResult, error)
	PartialPayout(ctx context.Context, collaboratorID, authorizedBy string, req PartialPayoutRequest) (*PartialPayoutResult, error)
	CloseJourney(ctx context.Context, collaboratorID, authorizedBy string, req CloseJourneyRequest) (*CloseJourneyResult, error)
	CollaboratorTenantID(ctx context.Context, collaboratorID string) (string, error)
	LedgerEntryTenantID(ctx context.Context, entryID string) (string, error)
	AuthorizeSettlement(providedKey string) error
	GetDetail(ctx context.Context, collaboratorID string, filter LedgerEntryListFilter) (*CurrentAccountDetailDTO, error)
	ListEntries(ctx context.Context, collaboratorID string, filter LedgerEntryListFilter) (*LedgerEntryListResult, error)
	ListBalances(ctx context.Context, collaboratorID string) ([]CurrentAccountBalanceDTO, error)
	ReverseEntry(ctx context.Context, entryID, authorizedBy string, req ReverseLedgerEntryRequest) (*LedgerCorrectionResult, error)
	ReplaceEntry(ctx context.Context, entryID, authorizedBy string, req ReplaceLedgerEntryRequest) (*LedgerCorrectionResult, error)
	AuthorizeCorrection(providedKey string) error
}
