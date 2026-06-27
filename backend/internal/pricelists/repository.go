package pricelists

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	ListItems(ctx context.Context, filter PriceListItemListFilter) ([]db.ExpensePriceListItem, error)
	CreateItem(ctx context.Context, item *db.ExpensePriceListItem) error
	UpdateItem(ctx context.Context, item *db.ExpensePriceListItem) error
	ReplaceItemWithRevision(ctx context.Context, existing *db.ExpensePriceListItem, replacement *db.ExpensePriceListItem) error
	SetItemActive(ctx context.Context, item *db.ExpensePriceListItem) error
	FindItemByID(ctx context.Context, id string) (*db.ExpensePriceListItem, error)
	FindActiveItemByKey(ctx context.Context, itemType string, code string) (*db.ExpensePriceListItem, error)
	ListGoldPrices(ctx context.Context, filter GoldPriceListFilter) ([]db.GoldPrice, error)
	CreateGoldPrice(ctx context.Context, price *db.GoldPrice) error
	FindActiveGoldPriceByDate(ctx context.Context, priceDate string) (*db.GoldPrice, error)
	ReplaceActiveGoldPrice(ctx context.Context, existing *db.GoldPrice, replacement *db.GoldPrice) error
	FindGoldPriceByID(ctx context.Context, id string) (*db.GoldPrice, error)
	FindLatestActiveGoldPrice(ctx context.Context) (*db.GoldPrice, error)
	UpdateGoldPrice(ctx context.Context, price *db.GoldPrice) error
}
