package pricelists

import (
	"context"
	"strings"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/tenants"
	"gorm.io/gorm"
)

const defaultTenantID = tenants.DefaultTenantID

type gormRepository struct{ db *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{db: database} }

func (r *gormRepository) ListItems(ctx context.Context, filter PriceListItemListFilter) ([]db.ExpensePriceListItem, error) {
	var rows []db.ExpensePriceListItem
	q := r.db.WithContext(ctx).Where("tenant_id = ?", defaultTenantID)
	if !filter.IncludeInactive {
		q = q.Where("active = ?", true)
	}
	if itemType := normalizeItemType(filter.ItemType); itemType != "" {
		q = q.Where("item_type = ?", itemType)
	}
	err := q.Order("item_type ASC, sort_order ASC, description ASC").Find(&rows).Error
	return rows, err
}

func (r *gormRepository) CreateItem(ctx context.Context, item *db.ExpensePriceListItem) error {
	return r.db.WithContext(ctx).Create(item).Error
}

func (r *gormRepository) UpdateItem(ctx context.Context, item *db.ExpensePriceListItem) error {
	return r.db.WithContext(ctx).
		Model(&db.ExpensePriceListItem{}).
		Where("id = ? AND tenant_id = ?", item.ID, defaultTenantID).
		Updates(map[string]any{
			"item_type":      item.ItemType,
			"code":           item.Code,
			"description":    item.Description,
			"unit_price_brl": item.UnitPriceBRL,
			"active":         item.Active,
			"sort_order":     item.SortOrder,
			"updated_at":     item.UpdatedAt,
		}).Error
}

func (r *gormRepository) FindItemByID(ctx context.Context, id string) (*db.ExpensePriceListItem, error) {
	var row db.ExpensePriceListItem
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", strings.TrimSpace(id), defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) ListGoldPrices(ctx context.Context, filter GoldPriceListFilter) ([]db.GoldPrice, error) {
	var rows []db.GoldPrice
	q := r.db.WithContext(ctx).Where("tenant_id = ?", defaultTenantID)
	if !filter.IncludeInactive {
		q = q.Where("active = ?", true)
	}
	err := q.Order("price_date DESC, created_at DESC").Find(&rows).Error
	return rows, err
}

func (r *gormRepository) CreateGoldPrice(ctx context.Context, price *db.GoldPrice) error {
	return r.db.WithContext(ctx).Create(price).Error
}

func (r *gormRepository) FindGoldPriceByID(ctx context.Context, id string) (*db.GoldPrice, error) {
	var row db.GoldPrice
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", strings.TrimSpace(id), defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindLatestActiveGoldPrice(ctx context.Context) (*db.GoldPrice, error) {
	var row db.GoldPrice
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND active = ?", defaultTenantID, true).
		Order("price_date DESC, created_at DESC").
		First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) UpdateGoldPrice(ctx context.Context, price *db.GoldPrice) error {
	return r.db.WithContext(ctx).
		Model(&db.GoldPrice{}).
		Where("id = ? AND tenant_id = ?", price.ID, defaultTenantID).
		Updates(map[string]any{
			"brl_per_gram": price.BRLPerGram,
			"recorded_by":  price.RecordedBy,
			"notes":        price.Notes,
			"active":       price.Active,
			"updated_at":   price.UpdatedAt,
		}).Error
}
