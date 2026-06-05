package expenses

type ExpenseDTO struct {
	ID                   string  `json:"id"`
	TenantID             string  `json:"tenantId"`
	CollaboratorID       string  `json:"collaboratorId"`
	CollaboratorLabel    string  `json:"collaboratorLabel,omitempty"`
	ExpenseCategoryID    string  `json:"expenseCategoryId"`
	ExpenseCategoryLabel string  `json:"expenseCategoryLabel,omitempty"`
	ValueUnitID          string  `json:"valueUnitId"`
	ValueUnitLabel       string  `json:"valueUnitLabel,omitempty"`
	Amount               float64 `json:"amount"`
	ExpenseDate          string  `json:"expenseDate"`
	Description          string  `json:"description,omitempty"`
	Active               bool    `json:"active"`
	CreatedAt            string  `json:"createdAt"`
	UpdatedAt            string  `json:"updatedAt"`
}

type CreateExpenseRequest struct {
	CollaboratorID    string  `json:"collaboratorId"`
	ExpenseCategoryID string  `json:"expenseCategoryId"`
	ValueUnitID       string  `json:"valueUnitId"`
	Amount            float64 `json:"amount"`
	ExpenseDate       string  `json:"expenseDate"`
	Description       string  `json:"description"`
}

type UpdateExpenseRequest struct {
	CollaboratorID    string  `json:"collaboratorId"`
	ExpenseCategoryID string  `json:"expenseCategoryId"`
	ValueUnitID       string  `json:"valueUnitId"`
	Amount            float64 `json:"amount"`
	ExpenseDate       string  `json:"expenseDate"`
	Description       string  `json:"description"`
}

type ExpenseListFilter struct {
	CollaboratorID    string `query:"collaboratorId"`
	ExpenseCategoryID string `query:"expenseCategoryId"`
	ValueUnitID       string `query:"valueUnitId"`
	DateFrom          string `query:"dateFrom"`
	DateTo            string `query:"dateTo"`
	IncludeInactive   bool   `query:"includeInactive"`
	Page              int    `query:"page"`
	PageSize          int    `query:"pageSize"`
}

type ExpenseListResult struct {
	Items    []ExpenseDTO `json:"items"`
	Total    int64        `json:"total"`
	Page     int          `json:"page"`
	PageSize int          `json:"pageSize"`
}
