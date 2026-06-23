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
		ItemType:               row.ItemType,
		ItemDescription:        row.ItemDescription,
		Quantity:               row.Quantity,
		UnitPriceBRL:           row.UnitPriceBRL,
		CurrencyCode:           row.CurrencyCode,
		GoldPriceID:            row.GoldPriceID,
		GoldBRLPerGram:         row.GoldBRLPerGram,
		UnitPriceAmount:        row.UnitPriceAmount,
		TotalAmount:            row.TotalAmount,
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
