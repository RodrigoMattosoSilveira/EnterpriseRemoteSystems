package tenants

import "context"

type Service interface {
	GetCurrent(ctx context.Context) (*TenantDTO, error)
	RequireActiveDefault(ctx context.Context) error
}
