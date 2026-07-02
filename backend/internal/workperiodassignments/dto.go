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

type BulkPlanWorkPeriodAssignmentsRequest struct {
	Rows []BulkPlanWorkPeriodAssignmentRow `json:"rows"`
}

type BulkPlanWorkPeriodAssignmentRow struct {
	CollaboratorID             string `json:"collaboratorId"`
	Selected                   bool   `json:"selected"`
	SectorID                   string `json:"sectorId"`
	LocationID                 string `json:"locationId"`
	TaskID                     string `json:"taskId"`
	ReplacementForAssignmentID string `json:"replacementForAssignmentId"`
}

type BulkPlanWorkPeriodAssignmentsResult struct {
	Assignments   []WorkPeriodAssignmentDTO `json:"assignments"`
	SelectedCount int                       `json:"selectedCount"`
}

// PlanAssignmentRefinementRequest captures a focused planning refinement for a single
// collaborator row. The current Work Period assignment is still saved through bulk-plan;
// ApplyToFutureDefaults explicitly updates the collaborator Journey planning defaults.
type PlanAssignmentRefinementRequest struct {
	CollaboratorID        string `json:"collaboratorId"`
	SectorID              string `json:"sectorId"`
	LocationID            string `json:"locationId"`
	TaskID                string `json:"taskId"`
	ApplyToFutureDefaults bool   `json:"applyToFutureDefaults"`
}

type PlanAssignmentRefinementResult struct {
	CollaboratorID        string `json:"collaboratorId"`
	SectorID              string `json:"sectorId"`
	SectorLabel           string `json:"sectorLabel,omitempty"`
	LocationID            string `json:"locationId"`
	LocationLabel         string `json:"locationLabel,omitempty"`
	TaskID                string `json:"taskId"`
	TaskLabel             string `json:"taskLabel,omitempty"`
	ApplyToFutureDefaults bool   `json:"applyToFutureDefaults"`
	FutureDefaultsUpdated bool   `json:"futureDefaultsUpdated"`
}

type WorkPeriodPlanningTemplateDTO struct {
	WorkPeriodID       string                          `json:"workPeriodId"`
	SourceWorkPeriodID string                          `json:"sourceWorkPeriodId,omitempty"`
	SourceWorkDate     string                          `json:"sourceWorkDate,omitempty"`
	SourcePeriodName   string                          `json:"sourcePeriodName,omitempty"`
	Rows               []WorkPeriodPlanningTemplateRow `json:"rows"`
}

type WorkPeriodPlanningTemplateRow struct {
	AssignmentID         string `json:"assignmentId,omitempty"`
	TemplateAssignmentID string `json:"templateAssignmentId,omitempty"`
	CollaboratorID       string `json:"collaboratorId"`
	CollaboratorName     string `json:"collaboratorName,omitempty"`
	CollaboratorNickname string `json:"collaboratorNickname,omitempty"`
	ProjectedEndDate     string `json:"projectedEndDate,omitempty"`
	Selected             bool   `json:"selected"`
	SectorID             string `json:"sectorId"`
	SectorLabel          string `json:"sectorLabel,omitempty"`
	LocationID           string `json:"locationId"`
	LocationLabel        string `json:"locationLabel,omitempty"`
	TaskID               string `json:"taskId"`
	TaskLabel            string `json:"taskLabel,omitempty"`
}

type MarkActualOutcomeRequest struct {
	ActualStatus string `json:"actualStatus"`
}

type WorkPeriodAssignmentListFilter struct {
	PlannedStatus   string `query:"plannedStatus"`
	ActualStatus    string `query:"actualStatus"`
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
