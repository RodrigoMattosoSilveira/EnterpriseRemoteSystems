package pricelists

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
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
	now := time.Now().UTC()
	item := &db.ExpensePriceListItem{
		BaseModel:    db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:     defaultTenantID,
		ItemType:     normalizeItemType(req.ItemType),
		Code:         normalizeCode(req.Code),
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
	item, err := s.repo.FindItemByID(ctx, id)
	if err != nil {
		return nil, err
	}
	item.ItemType = normalizeItemType(req.ItemType)
	item.Code = normalizeCode(req.Code)
	item.Description = strings.TrimSpace(req.Description)
	item.UnitPriceBRL = req.UnitPriceBRL
	item.SortOrder = req.SortOrder
	item.UpdatedAt = time.Now().UTC()
	if err := s.repo.UpdateItem(ctx, item); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindItemByID(ctx, item.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToPriceListItemDTO(*updated)), nil
}

func (s *service) DeactivateItem(ctx context.Context, id string) (*PriceListItemDTO, error) {
	item, err := s.repo.FindItemByID(ctx, id)
	if err != nil {
		return nil, err
	}
	item.Active = false
	item.UpdatedAt = time.Now().UTC()
	if err := s.repo.UpdateItem(ctx, item); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindItemByID(ctx, item.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToPriceListItemDTO(*updated)), nil
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
	now := time.Now().UTC()
	price := &db.GoldPrice{
		BaseModel:  db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:   defaultTenantID,
		PriceDate:  priceDate,
		BRLPerGram: req.BRLPerGram,
		RecordedBy: strings.TrimSpace(req.RecordedBy),
		Notes:      strings.TrimSpace(req.Notes),
		Active:     true,
	}
	if err := s.repo.CreateGoldPrice(ctx, price); err != nil {
		return nil, err
	}
	return ptr(ToGoldPriceDTO(*price)), nil
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
