package accruals

type AccrualRunDTO struct {
	ID           string            `json:"id"`
	TenantID     string            `json:"tenantId"`
	WorkPeriodID string            `json:"workPeriodId"`
	Status       string            `json:"status"`
	AccrualDate  string            `json:"accrualDate"`
	Notes        string            `json:"notes,omitempty"`
	Summary      AccrualSummaryDTO `json:"summary"`
	CreatedAt    string            `json:"createdAt"`
	UpdatedAt    string            `json:"updatedAt"`
}

type AccrualSummaryDTO struct {
	TotalItems   int `json:"totalItems"`
	ReadyItems   int `json:"readyItems"`
	PendingItems int `json:"pendingItems"`
	SkippedItems int `json:"skippedItems"`
	PostedItems  int `json:"postedItems"`
}

type AccrualItemDTO struct {
	ID                     string   `json:"id"`
	TenantID               string   `json:"tenantId"`
	PersonID               string   `json:"personId"`
	AccrualRunID           string   `json:"accrualRunId"`
	WorkPeriodID           string   `json:"workPeriodId"`
	WorkPeriodAssignmentID string   `json:"workPeriodAssignmentId,omitempty"`
	CollaboratorID         string   `json:"collaboratorId"`
	CollaboratorName       string   `json:"collaboratorName,omitempty"`
	CalculationType        string   `json:"calculationType"`
	Direction              string   `json:"direction"`
	BRLAmount              *float64 `json:"brlAmount,omitempty"`
	GoldGramAmount         *float64 `json:"goldGramAmount,omitempty"`
	Status                 string   `json:"status"`
	PendingReason          string   `json:"pendingReason,omitempty"`
	Description            string   `json:"description,omitempty"`
	CreatedAt              string   `json:"createdAt"`
	UpdatedAt              string   `json:"updatedAt"`
}

type CreateAccrualRunRequest struct {
	AccrualDate string `json:"accrualDate"`
	Notes       string `json:"notes"`
}

type AccrualRunListFilter struct {
	Status   string `query:"status"`
	Page     int    `query:"page"`
	PageSize int    `query:"pageSize"`
}

type AccrualItemListFilter struct {
	Status         string `query:"status"`
	PendingReason  string `query:"pendingReason"`
	CollaboratorID string `query:"collaboratorId"`
	Page           int    `query:"page"`
	PageSize       int    `query:"pageSize"`
}

type AccrualRunListResult struct {
	Items    []AccrualRunDTO `json:"items"`
	Total    int64           `json:"total"`
	Page     int             `json:"page"`
	PageSize int             `json:"pageSize"`
}

type AccrualItemListResult struct {
	Items    []AccrualItemDTO `json:"items"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"pageSize"`
}
