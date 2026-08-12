package referencedata

import "context"

type Service interface {
	ListByType(ctx context.Context, tenantID string, typ string) ([]ReferenceDataDTO, error)
	Create(ctx context.Context, tenantID string, typ string, req CreateReferenceDataRequest) (*ReferenceDataDTO, error)
	Update(ctx context.Context, tenantID string, typ string, id string, req UpdateReferenceDataRequest) (*ReferenceDataDTO, error)
	Deactivate(ctx context.Context, tenantID string, typ string, id string) (*ReferenceDataDTO, error)
	Reactivate(ctx context.Context, tenantID string, typ string, id string) (*ReferenceDataDTO, error)
}
