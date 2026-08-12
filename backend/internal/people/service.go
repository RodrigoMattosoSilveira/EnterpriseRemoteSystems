package people

import "context"

type Service interface {
	List(ctx context.Context, tenantID string, filter PersonListFilter) ([]PersonDTO, int64, error)
	Create(ctx context.Context, tenantID string, req CreatePersonRequest, actorUserID string) (*PersonDTO, error)
	GetByID(ctx context.Context, tenantID string, id string) (*PersonDTO, error)
	Update(ctx context.Context, tenantID string, id string, req UpdatePersonRequest, actorUserID string) (*PersonDTO, error)
}
