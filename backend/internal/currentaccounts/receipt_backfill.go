package currentaccounts

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
)

const (
	receiptTypeLedgerDebit    = "LEDGER_DEBIT"
	receiptStatusPendingIssue = "PENDING_ISSUE"
	receiptNumberPrefix       = "RCP-"
	ledgerDirectionDebit      = "DEBIT"
)

func (s *service) BackfillDebitLedgerReceipts(ctx context.Context, authorizedBy string, dryRun bool) (*ReceiptBackfillResult, error) {
	authorizedBy = strings.TrimSpace(authorizedBy)
	if authorizedBy == "" {
		return nil, ValidationError{Fields: map[string]string{"authorizedBy": "Authorized by is required"}}
	}

	eligible, err := s.repo.CountDebitLedgerEntries(ctx)
	if err != nil {
		return nil, err
	}
	existing, err := s.repo.CountDebitLedgerEntriesWithReceipts(ctx)
	if err != nil {
		return nil, err
	}
	missingEntries, err := s.repo.ListDebitLedgerEntriesMissingReceipts(ctx)
	if err != nil {
		return nil, err
	}

	result := &ReceiptBackfillResult{
		EligibleDebitEntries: eligible,
		ExistingReceipts:     existing,
		MissingReceipts:      int64(len(missingEntries)),
		DryRun:               dryRun,
		RequestedBy:          authorizedBy,
	}
	if dryRun || len(missingEntries) == 0 {
		return result, nil
	}

	now := time.Now().UTC()
	receipts := make([]*db.LedgerReceipt, 0, len(missingEntries))
	for _, entry := range missingEntries {
		receiptID := ids.New()
		receiptNumber := receiptNumberPrefix + strings.ToUpper(strings.ReplaceAll(receiptID, "-", ""))
		receipts = append(receipts, &db.LedgerReceipt{
			BaseModel:      db.BaseModel{ID: receiptID, CreatedAt: now, UpdatedAt: now},
			TenantID:       entry.TenantID,
			CollaboratorID: entry.CollaboratorID,
			LedgerEntryID:  entry.ID,
			ReceiptNumber:  &receiptNumber,
			ReceiptType:    receiptTypeLedgerDebit,
			Status:         receiptStatusPendingIssue,
		})
	}
	if err := s.repo.CreateLedgerReceipts(ctx, receipts...); err != nil {
		return nil, err
	}
	result.CreatedReceipts = int64(len(receipts))
	return result, nil
}
