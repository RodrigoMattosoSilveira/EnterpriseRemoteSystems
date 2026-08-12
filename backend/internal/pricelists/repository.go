package pricelists

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	ListItems(ctx context.Context, tenantID string, filter PriceListItemListFilter) ([]db.ExpensePriceListItem, error)
	CreateItem(ctx context.Context, item *db.ExpensePriceListItem) error
	UpdateItem(ctx context.Context, tenantID string, item *db.ExpensePriceListItem) error
	ReplaceItemWithRevision(ctx context.Context, tenantID string, existing *db.ExpensePriceListItem, replacement *db.ExpensePriceListItem) error
	SetItemActive(ctx context.Context, tenantID string, item *db.ExpensePriceListItem) error
	FindItemByID(ctx context.Context, tenantID string, id string) (*db.ExpensePriceListItem, error)
	FindActiveItemByKey(ctx context.Context, tenantID string, itemType string, code string) (*db.ExpensePriceListItem, error)
	ListGoldPrices(ctx context.Context, tenantID string, filter GoldPriceListFilter) ([]db.GoldPrice, error)
	CreateGoldPrice(ctx context.Context, price *db.GoldPrice) error
	FindActiveGoldPriceByDate(ctx context.Context, tenantID string, priceDate string) (*db.GoldPrice, error)
	ReplaceActiveGoldPrice(ctx context.Context, tenantID string, existing *db.GoldPrice, replacement *db.GoldPrice) error
	FindGoldPriceByID(ctx context.Context, tenantID string, id string) (*db.GoldPrice, error)
	FindLatestActiveGoldPrice(ctx context.Context, tenantID string) (*db.GoldPrice, error)
	UpdateGoldPrice(ctx context.Context, tenantID string, price *db.GoldPrice) error
}
