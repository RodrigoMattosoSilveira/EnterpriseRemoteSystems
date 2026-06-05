package people

import "context"

type Service interface {
	List(ctx context.Context, filter PersonListFilter) ([]PersonDTO, int64, error)
	Create(ctx context.Context, req CreatePersonRequest, actorUserID string) (*PersonDTO, error)
	GetByID(ctx context.Context, id string) (*PersonDTO, error)
	Update(ctx context.Context, id string, req UpdatePersonRequest, actorUserID string) (*PersonDTO, error)
}
