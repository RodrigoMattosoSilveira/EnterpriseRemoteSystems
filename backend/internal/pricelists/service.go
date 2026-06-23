package pricelists

import "context"

type Service interface {
	ListItems(ctx context.Context, filter PriceListItemListFilter) ([]PriceListItemDTO, error)
	CreateItem(ctx context.Context, req CreatePriceListItemRequest) (*PriceListItemDTO, error)
	UpdateItem(ctx context.Context, id string, req UpdatePriceListItemRequest) (*PriceListItemDTO, error)
	DeactivateItem(ctx context.Context, id string) (*PriceListItemDTO, error)
	ListGoldPrices(ctx context.Context, filter GoldPriceListFilter) ([]GoldPriceDTO, error)
	CreateGoldPrice(ctx context.Context, req CreateGoldPriceRequest) (*GoldPriceDTO, error)
	LatestGoldPrice(ctx context.Context) (*GoldPriceDTO, error)
	DeactivateGoldPrice(ctx context.Context, id string) (*GoldPriceDTO, error)
}
