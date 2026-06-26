package expenses

import "strings"

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

const (
	CurrencyCodeBRL      = "BRL"
	CurrencyCodeGoldGram = "GOLD_GRAM"
)

func ValidateCreateExpense(req CreateExpenseRequest) error {
	if usesPriceListCalculation(req.PriceListItemID, req.CurrencyCode, req.Quantity) {
		return validatePriceListExpenseFields(
			req.CollaboratorID,
			req.PriceListItemID,
			req.CurrencyCode,
			req.Quantity,
			req.ExpenseDate,
			req.ExpenseCategoryID,
			req.ValueUnitID,
			req.Amount,
		)
	}
	return validateLegacyExpenseFields(req.CollaboratorID, req.ExpenseCategoryID, req.ValueUnitID, req.Amount, req.ExpenseDate)
}

func ValidateUpdateExpense(req UpdateExpenseRequest) error {
	if usesPriceListCalculation(req.PriceListItemID, req.CurrencyCode, req.Quantity) {
		return validatePriceListExpenseFields(
			req.CollaboratorID,
			req.PriceListItemID,
			req.CurrencyCode,
			req.Quantity,
			req.ExpenseDate,
			req.ExpenseCategoryID,
			req.ValueUnitID,
			req.Amount,
		)
	}
	return validateLegacyExpenseFields(req.CollaboratorID, req.ExpenseCategoryID, req.ValueUnitID, req.Amount, req.ExpenseDate)
}

func ValidateListFilter(filter ExpenseListFilter) error {
	fields := map[string]string{}
	if strings.TrimSpace(filter.DateFrom) != "" {
		if _, err := parseDate(filter.DateFrom); err != nil {
			fields["dateFrom"] = "Date from must be YYYY-MM-DD"
		}
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		if _, err := parseDate(filter.DateTo); err != nil {
			fields["dateTo"] = "Date to must be YYYY-MM-DD"
		}
	}
	if strings.TrimSpace(filter.CurrencyCode) != "" {
		if err := validateCurrencyCode(filter.CurrencyCode); err != nil {
			fields["currencyCode"] = err.Error()
		}
	}
	if strings.TrimSpace(filter.ItemType) != "" {
		itemType := normalizeItemType(filter.ItemType)
		if itemType != itemTypeCanteen && itemType != itemTypeAdministrative {
			fields["itemType"] = "Item type must be CANTEEN or ADMINISTRATIVE"
		}
	}
	if filter.Page < 0 {
		fields["page"] = "Page must be greater than zero"
	}
	if filter.PageSize < 0 {
		fields["pageSize"] = "Page size must be greater than zero"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func usesPriceListCalculation(priceListItemID string, currencyCode string, quantity float64) bool {
	return strings.TrimSpace(priceListItemID) != "" || strings.TrimSpace(currencyCode) != "" || quantity > 0
}

func validateLegacyExpenseFields(collaboratorID string, expenseCategoryID string, valueUnitID string, amount float64, expenseDate string) error {
	fields := map[string]string{}
	requireString(fields, "collaboratorId", collaboratorID)
	requireString(fields, "expenseCategoryId", expenseCategoryID)
	requireString(fields, "valueUnitId", valueUnitID)
	requireString(fields, "expenseDate", expenseDate)

	if strings.TrimSpace(expenseDate) != "" {
		if _, err := parseDate(expenseDate); err != nil {
			fields["expenseDate"] = "Expense date must be YYYY-MM-DD"
		}
	}

	if amount <= 0 {
		fields["amount"] = "Amount must be greater than zero"
	}

	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func validatePriceListExpenseFields(collaboratorID string, priceListItemID string, currencyCode string, quantity float64, expenseDate string, expenseCategoryID string, valueUnitID string, amount float64) error {
	fields := map[string]string{}
	requireString(fields, "collaboratorId", collaboratorID)
	requireString(fields, "priceListItemId", priceListItemID)
	requireString(fields, "currencyCode", currencyCode)
	requireString(fields, "expenseDate", expenseDate)

	if strings.TrimSpace(expenseDate) != "" {
		if _, err := parseDate(expenseDate); err != nil {
			fields["expenseDate"] = "Expense date must be YYYY-MM-DD"
		}
	}
	if strings.TrimSpace(currencyCode) != "" {
		if err := validateCurrencyCode(currencyCode); err != nil {
			fields["currencyCode"] = err.Error()
		}
	}
	if quantity <= 0 {
		fields["quantity"] = "Quantity must be greater than zero"
	}
	if strings.TrimSpace(expenseCategoryID) != "" {
		fields["expenseCategoryId"] = "Expense category is derived from the price list item"
	}
	if strings.TrimSpace(valueUnitID) != "" {
		fields["valueUnitId"] = "Value unit is derived from the selected currency"
	}
	if amount > 0 {
		fields["amount"] = "Amount is calculated from unit price and quantity"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

type fieldMessage string

func (e fieldMessage) Error() string { return string(e) }

func validateCurrencyCode(value string) error {
	switch normalizeCurrencyCode(value) {
	case CurrencyCodeBRL, CurrencyCodeGoldGram:
		return nil
	default:
		return fieldMessage("Currency code must be BRL or GOLD_GRAM")
	}
}

func requireString(fields map[string]string, key string, value string) {
	if strings.TrimSpace(value) == "" {
		fields[key] = "Required"
	}
}
