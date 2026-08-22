package db

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ledgerDirectionDebit       = "DEBIT"
	ledgerReceiptTypeDebit     = "LEDGER_DEBIT"
	ledgerReceiptStatusPending = "PENDING_ISSUE"
	ledgerReceiptNumberPrefix  = "RCP-"
)

// AfterCreate ensures every debit ledger entry has one receipt obligation.
// The hook runs inside the same GORM transaction that creates the ledger entry,
// so the debit and its receipt are committed or rolled back together.
func (entry *LedgerEntry) AfterCreate(tx *gorm.DB) error {
	if !strings.EqualFold(strings.TrimSpace(entry.Direction), ledgerDirectionDebit) {
		return nil
	}

	now := entry.CreatedAt.UTC()
	if entry.CreatedAt.IsZero() {
		now = time.Now().UTC()
	}

	receiptID := ids.New()
	receiptNumber := ledgerReceiptNumberPrefix + strings.ToUpper(strings.ReplaceAll(receiptID, "-", ""))
	receipt := LedgerReceipt{
		BaseModel: BaseModel{
			ID:        receiptID,
			CreatedAt: now,
			UpdatedAt: now,
		},
		TenantID:       entry.TenantID,
		PersonID:       entry.PersonID,
		CollaboratorID: entry.CollaboratorID,
		LedgerEntryID:  entry.ID,
		ReceiptNumber:  &receiptNumber,
		ReceiptType:    ledgerReceiptTypeDebit,
		Status:         ledgerReceiptStatusPending,
	}

	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "ledger_entry_id"}},
		DoNothing: true,
	}).Create(&receipt).Error
}
