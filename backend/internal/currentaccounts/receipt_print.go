package currentaccounts

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

var (
	ErrReceiptCancelled              = errors.New("receipt is cancelled")
	ErrReceiptAlreadyReturned        = errors.New("receipt is already returned")
	ErrReceiptSignedDocumentRequired = errors.New("signed document reference is required to return a receipt")
)

func (s *service) GetPrintableReceipt(ctx context.Context, ledgerEntryID string) (*PrintableReceiptDTO, error) {
	receipt, err := s.repo.FindReceiptByLedgerEntryID(ctx, strings.TrimSpace(ledgerEntryID))
	if err != nil {
		return nil, err
	}
	return toPrintableReceiptDTO(*receipt), nil
}

func (s *service) PrintReceipt(ctx context.Context, ledgerEntryID, printedBy string) (*PrintableReceiptDTO, error) {
	printedBy = strings.TrimSpace(printedBy)
	if printedBy == "" {
		return nil, ValidationError{Fields: map[string]string{"authorizedBy": "Authorized by is required"}}
	}
	receipt, err := s.repo.FindReceiptByLedgerEntryID(ctx, strings.TrimSpace(ledgerEntryID))
	if err != nil {
		return nil, err
	}
	receipt, err = s.repo.MarkReceiptPrinted(ctx, receipt.ID, printedBy, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	return toPrintableReceiptDTO(*receipt), nil
}

func (s *service) ReturnReceipt(ctx context.Context, ledgerEntryID, receivedBy string, req ReturnReceiptRequest) (*PrintableReceiptDTO, error) {
	receivedBy = strings.TrimSpace(receivedBy)
	if receivedBy == "" {
		return nil, ValidationError{Fields: map[string]string{"authorizedBy": "Authorized by is required"}}
	}
	if strings.TrimSpace(req.SignedDocumentRef) == "" {
		return nil, ValidationError{Fields: map[string]string{"signedDocumentRef": ErrReceiptSignedDocumentRequired.Error()}}
	}
	receipt, err := s.repo.FindReceiptByLedgerEntryID(ctx, strings.TrimSpace(ledgerEntryID))
	if err != nil {
		return nil, err
	}
	purpose := strings.ToUpper(strings.TrimSpace(receipt.ReceiptPurpose))
	if purpose == receiptPurposeFinalTenantPayment || purpose == receiptPurposeFinalCollaboratorPayment {
		return nil, ErrReceiptRequiresInAppAcceptance
	}
	receipt, err = s.repo.MarkReceiptReturned(ctx, receipt.ID, receivedBy, req.SignedDocumentRef, req.Notes, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	return toPrintableReceiptDTO(*receipt), nil
}

func toPrintableReceiptDTO(row db.LedgerReceipt) *PrintableReceiptDTO {
	person := row.Collaborator.Person
	return &PrintableReceiptDTO{
		ID: row.ID, ReceiptNumber: stringPtrValue(row.ReceiptNumber), ReceiptType: row.ReceiptType, ReceiptPurpose: row.ReceiptPurpose, PaymentDirection: row.PaymentDirection, AcceptingParty: row.AcceptingParty, Status: row.Status,
		IssuedAt: formatOptionalTime(row.IssuedAt), IssuedBy: row.IssuedBy, PrintedAt: formatOptionalTime(row.PrintedAt),
		SignedAt: formatOptionalTime(row.SignedAt), ReturnedAt: formatOptionalTime(row.ReturnedAt), ReceivedBy: row.ReceivedBy,
		SignedDocumentRef: row.SignedDocumentRef, AcceptedAt: formatOptionalTime(row.AcceptedAt), AcceptedBy: row.AcceptedBy, AcceptanceMethod: row.AcceptanceMethod, Notes: row.Notes,
		LedgerEntryID: row.LedgerEntryID, EntryType: row.LedgerEntry.EntryType, EffectiveDate: formatDate(row.LedgerEntry.EffectiveDate),
		ValueUnitCode: row.LedgerEntry.ValueUnit.Code, ValueUnitLabel: row.LedgerEntry.ValueUnit.Label, Amount: row.LedgerEntry.Amount, Description: row.LedgerEntry.Description,
		CollaboratorID: row.CollaboratorID, CollaboratorLabel: collaboratorLabel(person),
		CollaboratorLegalName: strings.TrimSpace(person.FirstName + " " + person.LastName), CollaboratorCPF: person.CPF,
		CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
	}
}
