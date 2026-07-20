package tenants

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type TenantRecord struct {
	Tenant           db.Tenant
	TenantAdminCount int64
}

type TenantAdminCandidateRecord struct {
	ActorID     string
	ActorKey    string
	DisplayName string
	Active      bool
	Assigned    bool
}

type Repository interface {
	List(ctx context.Context) ([]TenantRecord, error)
	FindByID(ctx context.Context, id string) (*TenantRecord, error)
	CodeExists(ctx context.Context, code string, excludeID string) (bool, error)
	Create(ctx context.Context, tenant *db.Tenant) error
	Update(ctx context.Context, tenant *db.Tenant) error
	SetActive(ctx context.Context, tenantID string, active bool) error
	ExistsByID(ctx context.Context, id string) (bool, error)
	ExistsActiveByID(ctx context.Context, id string) (bool, error)
	ListTenantAdminCandidates(ctx context.Context, tenantID string) ([]TenantAdminCandidateRecord, error)
	AssignTenantAdmin(ctx context.Context, tenantID string, actorID string) error
	RevokeTenantAdmin(ctx context.Context, tenantID string, actorID string) error
}
