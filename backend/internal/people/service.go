package people

import "context"

type Service interface {
	List(ctx context.Context, tenantID string, filter PersonListFilter) ([]PersonDTO, int64, error)
	Create(ctx context.Context, tenantID string, req CreatePersonRequest, actorUserID string) (*PersonDTO, error)
	GetByID(ctx context.Context, tenantID string, id string) (*PersonDTO, error)
	Update(ctx context.Context, tenantID string, id string, req UpdatePersonRequest, actorUserID string) (*PersonDTO, error)
	SearchGlobal(ctx context.Context, tenantID string, filter GlobalPersonSearchFilter) ([]GlobalPersonDTO, int64, error)
	CreateMembership(ctx context.Context, tenantID string, req CreatePersonMembershipRequest, actorUserID string) (*PersonDTO, error)
	Reactivate(ctx context.Context, tenantID string, id string, actorUserID string) (*PersonDTO, error)
}
