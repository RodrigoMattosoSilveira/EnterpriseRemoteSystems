package expenses

import "strings"

// ValidationError carries the English field messages (the existing API
// contract and log text) plus a stable rule code per field. Clients translate
// the rule code; the English message must never be used as a lookup key.
type ValidationError struct {
	Fields map[string]string
	Codes  map[string]string
}

func (e ValidationError) Error() string                           { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string     { return e.Fields }
func (e ValidationError) ValidationFieldCodes() map[string]string { return e.Codes }

const (
	CurrencyCodeBRL      = "BRL"
	CurrencyCodeGoldGram = "GOLD_GRAM"
)

// Stable, locale-independent field rule codes returned to clients as
// `fieldCodes`. Renaming one is an API change.
const (
	RuleRequired                      = "required"
	RuleMustBePositive                = "must_be_positive"
	RuleInvalidDate                   = "invalid_date"
	RuleInvalidItemType               = "invalid_item_type"
	RuleInvalidCurrencyCode           = "invalid_currency_code"
	RuleDerivedFromPriceListItem      = "derived_from_price_list_item"
	RuleDerivedFromCurrency           = "derived_from_currency"
	RuleCalculatedFromQuantity        = "calculated_from_quantity"
	RuleSourceNotCancelled            = "source_not_cancelled"
	RuleSourceAlreadyRecreated        = "source_already_recreated"
	RuleItemsRequired                 = "items_required"
	RuleTooManyItems                  = "too_many_items"
	RuleCanteenItemRequired           = "canteen_item_required"
	RuleInactiveExpenseNotEditable    = "inactive_expense_not_editable"
	RuleInactiveExpenseNotCancellable = "inactive_expense_not_cancellable"
	RulePriceListItemInactive         = "price_list_item_inactive"
	RuleGoldPriceRequired             = "gold_price_required"
	RuleCollaboratorNotActive         = "collaborator_not_active"
	RuleCollaboratorWithoutMembership = "collaborator_without_membership"
	RuleInactiveReference             = "inactive_reference"
)

type fieldErrors struct {
	fields map[string]string
	codes  map[string]string
}

func newFieldErrors() *fieldErrors {
	return &fieldErrors{fields: map[string]string{}, codes: map[string]string{}}
}

func (f *fieldErrors) add(field string, rule string, message string) {
	f.fields[field] = message
	f.codes[field] = rule
}

func (f *fieldErrors) err() error {
	if len(f.fields) == 0 {
		return nil
	}
	return ValidationError{Fields: f.fields, Codes: f.codes}
}

func fieldError(field string, rule string, message string) ValidationError {
	return ValidationError{
		Fields: map[string]string{field: message},
		Codes:  map[string]string{field: rule},
	}
}

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
	errs := newFieldErrors()
	if strings.TrimSpace(filter.DateFrom) != "" {
		if _, err := parseDate(filter.DateFrom); err != nil {
			errs.add("dateFrom", RuleInvalidDate, "Date from must be YYYY-MM-DD")
		}
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		if _, err := parseDate(filter.DateTo); err != nil {
			errs.add("dateTo", RuleInvalidDate, "Date to must be YYYY-MM-DD")
		}
	}
	if strings.TrimSpace(filter.CurrencyCode) != "" {
		if err := validateCurrencyCode(filter.CurrencyCode); err != nil {
			errs.add("currencyCode", RuleInvalidCurrencyCode, err.Error())
		}
	}
	if strings.TrimSpace(filter.ItemType) != "" {
		itemType := normalizeItemType(filter.ItemType)
		if itemType != itemTypeCanteen && itemType != itemTypeAdministrative {
			errs.add("itemType", RuleInvalidItemType, "Item type must be CANTEEN or ADMINISTRATIVE")
		}
	}
	if filter.Page < 0 {
		errs.add("page", RuleMustBePositive, "Page must be greater than zero")
	}
	if filter.PageSize < 0 {
		errs.add("pageSize", RuleMustBePositive, "Page size must be greater than zero")
	}
	return errs.err()
}

func usesPriceListCalculation(priceListItemID string, currencyCode string, quantity float64) bool {
	return strings.TrimSpace(priceListItemID) != "" || strings.TrimSpace(currencyCode) != "" || quantity > 0
}

func validateLegacyExpenseFields(collaboratorID string, expenseCategoryID string, valueUnitID string, amount float64, expenseDate string) error {
	errs := newFieldErrors()
	requireString(errs, "collaboratorId", collaboratorID)
	requireString(errs, "expenseCategoryId", expenseCategoryID)
	requireString(errs, "valueUnitId", valueUnitID)
	requireString(errs, "expenseDate", expenseDate)

	if strings.TrimSpace(expenseDate) != "" {
		if _, err := parseDate(expenseDate); err != nil {
			errs.add("expenseDate", RuleInvalidDate, "Expense date must be YYYY-MM-DD")
		}
	}

	if amount <= 0 {
		errs.add("amount", RuleMustBePositive, "Amount must be greater than zero")
	}

	return errs.err()
}

func validatePriceListExpenseFields(collaboratorID string, priceListItemID string, currencyCode string, quantity float64, expenseDate string, expenseCategoryID string, valueUnitID string, amount float64) error {
	errs := newFieldErrors()
	requireString(errs, "collaboratorId", collaboratorID)
	requireString(errs, "priceListItemId", priceListItemID)
	requireString(errs, "currencyCode", currencyCode)
	requireString(errs, "expenseDate", expenseDate)

	if strings.TrimSpace(expenseDate) != "" {
		if _, err := parseDate(expenseDate); err != nil {
			errs.add("expenseDate", RuleInvalidDate, "Expense date must be YYYY-MM-DD")
		}
	}
	if strings.TrimSpace(currencyCode) != "" {
		if err := validateCurrencyCode(currencyCode); err != nil {
			errs.add("currencyCode", RuleInvalidCurrencyCode, err.Error())
		}
	}
	if quantity <= 0 {
		errs.add("quantity", RuleMustBePositive, "Quantity must be greater than zero")
	}
	if strings.TrimSpace(expenseCategoryID) != "" {
		errs.add("expenseCategoryId", RuleDerivedFromPriceListItem, "Expense category is derived from the price list item")
	}
	if strings.TrimSpace(valueUnitID) != "" {
		errs.add("valueUnitId", RuleDerivedFromCurrency, "Value unit is derived from the selected currency")
	}
	if amount > 0 {
		errs.add("amount", RuleCalculatedFromQuantity, "Amount is calculated from unit price and quantity")
	}
	return errs.err()
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

func requireString(errs *fieldErrors, key string, value string) {
	if strings.TrimSpace(value) == "" {
		errs.add(key, RuleRequired, "Required")
	}
}
