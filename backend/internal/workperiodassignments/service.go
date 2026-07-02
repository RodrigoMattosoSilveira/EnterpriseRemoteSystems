package workperiodassignments

import "context"

type Service interface {
	ListByWorkPeriod(ctx context.Context, workPeriodID string, filter WorkPeriodAssignmentListFilter) (*WorkPeriodAssignmentListResult, error)
	GetPlanningTemplate(ctx context.Context, workPeriodID string) (*WorkPeriodPlanningTemplateDTO, error)
	BulkPlan(ctx context.Context, workPeriodID string, req BulkPlanWorkPeriodAssignmentsRequest, actorUserID string) (*BulkPlanWorkPeriodAssignmentsResult, error)
	RefinePlanAssignment(ctx context.Context, workPeriodID string, req PlanAssignmentRefinementRequest, actorUserID string) (*PlanAssignmentRefinementResult, error)
	Create(ctx context.Context, workPeriodID string, req CreateWorkPeriodAssignmentRequest, actorUserID string) (*WorkPeriodAssignmentDTO, error)
	GetByID(ctx context.Context, id string) (*WorkPeriodAssignmentDTO, error)
	Update(ctx context.Context, id string, req UpdateWorkPeriodAssignmentRequest, actorUserID string) (*WorkPeriodAssignmentDTO, error)
	MarkActualOutcome(ctx context.Context, id string, req MarkActualOutcomeRequest, actorUserID string) (*WorkPeriodAssignmentDTO, error)
	Deactivate(ctx context.Context, id string, actorUserID string) (*WorkPeriodAssignmentDTO, error)
	Delete(ctx context.Context, id string, actorUserID string) error
}
