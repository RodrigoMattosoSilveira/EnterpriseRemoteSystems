package workperiodassignments

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	ListByWorkPeriod(ctx context.Context, workPeriodID string, filter normalizedWorkPeriodAssignmentListFilter) ([]db.WorkPeriodAssignment, int64, error)
	Create(ctx context.Context, assignment *db.WorkPeriodAssignment) error
	Update(ctx context.Context, assignment *db.WorkPeriodAssignment) error
	FindByID(ctx context.Context, id string) (*db.WorkPeriodAssignment, error)
	FindWorkPeriodByID(ctx context.Context, id string) (*db.WorkPeriod, error)
	FindCollaboratorByID(ctx context.Context, id string) (*db.CollaboratorJourney, error)
	FindReplacementAssignmentByID(ctx context.Context, id string) (*db.WorkPeriodAssignment, error)
	ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error)
	ExistsActiveAssignmentForCollaborator(ctx context.Context, workPeriodID string, collaboratorID string, excludeID string) (bool, error)
}

type normalizedWorkPeriodAssignmentListFilter struct {
	PlannedStatus   string
	CollaboratorID  string
	IncludeInactive bool
	Page            int
	PageSize        int
}
