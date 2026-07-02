package workperiodassignments

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	ListByWorkPeriod(ctx context.Context, workPeriodID string, filter normalizedWorkPeriodAssignmentListFilter) ([]db.WorkPeriodAssignment, int64, error)
	ListActiveAssignmentsForWorkPeriod(ctx context.Context, workPeriodID string) ([]db.WorkPeriodAssignment, error)
	ListActiveCollaboratorsForPlanning(ctx context.Context) ([]db.CollaboratorJourney, error)
	FindMostRecentPriorWorkPeriodByCode(ctx context.Context, workPeriod db.WorkPeriod) (*db.WorkPeriod, error)
	Create(ctx context.Context, assignment *db.WorkPeriodAssignment) error
	Update(ctx context.Context, assignment *db.WorkPeriodAssignment) error
	FindByID(ctx context.Context, id string) (*db.WorkPeriodAssignment, error)
	FindWorkPeriodByID(ctx context.Context, id string) (*db.WorkPeriod, error)
	FindCollaboratorByID(ctx context.Context, id string) (*db.CollaboratorJourney, error)
	FindReferenceByID(ctx context.Context, id string) (*db.ReferenceData, error)
	UpdateCollaboratorPlanningDefaults(ctx context.Context, collaboratorID string, sectorID string, locationID string, taskID string) error
	FindReplacementAssignmentByID(ctx context.Context, id string) (*db.WorkPeriodAssignment, error)
	ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error)
	ExistsActiveAssignmentForCollaborator(ctx context.Context, workPeriodID string, collaboratorID string, excludeID string) (bool, error)
}

type normalizedWorkPeriodAssignmentListFilter struct {
	PlannedStatus   string
	ActualStatus    string
	CollaboratorID  string
	IncludeInactive bool
	Page            int
	PageSize        int
}
