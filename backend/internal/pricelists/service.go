package pricelists

import "context"

type Service interface {
	ListItems(ctx context.Context, tenantID string, filter PriceListItemListFilter) ([]PriceListItemDTO, error)
	CreateItem(ctx context.Context, tenantID string, req CreatePriceListItemRequest) (*PriceListItemDTO, error)
	UpdateItem(ctx context.Context, tenantID string, id string, req UpdatePriceListItemRequest) (*PriceListItemDTO, error)
	DeactivateItem(ctx context.Context, tenantID string, id string) (*PriceListItemDTO, error)
	ReactivateItem(ctx context.Context, tenantID string, id string) (*PriceListItemDTO, error)
	ListGoldPrices(ctx context.Context, tenantID string, filter GoldPriceListFilter) ([]GoldPriceDTO, error)
	CreateGoldPrice(ctx context.Context, tenantID string, req CreateGoldPriceRequest) (*GoldPriceDTO, error)
	LatestGoldPrice(ctx context.Context, tenantID string) (*GoldPriceDTO, error)
	DeactivateGoldPrice(ctx context.Context, tenantID string, id string) (*GoldPriceDTO, error)
}
