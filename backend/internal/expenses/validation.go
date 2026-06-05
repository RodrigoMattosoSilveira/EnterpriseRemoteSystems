package expenses

import "strings"

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

func ValidateCreateExpense(req CreateExpenseRequest) error {
	return validateExpenseFields(req.CollaboratorID, req.ExpenseCategoryID, req.ValueUnitID, req.Amount, req.ExpenseDate)
}

func ValidateUpdateExpense(req UpdateExpenseRequest) error {
	return validateExpenseFields(req.CollaboratorID, req.ExpenseCategoryID, req.ValueUnitID, req.Amount, req.ExpenseDate)
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

func validateExpenseFields(collaboratorID string, expenseCategoryID string, valueUnitID string, amount float64, expenseDate string) error {
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

func requireString(fields map[string]string, key string, value string) {
	if strings.TrimSpace(value) == "" {
		fields[key] = "Required"
	}
}
