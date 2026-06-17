package currentaccounts

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

func ToLedgerEntryDTO(row db.LedgerEntry) LedgerEntryDTO {
	return LedgerEntryDTO{
		ID:                   row.ID,
		TenantID:             row.TenantID,
		CollaboratorID:       row.CollaboratorID,
		CollaboratorLabel:    collaboratorLabel(row.Collaborator.Person),
		ValueUnitID:          row.ValueUnitID,
		ValueUnitLabel:       row.ValueUnit.Label,
		ValueUnitCode:        row.ValueUnit.Code,
		EntryType:            row.EntryType,
		Direction:            row.Direction,
		Amount:               row.Amount,
		SignedAmount:         signedAmount(row.Direction, row.Amount),
		EffectiveDate:        formatDate(row.EffectiveDate),
		SourceType:           row.SourceType,
		SourceID:             row.SourceID,
		Description:          row.Description,
		Active:               row.Active,
		CorrectionType:       row.CorrectionType,
		RelatedEntryID:       stringPtrValue(row.RelatedEntryID),
		CorrectionReason:     row.CorrectionReason,
		CorrectionReasonCode: row.CorrectionReasonCode,
		CorrectionReasonText: row.CorrectionReasonText,
		AuthorizedBy:         row.AuthorizedBy,
		AuthorizedAt:         formatOptionalTime(row.AuthorizedAt),
		CreatedAt:            row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:            row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func ToLedgerEntryDTOList(rows []db.LedgerEntry) []LedgerEntryDTO {
	out := make([]LedgerEntryDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToLedgerEntryDTO(row))
	}
	return out
}

func ToBalanceDTO(row BalanceRow) CurrentAccountBalanceDTO {
	return CurrentAccountBalanceDTO{
		CollaboratorID:    row.CollaboratorID,
		CollaboratorLabel: strings.TrimSpace(row.CollaboratorLabel),
		ValueUnitID:       row.ValueUnitID,
		ValueUnitCode:     row.ValueUnitCode,
		ValueUnitLabel:    row.ValueUnitLabel,
		Balance:           row.Balance,
	}
}

func ToBalanceDTOList(rows []BalanceRow) []CurrentAccountBalanceDTO {
	out := make([]CurrentAccountBalanceDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToBalanceDTO(row))
	}
	return out
}

func collaboratorLabel(person db.Person) string {
	if nickname := strings.TrimSpace(person.Nickname); nickname != "" {
		return nickname
	}
	return strings.TrimSpace(strings.Join([]string{person.FirstName, person.LastName}, " "))
}

func signedAmount(direction string, amount float64) float64 {
	if direction == "DEBIT" {
		return -amount
	}
	return amount
}

func parseDate(value string) (time.Time, error) {
	return time.Parse(dateLayout, strings.TrimSpace(value))
}

func formatDate(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(dateLayout)
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func formatOptionalTime(value *time.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}
