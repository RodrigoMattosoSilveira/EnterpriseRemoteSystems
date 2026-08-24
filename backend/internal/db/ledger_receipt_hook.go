package db

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ledgerDirectionDebit                         = "DEBIT"
	ledgerDirectionCredit                        = "CREDIT"
	ledgerReceiptTypeDebit                       = "LEDGER_DEBIT"
	ledgerReceiptPurposeDebit                    = "LEDGER_DEBIT"
	ledgerReceiptPurposeFinalTenantPayment       = "FINAL_SETTLEMENT_TENANT_PAYMENT"
	ledgerReceiptPurposeFinalCollaboratorPayment = "FINAL_SETTLEMENT_COLLABORATOR_PAYMENT"
	ledgerReceiptDirectionAccountDebit           = "ACCOUNT_DEBIT"
	ledgerReceiptDirectionTenantToCollaborator   = "TENANT_TO_COLLABORATOR"
	ledgerReceiptDirectionCollaboratorToTenant   = "COLLABORATOR_TO_TENANT"
	ledgerReceiptAcceptingPartyCollaborator      = "COLLABORATOR"
	ledgerReceiptAcceptingPartyTenant            = "TENANT"
	ledgerReceiptStatusPending                   = "PENDING_ISSUE"
	ledgerReceiptNumberPrefix                    = "RCP-"
	ledgerEntryTypeFinalSettlement               = "FINAL_SETTLEMENT"
	ledgerSourceJourneySettlement                = "JOURNEY_SETTLEMENT"
)

// AfterCreate ensures ordinary debit ledger entries keep their historical
// receipt obligation and every final-settlement entry receives a direction-aware
// receipt. Final Tenant payments are DEBITs accepted by the Collaborator; final
// Collaborator repayments are CREDITs accepted by the Tenant.
func (entry *LedgerEntry) AfterCreate(tx *gorm.DB) error {
	direction := strings.ToUpper(strings.TrimSpace(entry.Direction))
	finalSettlement := strings.EqualFold(strings.TrimSpace(entry.EntryType), ledgerEntryTypeFinalSettlement) &&
		strings.EqualFold(strings.TrimSpace(entry.SourceType), ledgerSourceJourneySettlement)
	if direction != ledgerDirectionDebit && !(finalSettlement && direction == ledgerDirectionCredit) {
		return nil
	}

	now := entry.CreatedAt.UTC()
	if entry.CreatedAt.IsZero() {
		now = time.Now().UTC()
	}

	purpose := ledgerReceiptPurposeDebit
	paymentDirection := ledgerReceiptDirectionAccountDebit
	acceptingParty := ledgerReceiptAcceptingPartyCollaborator
	if finalSettlement {
		if direction == ledgerDirectionDebit {
			purpose = ledgerReceiptPurposeFinalTenantPayment
			paymentDirection = ledgerReceiptDirectionTenantToCollaborator
			acceptingParty = ledgerReceiptAcceptingPartyCollaborator
		} else {
			purpose = ledgerReceiptPurposeFinalCollaboratorPayment
			paymentDirection = ledgerReceiptDirectionCollaboratorToTenant
			acceptingParty = ledgerReceiptAcceptingPartyTenant
		}
	}

	receiptID := ids.New()
	receiptNumber := ledgerReceiptNumberPrefix + strings.ToUpper(strings.ReplaceAll(receiptID, "-", ""))
	receipt := LedgerReceipt{
		BaseModel: BaseModel{
			ID:        receiptID,
			CreatedAt: now,
			UpdatedAt: now,
		},
		TenantID:         entry.TenantID,
		PersonID:         entry.PersonID,
		CollaboratorID:   entry.CollaboratorID,
		LedgerEntryID:    entry.ID,
		ReceiptNumber:    &receiptNumber,
		ReceiptType:      ledgerReceiptTypeDebit, // legacy compatibility column
		ReceiptPurpose:   purpose,
		PaymentDirection: paymentDirection,
		AcceptingParty:   acceptingParty,
		Status:           ledgerReceiptStatusPending,
	}

	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "ledger_entry_id"}},
		DoNothing: true,
	}).Create(&receipt).Error
}
