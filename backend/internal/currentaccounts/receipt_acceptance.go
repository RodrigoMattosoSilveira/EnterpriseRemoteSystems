package currentaccounts

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	receiptPurposeFinalTenantPayment       = "FINAL_SETTLEMENT_TENANT_PAYMENT"
	receiptPurposeFinalCollaboratorPayment = "FINAL_SETTLEMENT_COLLABORATOR_PAYMENT"
	receiptAcceptingPartyCollaborator      = "COLLABORATOR"
	receiptAcceptingPartyTenant            = "TENANT"
	receiptAcceptanceMethodInApp           = "IN_APP"
)

var (
	ErrReceiptAcceptancePartyMismatch = errors.New("receipt must be accepted by the designated party")
	ErrReceiptAlreadyAccepted         = errors.New("receipt is already accepted")
	ErrReceiptNotInAppAcceptable      = errors.New("receipt is not an in-app final-settlement receipt")
	ErrReceiptRequiresInAppAcceptance = errors.New("final-settlement receipt must be accepted in-app by the designated party")
)

func (s *service) AcceptReceipt(ctx context.Context, ledgerEntryID, acceptedBy, expectedParty string, req AcceptReceiptRequest) (*PrintableReceiptDTO, error) {
	if err := ValidateAcceptReceiptRequest(req); err != nil {
		return nil, err
	}
	acceptedBy = strings.TrimSpace(acceptedBy)
	if acceptedBy == "" {
		return nil, ValidationError{Fields: map[string]string{"authorizedBy": "Required"}}
	}
	receipt, err := s.repo.FindReceiptByLedgerEntryID(ctx, strings.TrimSpace(ledgerEntryID))
	if err != nil {
		return nil, err
	}
	if receipt.AcceptedAt != nil || strings.EqualFold(receipt.AcceptanceMethod, receiptAcceptanceMethodInApp) {
		return nil, ErrReceiptAlreadyAccepted
	}
	if receipt.Status == "CANCELLED" {
		return nil, ErrReceiptCancelled
	}
	if receipt.Status == "RETURNED" {
		return nil, ErrReceiptAlreadyReturned
	}
	purpose := strings.ToUpper(strings.TrimSpace(receipt.ReceiptPurpose))
	if purpose != receiptPurposeFinalTenantPayment && purpose != receiptPurposeFinalCollaboratorPayment {
		return nil, ErrReceiptNotInAppAcceptable
	}
	party := strings.ToUpper(strings.TrimSpace(receipt.AcceptingParty))
	if party == "" || party != strings.ToUpper(strings.TrimSpace(expectedParty)) {
		return nil, ErrReceiptAcceptancePartyMismatch
	}

	now := time.Now().UTC()
	reference := fmt.Sprintf("IN_APP:%s:%s", acceptedBy, now.Format(time.RFC3339Nano))
	receipt, err = s.repo.MarkReceiptAccepted(ctx, receipt.ID, acceptedBy, reference, strings.TrimSpace(req.Notes), now)
	if err != nil {
		return nil, err
	}
	return toPrintableReceiptDTO(*receipt), nil
}
