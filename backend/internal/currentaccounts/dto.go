package currentaccounts

type LedgerEntryDTO struct {
	ID                string  `json:"id"`
	TenantID          string  `json:"tenantId"`
	CollaboratorID    string  `json:"collaboratorId"`
	CollaboratorLabel string  `json:"collaboratorLabel,omitempty"`
	ValueUnitID       string  `json:"valueUnitId"`
	ValueUnitLabel    string  `json:"valueUnitLabel,omitempty"`
	ValueUnitCode     string  `json:"valueUnitCode,omitempty"`
	EntryType         string  `json:"entryType"`
	Direction         string  `json:"direction"`
	Amount            float64 `json:"amount"`
	SignedAmount      float64 `json:"signedAmount"`
	EffectiveDate     string  `json:"effectiveDate"`
	SourceType        string  `json:"sourceType"`
	SourceID          string  `json:"sourceId"`
	Description       string  `json:"description,omitempty"`
	Active            bool    `json:"active"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

type CurrentAccountBalanceDTO struct {
	CollaboratorID    string  `json:"collaboratorId"`
	CollaboratorLabel string  `json:"collaboratorLabel,omitempty"`
	ValueUnitID       string  `json:"valueUnitId"`
	ValueUnitCode     string  `json:"valueUnitCode,omitempty"`
	ValueUnitLabel    string  `json:"valueUnitLabel,omitempty"`
	Balance           float64 `json:"balance"`
}

type LedgerEntryListFilter struct {
	ValueUnitID     string `query:"valueUnitId"`
	EntryType       string `query:"entryType"`
	SourceType      string `query:"sourceType"`
	DateFrom        string `query:"dateFrom"`
	DateTo          string `query:"dateTo"`
	IncludeInactive bool   `query:"includeInactive"`
	Page            int    `query:"page"`
	PageSize        int    `query:"pageSize"`
}

type LedgerEntryListResult struct {
	Items    []LedgerEntryDTO `json:"items"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"pageSize"`
}
