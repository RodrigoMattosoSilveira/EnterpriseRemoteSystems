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
			"item_type":                     item.ItemType,
			"code":                          item.Code,
			"description":                   item.Description,
			"unit_price_brl":                item.UnitPriceBRL,
			"active":                        item.Active,
			"sort_order":                    item.SortOrder,
			"superseded_price_list_item_id": item.SupersededPriceListItemID,
			"updated_at":                    item.UpdatedAt,
		}).Error
}

func (r *gormRepository) ReplaceItemWithRevision(ctx context.Context, existing *db.ExpensePriceListItem, replacement *db.ExpensePriceListItem) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		deactivate := tx.Model(&db.ExpensePriceListItem{}).
			Where("id = ? AND tenant_id = ?", existing.ID, defaultTenantID)
		if existing.ItemType == replacement.ItemType && existing.Code == replacement.Code {
			deactivate = tx.Model(&db.ExpensePriceListItem{}).
				Where("tenant_id = ? AND item_type = ? AND code = ? AND active = ?", defaultTenantID, existing.ItemType, existing.Code, true)
		}
		if err := deactivate.Updates(map[string]any{
			"active":     false,
			"updated_at": replacement.UpdatedAt,
		}).Error; err != nil {
			return err
		}

		replacement.Active = true
		return tx.Create(replacement).Error
	})
}

func (r *gormRepository) SetItemActive(ctx context.Context, item *db.ExpensePriceListItem) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if item.Active {
			if err := tx.Model(&db.ExpensePriceListItem{}).
				Where("tenant_id = ? AND item_type = ? AND code = ? AND active = ? AND id <> ?", defaultTenantID, item.ItemType, item.Code, true, item.ID).
				Updates(map[string]any{
					"active":     false,
					"updated_at": item.UpdatedAt,
				}).Error; err != nil {
				return err
			}
		}
		return tx.Model(&db.ExpensePriceListItem{}).
			Where("id = ? AND tenant_id = ?", item.ID, defaultTenantID).
			Updates(map[string]any{
				"active":     item.Active,
				"updated_at": item.UpdatedAt,
			}).Error
	})
}

func (r *gormRepository) FindItemByID(ctx context.Context, id string) (*db.ExpensePriceListItem, error) {
	var row db.ExpensePriceListItem
	err := r.db.WithContext(ctx).First(&row, "id = ? AND tenant_id = ?", strings.TrimSpace(id), defaultTenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) FindActiveItemByKey(ctx context.Context, itemType string, code string) (*db.ExpensePriceListItem, error) {
	var row db.ExpensePriceListItem
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND item_type = ? AND code = ? AND active = ?", defaultTenantID, normalizeItemType(itemType), normalizeCode(code), true).
		Order("created_at DESC").
		First(&row).Error
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

func (r *gormRepository) FindActiveGoldPriceByDate(ctx context.Context, priceDate string) (*db.GoldPrice, error) {
	var row db.GoldPrice
	result := r.db.WithContext(ctx).
		Where("tenant_id = ? AND price_date = ? AND active = ?", defaultTenantID, strings.TrimSpace(priceDate), true).
		Order("created_at DESC").
		Limit(1).
		Find(&row)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &row, nil
}

func (r *gormRepository) ReplaceActiveGoldPrice(ctx context.Context, _ *db.GoldPrice, replacement *db.GoldPrice) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Preserve audit history by retaining the superseded rows, but satisfy the
		// one-active-price-per-tenant/date constraint by deactivating current rows
		// before inserting the replacement active row. Deactivate by tenant/date so
		// old test/dev databases with more than one active row for that date are
		// repaired by the same operation.
		if err := tx.Model(&db.GoldPrice{}).
			Where("tenant_id = ? AND price_date = ? AND active = ?", defaultTenantID, replacement.PriceDate, true).
			Updates(map[string]any{
				"active":     false,
				"updated_at": replacement.UpdatedAt,
			}).Error; err != nil {
			return err
		}

		replacement.Active = true
		return tx.Create(replacement).Error
	})
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
