package collaborators

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	List(ctx context.Context, filter CollaboratorListFilter) ([]db.CollaboratorJourney, int64, error)
	ListForMembership(ctx context.Context, membershipID string) ([]db.CollaboratorJourney, error)
	ListCandidateMemberships(ctx context.Context) ([]db.PersonTenantMembership, error)
	Create(ctx context.Context, collaborator *db.CollaboratorJourney) error
	Update(ctx context.Context, collaborator *db.CollaboratorJourney) error
	UpdateWorkAssignment(ctx context.Context, collaborator *db.CollaboratorJourney) error
	UpdateExtension(ctx context.Context, collaborator *db.CollaboratorJourney) error
	FindByID(ctx context.Context, id string) (*db.CollaboratorJourney, error)
	FindByIDForMembership(ctx context.Context, id string, membershipID string) (*db.CollaboratorJourney, error)
	FindActiveMembershipByID(ctx context.Context, membershipID string) (*db.PersonTenantMembership, error)
	FindActiveMembershipByLegacyPersonID(ctx context.Context, legacyPersonID string) (*db.PersonTenantMembership, error)
	FindActiveReference(ctx context.Context, id string, typ string) (*db.ReferenceData, error)
	ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error)
	ExistsOpenJourneyForMembership(ctx context.Context, membershipID string) (bool, error)
}
