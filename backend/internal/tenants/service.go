package tenants

import "context"

type Service interface {
	List(ctx context.Context) ([]TenantDTO, error)
	GetByID(ctx context.Context, id string) (*TenantDTO, error)
	GetCurrent(ctx context.Context, tenantID string) (*TenantDTO, error)
	Create(ctx context.Context, req CreateTenantRequest) (*TenantDTO, error)
	Update(ctx context.Context, id string, req UpdateTenantRequest) (*TenantDTO, error)
	SetActive(ctx context.Context, id string, active bool) (*TenantDTO, error)
	ListTenantAdminCandidates(ctx context.Context, tenantID string) ([]TenantAdminCandidateDTO, error)
	AssignTenantAdmin(ctx context.Context, tenantID string, actorID string) (*TenantDTO, error)
	RevokeTenantAdmin(ctx context.Context, tenantID string, actorID string) (*TenantDTO, error)
	RequireActive(ctx context.Context, tenantID string) error
	RequireActiveDefault(ctx context.Context) error
}
