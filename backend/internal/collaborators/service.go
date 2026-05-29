package collaborators

import "context"

type Service interface {
	List(ctx context.Context, filter CollaboratorListFilter) ([]CollaboratorDTO, int64, error)
	Create(ctx context.Context, req CreateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error)
	GetByID(ctx context.Context, id string) (*CollaboratorDTO, error)
}
