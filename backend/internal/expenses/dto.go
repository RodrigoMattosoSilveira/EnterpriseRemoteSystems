package expenses

type ExpenseDTO struct {
	ID                     string                      `json:"id"`
	TenantID               string                      `json:"tenantId"`
	CollaboratorID         string                      `json:"collaboratorId"`
	CollaboratorLabel      string                      `json:"collaboratorLabel,omitempty"`
	ExpenseCategoryID      string                      `json:"expenseCategoryId"`
	ExpenseCategoryLabel   string                      `json:"expenseCategoryLabel,omitempty"`
	ValueUnitID            string                      `json:"valueUnitId"`
	ValueUnitLabel         string                      `json:"valueUnitLabel,omitempty"`
	Amount                 float64                     `json:"amount"`
	ExpenseDate            string                      `json:"expenseDate"`
	Description            string                      `json:"description,omitempty"`
	Active                 bool                        `json:"active"`
	PriceListItemID        *string                     `json:"priceListItemId,omitempty"`
	PriceListItemCode      string                      `json:"priceListItemCode,omitempty"`
	ItemType               string                      `json:"itemType,omitempty"`
	ItemDescription        string                      `json:"itemDescription,omitempty"`
	Quantity               *float64                    `json:"quantity,omitempty"`
	UnitPriceBRL           *float64                    `json:"unitPriceBrl,omitempty"`
	CurrencyCode           string                      `json:"currencyCode,omitempty"`
	GoldPriceID            *string                     `json:"goldPriceId,omitempty"`
	GoldBRLPerGram         *float64                    `json:"goldBrlPerGram,omitempty"`
	GoldPriceDate          string                      `json:"goldPriceDate,omitempty"`
	UnitPriceAmount        *float64                    `json:"unitPriceAmount,omitempty"`
	TotalAmount            *float64                    `json:"totalAmount,omitempty"`
	CalculationMethod      string                      `json:"calculationMethod,omitempty"`
	CalculationDetailsJSON string                      `json:"calculationDetailsJson,omitempty"`
	FinancialPosting       *ExpenseFinancialPostingDTO `json:"financialPosting,omitempty"`
	CreatedAt              string                      `json:"createdAt"`
	UpdatedAt              string                      `json:"updatedAt"`
}

type ExpenseFinancialPostingDTO struct {
	LedgerEntryID      string  `json:"ledgerEntryId"`
	Direction          string  `json:"direction"`
	EntryType          string  `json:"entryType"`
	Amount             float64 `json:"amount"`
	SignedAmount       float64 `json:"signedAmount"`
	EffectiveDate      string  `json:"effectiveDate"`
	ValueUnitID        string  `json:"valueUnitId"`
	ValueUnitCode      string  `json:"valueUnitCode,omitempty"`
	ValueUnitLabel     string  `json:"valueUnitLabel,omitempty"`
	SourceType         string  `json:"sourceType"`
	SourceID           string  `json:"sourceId"`
	CorrectionType     string  `json:"correctionType"`
	ReceiptID          string  `json:"receiptId"`
	ReceiptNumber      string  `json:"receiptNumber,omitempty"`
	ReceiptStatus      string  `json:"receiptStatus"`
	OutstandingReceipt bool    `json:"outstandingReceipt"`
}

type CreateExpenseRequest struct {
	CollaboratorID    string  `json:"collaboratorId"`
	ExpenseCategoryID string  `json:"expenseCategoryId"`
	ValueUnitID       string  `json:"valueUnitId"`
	Amount            float64 `json:"amount"`
	ExpenseDate       string  `json:"expenseDate"`
	Description       string  `json:"description"`
	PriceListItemID   string  `json:"priceListItemId"`
	CurrencyCode      string  `json:"currencyCode"`
	Quantity          float64 `json:"quantity"`
}

type UpdateExpenseRequest struct {
	CollaboratorID    string  `json:"collaboratorId"`
	ExpenseCategoryID string  `json:"expenseCategoryId"`
	ValueUnitID       string  `json:"valueUnitId"`
	Amount            float64 `json:"amount"`
	ExpenseDate       string  `json:"expenseDate"`
	Description       string  `json:"description"`
	PriceListItemID   string  `json:"priceListItemId"`
	CurrencyCode      string  `json:"currencyCode"`
	Quantity          float64 `json:"quantity"`
}

type ExpenseListFilter struct {
	CollaboratorID    string `query:"collaboratorId"`
	ExpenseCategoryID string `query:"expenseCategoryId"`
	ValueUnitID       string `query:"valueUnitId"`
	ItemType          string `query:"itemType"`
	PriceListItemID   string `query:"priceListItemId"`
	CurrencyCode      string `query:"currencyCode"`
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
