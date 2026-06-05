package expenses

import "strings"

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

func ValidateCreateExpense(req CreateExpenseRequest) error {
	fields := map[string]string{}
	requireString(fields, "collaboratorId", req.CollaboratorID)
	requireString(fields, "expenseCategoryId", req.ExpenseCategoryID)
	requireString(fields, "valueUnitId", req.ValueUnitID)
	requireString(fields, "expenseDate", req.ExpenseDate)

	if strings.TrimSpace(req.ExpenseDate) != "" {
		if _, err := parseDate(req.ExpenseDate); err != nil {
			fields["expenseDate"] = "Expense date must be YYYY-MM-DD"
		}
	}

	if req.Amount <= 0 {
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
