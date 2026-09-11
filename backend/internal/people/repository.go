package people

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	// Tenant People operations are Membership-native as of Bite 30K.1. The
	// db.Person return type is a temporary API compatibility projection whose ID
	// is the canonical Global Person ID; no legacy people row is persisted.
	List(ctx context.Context, tenantID string, filter PersonListFilter) ([]db.Person, int64, error)
	Create(ctx context.Context, person *db.Person) error
	FindByID(ctx context.Context, tenantID string, id string) (*db.Person, error)
	Update(ctx context.Context, tenantID string, person *db.Person) error
	ExistsActivePersonStatus(ctx context.Context, tenantID string, statusID string) (bool, error)

	// Global identity / Membership operations.
	SearchGlobal(ctx context.Context, tenantID string, filter GlobalPersonSearchFilter) ([]db.GlobalPerson, int64, error)
	CreateMembership(ctx context.Context, tenantID string, req CreatePersonMembershipRequest) (*db.Person, error)
	Reactivate(ctx context.Context, tenantID string, personID string) (*db.Person, error)

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
