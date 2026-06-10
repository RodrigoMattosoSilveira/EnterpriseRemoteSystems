package currentaccounts

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

var ErrReceiptCancelled = errors.New("receipt is cancelled")

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

func toPrintableReceiptDTO(row db.LedgerReceipt) *PrintableReceiptDTO {
	person := row.Collaborator.Person
	return &PrintableReceiptDTO{
		ID: row.ID, ReceiptNumber: stringPtrValue(row.ReceiptNumber), ReceiptType: row.ReceiptType, Status: row.Status,
		IssuedAt: formatOptionalTime(row.IssuedAt), IssuedBy: row.IssuedBy, PrintedAt: formatOptionalTime(row.PrintedAt),
		LedgerEntryID: row.LedgerEntryID, EntryType: row.LedgerEntry.EntryType, EffectiveDate: formatDate(row.LedgerEntry.EffectiveDate),
		ValueUnitCode: row.LedgerEntry.ValueUnit.Code, ValueUnitLabel: row.LedgerEntry.ValueUnit.Label, Amount: row.LedgerEntry.Amount, Description: row.LedgerEntry.Description,
		CollaboratorID: row.CollaboratorID, CollaboratorLabel: collaboratorLabel(person),
		CollaboratorLegalName: strings.TrimSpace(person.FirstName + " " + person.LastName), CollaboratorCPF: person.CPF,
		CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
	}
}
