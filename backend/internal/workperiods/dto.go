package workperiods

type WorkPeriodDTO struct {
	ID              string `json:"id"`
	TenantID        string `json:"tenantId"`
	WorkDate        string `json:"workDate"`
	PeriodCode      string `json:"periodCode"`
	Name            string `json:"name"`
	StartsAt        string `json:"startsAt"`
	EndsAt          string `json:"endsAt"`
	Status          string `json:"status"`
	InformedAt      string `json:"informedAt,omitempty"`
	AccrualOpenedAt string `json:"accrualOpenedAt,omitempty"`
	ClosedAt        string `json:"closedAt,omitempty"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type CreateWorkPeriodRequest struct {
	WorkDate   string `json:"workDate"`
	PeriodCode string `json:"periodCode"`
	Name       string `json:"name"`
	StartsAt   string `json:"startsAt"`
	EndsAt     string `json:"endsAt"`
}

type WorkPeriodListFilter struct {
	DateFrom string `query:"dateFrom"`
	DateTo   string `query:"dateTo"`
	Status   string `query:"status"`
	Page     int    `query:"page"`
	PageSize int    `query:"pageSize"`
}

type WorkPeriodListResult struct {
	Items    []WorkPeriodDTO `json:"items"`
	Total    int64           `json:"total"`
	Page     int             `json:"page"`
	PageSize int             `json:"pageSize"`
}

type WorkPlanRosterDTO struct {
	WorkPeriodID string              `json:"workPeriodId"`
	WorkDate     string              `json:"workDate"`
	DisplayDate  string              `json:"displayDate"`
	PeriodCode   string              `json:"periodCode"`
	PeriodName   string              `json:"periodName"`
	Title        string              `json:"title"`
	Subtitle     string              `json:"subtitle"`
	Status       string              `json:"status"`
	Rows         []WorkPlanRosterRow `json:"rows"`
}

type WorkPlanRosterRow struct {
	AssignmentID     string `json:"assignmentId"`
	CollaboratorID   string `json:"collaboratorId"`
	Name             string `json:"name"`
	Nickname         string `json:"nickname,omitempty"`
	SectorID         string `json:"sectorId"`
	SectorLabel      string `json:"sectorLabel"`
	LocationID       string `json:"locationId"`
	LocationLabel    string `json:"locationLabel"`
	TaskID           string `json:"taskId"`
	TaskLabel        string `json:"taskLabel"`
	ReplacementForID string `json:"replacementForAssignmentId,omitempty"`
}
