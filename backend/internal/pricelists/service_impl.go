package pricelists

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) ListItems(ctx context.Context, filter PriceListItemListFilter) ([]PriceListItemDTO, error) {
	if itemType := strings.TrimSpace(filter.ItemType); itemType != "" {
		normalized := normalizeItemType(itemType)
		if normalized != ItemTypeCanteen && normalized != ItemTypeAdministrative {
			return nil, ValidationError{Fields: map[string]string{"itemType": "Item type must be CANTEEN or ADMINISTRATIVE"}}
		}
		filter.ItemType = normalized
	}
	rows, err := s.repo.ListItems(ctx, filter)
	if err != nil {
		return nil, err
	}
	return ToPriceListItemDTOList(rows), nil
}

func (s *service) CreateItem(ctx context.Context, req CreatePriceListItemRequest) (*PriceListItemDTO, error) {
	if err := ValidateCreatePriceListItem(req); err != nil {
		return nil, err
	}
	itemType := normalizeItemType(req.ItemType)
	code := normalizeCode(req.Code)
	if err := s.ensureNoActiveItemCodeConflict(ctx, "code", itemType, code, ""); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	item := &db.ExpensePriceListItem{
		BaseModel:    db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:     defaultTenantID,
		ItemType:     itemType,
		Code:         code,
		Description:  strings.TrimSpace(req.Description),
		UnitPriceBRL: req.UnitPriceBRL,
		Active:       true,
		SortOrder:    req.SortOrder,
	}
	if err := s.repo.CreateItem(ctx, item); err != nil {
		return nil, err
	}
	return ptr(ToPriceListItemDTO(*item)), nil
}

func (s *service) UpdateItem(ctx context.Context, id string, req UpdatePriceListItemRequest) (*PriceListItemDTO, error) {
	if err := ValidateUpdatePriceListItem(req); err != nil {
		return nil, err
	}
	existing, err := s.repo.FindItemByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !existing.Active {
		return nil, ValidationError{Fields: map[string]string{"id": "Inactive price-list items cannot be edited; reactivate the item before editing it"}}
	}

	itemType := normalizeItemType(req.ItemType)
	code := normalizeCode(req.Code)
	if err := s.ensureNoActiveItemCodeConflict(ctx, "code", itemType, code, existing.ID); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	supersededID := existing.ID
	replacement := &db.ExpensePriceListItem{
		BaseModel:                 db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:                  existing.TenantID,
		ItemType:                  itemType,
		Code:                      code,
		Description:               strings.TrimSpace(req.Description),
		UnitPriceBRL:              req.UnitPriceBRL,
		Active:                    true,
		SortOrder:                 req.SortOrder,
		SupersededPriceListItemID: &supersededID,
	}
	existing.UpdatedAt = now
	if err := s.repo.ReplaceItemWithRevision(ctx, existing, replacement); err != nil {
		return nil, err
	}
	dto := ToPriceListItemDTO(*replacement)
	dto.SupersededPriceListItemID = existing.ID
	return &dto, nil
}

func (s *service) DeactivateItem(ctx context.Context, id string) (*PriceListItemDTO, error) {
	return s.setItemActive(ctx, id, false)
}

func (s *service) ReactivateItem(ctx context.Context, id string) (*PriceListItemDTO, error) {
	return s.setItemActive(ctx, id, true)
}

func (s *service) setItemActive(ctx context.Context, id string, active bool) (*PriceListItemDTO, error) {
	item, err := s.repo.FindItemByID(ctx, id)
	if err != nil {
		return nil, err
	}
	item.Active = active
	item.UpdatedAt = time.Now().UTC()
	if err := s.repo.SetItemActive(ctx, item); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindItemByID(ctx, item.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToPriceListItemDTO(*updated)), nil
}

func (s *service) ensureNoActiveItemCodeConflict(ctx context.Context, field string, itemType string, code string, allowedID string) error {
	existing, err := s.repo.FindActiveItemByKey(ctx, itemType, code)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if existing.ID == strings.TrimSpace(allowedID) {
		return nil
	}
	return ValidationError{Fields: map[string]string{field: "An active price-list item already uses this code for this category"}}
}

func (s *service) ListGoldPrices(ctx context.Context, filter GoldPriceListFilter) ([]GoldPriceDTO, error) {
	rows, err := s.repo.ListGoldPrices(ctx, filter)
	if err != nil {
		return nil, err
	}
	return ToGoldPriceDTOList(rows), nil
}

func (s *service) CreateGoldPrice(ctx context.Context, req CreateGoldPriceRequest) (*GoldPriceDTO, error) {
	if err := ValidateCreateGoldPrice(req); err != nil {
		return nil, err
	}
	priceDate, err := parseDate(req.PriceDate)
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"priceDate": "Price date must be YYYY-MM-DD"}}
	}
	storedPriceDate := formatDate(priceDate)
	now := time.Now().UTC()
	price := &db.GoldPrice{
		BaseModel:  db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:   defaultTenantID,
		PriceDate:  storedPriceDate,
		BRLPerGram: req.BRLPerGram,
		RecordedBy: strings.TrimSpace(req.RecordedBy),
		Notes:      strings.TrimSpace(req.Notes),
		Active:     true,
	}

	existing, err := s.repo.FindActiveGoldPriceByDate(ctx, storedPriceDate)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if existing == nil {
		if err := s.repo.CreateGoldPrice(ctx, price); err != nil {
			return nil, err
		}
		return ptr(ToGoldPriceDTO(*price)), nil
	}

	existing.UpdatedAt = now
	if err := s.repo.ReplaceActiveGoldPrice(ctx, existing, price); err != nil {
		return nil, err
	}
	dto := ToGoldPriceDTO(*price)
	dto.SupersededGoldPriceID = existing.ID
	return &dto, nil
}

func (s *service) LatestGoldPrice(ctx context.Context) (*GoldPriceDTO, error) {
	row, err := s.repo.FindLatestActiveGoldPrice(ctx)
	if err != nil {
		return nil, err
	}
	return ptr(ToGoldPriceDTO(*row)), nil
}

func (s *service) DeactivateGoldPrice(ctx context.Context, id string) (*GoldPriceDTO, error) {
	price, err := s.repo.FindGoldPriceByID(ctx, id)
	if err != nil {
		return nil, err
	}
	price.Active = false
	price.UpdatedAt = time.Now().UTC()
	if err := s.repo.UpdateGoldPrice(ctx, price); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindGoldPriceByID(ctx, price.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToGoldPriceDTO(*updated)), nil
}

func ptr[T any](value T) *T { return &value }
