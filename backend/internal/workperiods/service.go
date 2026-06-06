package workperiods

import "context"

type Service interface {
	List(ctx context.Context, filter WorkPeriodListFilter) (*WorkPeriodListResult, error)
	Create(ctx context.Context, req CreateWorkPeriodRequest, actorUserID string) (*WorkPeriodDTO, error)
	GetByID(ctx context.Context, id string) (*WorkPeriodDTO, error)
	Inform(ctx context.Context, id string, actorUserID string) (*WorkPeriodDTO, error)
}
