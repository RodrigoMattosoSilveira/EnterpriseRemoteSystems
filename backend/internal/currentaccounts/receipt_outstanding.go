package currentaccounts

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

var outstandingReceiptStatuses = map[string]bool{
	"PENDING_ISSUE": true,
	"ISSUED":        true,
	"PRINTED":       true,
	"SIGNED":        true,
}

func (s *service) ListOutstandingReceipts(ctx context.Context, filter ReceiptListFilter) (*OutstandingReceiptListResult, error) {
	normalized, err := normalizeReceiptListFilter(filter)
	if err != nil {
		return nil, err
	}
	rows, total, err := s.repo.ListOutstandingReceipts(ctx, normalized)
	if err != nil {
		return nil, err
	}
	counts, err := s.repo.CountOutstandingReceiptsByStatus(ctx)
	if err != nil {
		return nil, err
	}

	summary := ReceiptStatusSummaryDTO{
		PendingIssue: counts["PENDING_ISSUE"],
		Issued:       counts["ISSUED"],
		Printed:      counts["PRINTED"],
		Signed:       counts["SIGNED"],
	}
	summary.Total = summary.PendingIssue + summary.Issued + summary.Printed + summary.Signed

	return &OutstandingReceiptListResult{
		Items:    toOutstandingReceiptDTOList(rows),
		Total:    total,
		Page:     normalized.Page,
		PageSize: normalized.PageSize,
		Summary:  summary,
	}, nil
}

func normalizeReceiptListFilter(filter ReceiptListFilter) (normalizedReceiptListFilter, error) {
	status := strings.ToUpper(strings.TrimSpace(filter.Status))
	if status != "" && !outstandingReceiptStatuses[status] {
		return normalizedReceiptListFilter{}, ValidationError{Fields: map[string]string{"status": "Status must be one of PENDING_ISSUE, ISSUED, PRINTED, or SIGNED"}}
	}
	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return normalizedReceiptListFilter{Status: status, Page: page, PageSize: pageSize}, nil
}

func toOutstandingReceiptDTOList(rows []db.LedgerReceipt) []OutstandingReceiptDTO {
	out := make([]OutstandingReceiptDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, toOutstandingReceiptDTO(row))
	}
	return out
}

func toOutstandingReceiptDTO(row db.LedgerReceipt) OutstandingReceiptDTO {
	person := row.Collaborator.Person
	return OutstandingReceiptDTO{
		ID: row.ID, ReceiptNumber: stringPtrValue(row.ReceiptNumber), ReceiptType: row.ReceiptType, Status: row.Status,
		IssuedAt: formatOptionalTime(row.IssuedAt), IssuedBy: row.IssuedBy, PrintedAt: formatOptionalTime(row.PrintedAt),
		SignedAt: formatOptionalTime(row.SignedAt), ReturnedAt: formatOptionalTime(row.ReturnedAt), ReceivedBy: row.ReceivedBy,
		SignedDocumentRef: row.SignedDocumentRef, Notes: row.Notes,
		LedgerEntryID: row.LedgerEntryID, EntryType: row.LedgerEntry.EntryType, EffectiveDate: formatDate(row.LedgerEntry.EffectiveDate),
		ValueUnitCode: row.LedgerEntry.ValueUnit.Code, ValueUnitLabel: row.LedgerEntry.ValueUnit.Label, Amount: row.LedgerEntry.Amount, Description: row.LedgerEntry.Description,
		CollaboratorID: row.CollaboratorID, CollaboratorLabel: collaboratorLabel(person),
		CollaboratorLegalName: strings.TrimSpace(person.FirstName + " " + person.LastName), CollaboratorCPF: person.CPF,
		CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
	}
}
