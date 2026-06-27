package expenses

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

const (
	itemTypeCanteen        = "CANTEEN"
	itemTypeAdministrative = "ADMINISTRATIVE"
)

func ToDTO(row db.Expense) ExpenseDTO {
	return ExpenseDTO{
		ID:                     row.ID,
		TenantID:               row.TenantID,
		CollaboratorID:         row.CollaboratorID,
		CollaboratorLabel:      collaboratorLabel(row.Collaborator.Person),
		ExpenseCategoryID:      row.ExpenseCategoryID,
		ExpenseCategoryLabel:   row.ExpenseCategory.Label,
		ValueUnitID:            row.ValueUnitID,
		ValueUnitLabel:         row.ValueUnit.Label,
		Amount:                 row.Amount,
		ExpenseDate:            formatDate(row.ExpenseDate),
		Description:            row.Description,
		Active:                 row.Active,
		PriceListItemID:        row.PriceListItemID,
		PriceListItemCode:      row.PriceListItemCode,
		ItemType:               row.ItemType,
		ItemDescription:        row.ItemDescription,
		Quantity:               row.Quantity,
		UnitPriceBRL:           row.UnitPriceBRL,
		CurrencyCode:           row.CurrencyCode,
		GoldPriceID:            row.GoldPriceID,
		GoldBRLPerGram:         row.GoldBRLPerGram,
		GoldPriceDate:          normalizeStoredGoldPriceDate(row.GoldPriceDate),
		UnitPriceAmount:        row.UnitPriceAmount,
		TotalAmount:            row.TotalAmount,
		CalculationMethod:      row.CalculationMethod,
		CalculationDetailsJSON: row.CalculationDetailsJSON,
		CreatedAt:              row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:              row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func ToDTOList(rows []db.Expense) []ExpenseDTO {
	out := make([]ExpenseDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToDTO(row))
	}
	return out
}

func ToDTOListWithFinancialPostings(rows []db.Expense, postings map[string]*db.LedgerEntry) []ExpenseDTO {
	out := make([]ExpenseDTO, 0, len(rows))
	for _, row := range rows {
		dto := ToDTO(row)
		if posting := postings[row.ID]; posting != nil {
			dto.FinancialPosting = toFinancialPostingDTO(*posting)
		}
		out = append(out, dto)
	}
	return out
}

func collaboratorLabel(person db.Person) string {
	if nickname := strings.TrimSpace(person.Nickname); nickname != "" {
		return nickname
	}
	return strings.TrimSpace(strings.Join([]string{person.FirstName, person.LastName}, " "))
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

func normalizeCurrencyCode(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func normalizeItemType(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func ToDTOWithFinancialPosting(row db.Expense, posting *db.LedgerEntry) ExpenseDTO {
	dto := ToDTO(row)
	if posting != nil {
		dto.FinancialPosting = toFinancialPostingDTO(*posting)
	}
	return dto
}

func toFinancialPostingDTO(row db.LedgerEntry) *ExpenseFinancialPostingDTO {
	return &ExpenseFinancialPostingDTO{
		LedgerEntryID:      row.ID,
		Direction:          row.Direction,
		EntryType:          row.EntryType,
		Amount:             row.Amount,
		SignedAmount:       signedAmount(row.Direction, row.Amount),
		EffectiveDate:      formatDate(row.EffectiveDate),
		ValueUnitID:        row.ValueUnitID,
		ValueUnitCode:      row.ValueUnit.Code,
		ValueUnitLabel:     row.ValueUnit.Label,
		SourceType:         row.SourceType,
		SourceID:           row.SourceID,
		CorrectionType:     row.CorrectionType,
		ReceiptID:          receiptID(row.Receipt),
		ReceiptNumber:      receiptNumber(row.Receipt),
		ReceiptStatus:      receiptStatus(row.Receipt),
		OutstandingReceipt: receiptOutstanding(row.Receipt),
	}
}

func signedAmount(direction string, amount float64) float64 {
	if strings.EqualFold(direction, "DEBIT") {
		return -amount
	}
	return amount
}

func receiptID(receipt *db.LedgerReceipt) string {
	if receipt == nil {
		return ""
	}
	return receipt.ID
}

func receiptNumber(receipt *db.LedgerReceipt) string {
	if receipt == nil || receipt.ReceiptNumber == nil {
		return ""
	}
	return strings.TrimSpace(*receipt.ReceiptNumber)
}

func receiptStatus(receipt *db.LedgerReceipt) string {
	if receipt == nil {
		return "MISSING"
	}
	return strings.TrimSpace(receipt.Status)
}

func receiptOutstanding(receipt *db.LedgerReceipt) bool {
	if receipt == nil {
		return true
	}
	status := strings.ToUpper(strings.TrimSpace(receipt.Status))
	return status == "PENDING_ISSUE" || status == "ISSUED" || status == "PRINTED" || status == "SIGNED"
}
