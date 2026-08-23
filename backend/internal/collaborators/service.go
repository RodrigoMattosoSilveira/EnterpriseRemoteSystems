package collaborators

import (
	"context"

	"enterpriseremotesystems/backend/internal/people"
)

type Service interface {
	List(ctx context.Context, filter CollaboratorListFilter) ([]CollaboratorDTO, int64, error)
	ListSelf(ctx context.Context, membershipID string) ([]CollaboratorDTO, error)
	ListCandidates(ctx context.Context) ([]people.PersonDTO, error)
	Create(ctx context.Context, req CreateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error)
	GetByID(ctx context.Context, id string) (*CollaboratorDTO, error)
	GetSelfByID(ctx context.Context, id string, membershipID string) (*CollaboratorDTO, error)
	Update(ctx context.Context, id string, req UpdateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error)
	UpdateWorkAssignment(ctx context.Context, id string, req UpdateCollaboratorWorkAssignmentRequest, actorUserID string) (*CollaboratorDTO, error)
}
