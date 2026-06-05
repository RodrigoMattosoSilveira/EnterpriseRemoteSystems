package tenants

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	FindByID(ctx context.Context, id string) (*db.Tenant, error)
	ExistsActiveByID(ctx context.Context, id string) (bool, error)
}
