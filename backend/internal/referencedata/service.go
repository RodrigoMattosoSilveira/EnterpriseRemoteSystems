package referencedata

import "context"

type Service interface {
	ListByType(ctx context.Context, typ string) ([]ReferenceDataDTO, error)
	Create(ctx context.Context, typ string, req CreateReferenceDataRequest) (*ReferenceDataDTO, error)
	Update(ctx context.Context, typ string, id string, req UpdateReferenceDataRequest) (*ReferenceDataDTO, error)
	Deactivate(ctx context.Context, typ string, id string) (*ReferenceDataDTO, error)
	Reactivate(ctx context.Context, typ string, id string) (*ReferenceDataDTO, error)
}
