package collaborators

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	List(ctx context.Context, filter CollaboratorListFilter) ([]db.CollaboratorJourney, int64, error)
	Create(ctx context.Context, collaborator *db.CollaboratorJourney) error
	FindByID(ctx context.Context, id string) (*db.CollaboratorJourney, error)
	FindPersonByID(ctx context.Context, personID string) (*db.Person, error)
	FindActiveReference(ctx context.Context, id string, typ string) (*db.ReferenceData, error)
	ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error)
	ExistsActiveJourneyForPerson(ctx context.Context, personID string) (bool, error)
}
