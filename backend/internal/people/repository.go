package people

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	List(ctx context.Context, tenantID string, filter PersonListFilter) ([]db.Person, int64, error)
	Create(ctx context.Context, person *db.Person) error
	FindByID(ctx context.Context, tenantID string, id string) (*db.Person, error)
	Update(ctx context.Context, tenantID string, person *db.Person) error
	ExistsActivePersonStatus(ctx context.Context, tenantID string, statusID string) (bool, error)

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
