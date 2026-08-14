package referencedata

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	ListByType(ctx context.Context, tenantID string, typ string) ([]db.ReferenceData, error)
	FindByID(ctx context.Context, tenantID string, id string) (*db.ReferenceData, error)
	Create(ctx context.Context, item *db.ReferenceData) error
	Update(ctx context.Context, item *db.ReferenceData) error
	ExistsByTenantTypeCode(ctx context.Context, tenantID string, typ string, code string, excludeID string) (bool, error)
	ExistsByTenantTypeLabel(ctx context.Context, tenantID string, typ string, label string, excludeID string) (bool, error)
	ExistsActiveTenantByID(ctx context.Context, tenantID string) (bool, error)
}
