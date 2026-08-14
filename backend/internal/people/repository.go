package people

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	// Legacy-compatible tenant People operations. The repository overlays the
	// authoritative GlobalPerson fields through PersonTenantMembership before
	// returning rows, so tenant projections never become independent identities.
	List(ctx context.Context, tenantID string, filter PersonListFilter) ([]db.Person, int64, error)
	Create(ctx context.Context, person *db.Person) error
	FindByID(ctx context.Context, tenantID string, id string) (*db.Person, error)
	Update(ctx context.Context, tenantID string, person *db.Person) error
	ExistsActivePersonStatus(ctx context.Context, tenantID string, statusID string) (bool, error)

	// Bite 30B global identity / membership foundation.
	SearchGlobal(ctx context.Context, tenantID string, filter GlobalPersonSearchFilter) ([]db.GlobalPerson, int64, error)
	CreateMembership(ctx context.Context, tenantID string, req CreatePersonMembershipRequest) (*db.Person, error)
	FindMembershipByLegacyPersonID(ctx context.Context, tenantID string, legacyPersonID string) (*db.PersonTenantMembership, error)

	UniqueConflicts(
		ctx context.Context,
		tenantID string,
		cpf string,
		rg string,
		cellular string,
		email string,
		pixKey *string,
		excludeID *string,
	) (map[string]bool, error)
}
