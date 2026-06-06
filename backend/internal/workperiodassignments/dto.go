package workperiodassignments

type WorkPeriodAssignmentDTO struct {
	ID                         string `json:"id"`
	TenantID                   string `json:"tenantId"`
	WorkPeriodID               string `json:"workPeriodId"`
	CollaboratorID             string `json:"collaboratorId"`
	CollaboratorName           string `json:"collaboratorName,omitempty"`
	CollaboratorNickname       string `json:"collaboratorNickname,omitempty"`
	PlannedStatus              string `json:"plannedStatus"`
	ActualStatus               string `json:"actualStatus,omitempty"`
	ReplacementForAssignmentID string `json:"replacementForAssignmentId,omitempty"`
	SectorID                   string `json:"sectorId"`
	SectorLabel                string `json:"sectorLabel,omitempty"`
	LocationID                 string `json:"locationId"`
	LocationLabel              string `json:"locationLabel,omitempty"`
	TaskID                     string `json:"taskId"`
	TaskLabel                  string `json:"taskLabel,omitempty"`
	Active                     bool   `json:"active"`
	CreatedAt                  string `json:"createdAt"`
	UpdatedAt                  string `json:"updatedAt"`
}

type CreateWorkPeriodAssignmentRequest struct {
	CollaboratorID             string `json:"collaboratorId"`
	PlannedStatus              string `json:"plannedStatus"`
	ReplacementForAssignmentID string `json:"replacementForAssignmentId"`
	SectorID                   string `json:"sectorId"`
	LocationID                 string `json:"locationId"`
	TaskID                     string `json:"taskId"`
}

type UpdateWorkPeriodAssignmentRequest struct {
	CollaboratorID             string `json:"collaboratorId"`
	PlannedStatus              string `json:"plannedStatus"`
	ReplacementForAssignmentID string `json:"replacementForAssignmentId"`
	SectorID                   string `json:"sectorId"`
	LocationID                 string `json:"locationId"`
	TaskID                     string `json:"taskId"`
}

type WorkPeriodAssignmentListFilter struct {
	PlannedStatus   string `query:"plannedStatus"`
	CollaboratorID  string `query:"collaboratorId"`
	IncludeInactive bool   `query:"includeInactive"`
	Page            int    `query:"page"`
	PageSize        int    `query:"pageSize"`
}

type WorkPeriodAssignmentListResult struct {
	Items    []WorkPeriodAssignmentDTO `json:"items"`
	Total    int64                     `json:"total"`
	Page     int                       `json:"page"`
	PageSize int                       `json:"pageSize"`
}
