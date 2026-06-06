package goldproduction

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/tenants"
)

const defaultTenantID = tenants.DefaultTenantID

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) ListByWorkPeriod(ctx context.Context, workPeriodID string, filter GoldProductionEntryListFilter) (*GoldProductionEntryListResult, error) {
	if _, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID)); err != nil {
		return nil, err
	}

	normalized, err := normalizeListFilter(filter)
	if err != nil {
		return nil, err
	}

	rows, total, err := s.repo.ListByWorkPeriod(ctx, strings.TrimSpace(workPeriodID), normalized)
	if err != nil {
		return nil, err
	}
	return &GoldProductionEntryListResult{Items: ToDTOList(rows), Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func (s *service) Create(ctx context.Context, workPeriodID string, req CreateGoldProductionEntryRequest, actorUserID string) (*GoldProductionEntryDTO, error) {
	if err := ValidateCreateGoldProductionEntry(req); err != nil {
		return nil, err
	}

	workPeriod, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID))
	if err != nil {
		return nil, err
	}
	if err := ensureEditableWorkPeriod(*workPeriod); err != nil {
		return nil, err
	}

	productionDate, err := parseDate(req.ProductionDate)
	if err != nil {
		return nil, err
	}
	if err := ensureProductionDateMatchesWorkPeriod(productionDate, workPeriod.WorkDate); err != nil {
		return nil, err
	}

	locationID := strings.TrimSpace(req.LocationID)
	if err := s.validateLocation(ctx, locationID); err != nil {
		return nil, err
	}
	if err := s.validateNoDuplicate(ctx, workPeriod.ID, locationID, productionDate, ""); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	entry := &db.GoldProductionEntry{
		BaseModel:         db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:          defaultTenantID,
		WorkPeriodID:      workPeriod.ID,
		LocationID:        locationID,
		ProductionDate:    productionDate,
		GoldGramsProduced: req.GoldGramsProduced,
		Notes:             strings.TrimSpace(req.Notes),
		Active:            true,
	}

	if err := s.repo.Create(ctx, entry); err != nil {
		return nil, err
	}

	created, err := s.repo.FindByID(ctx, entry.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*created)), nil
}

func (s *service) GetByID(ctx context.Context, id string) (*GoldProductionEntryDTO, error) {
	row, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*row)), nil
}

func (s *service) Update(ctx context.Context, id string, req UpdateGoldProductionEntryRequest, actorUserID string) (*GoldProductionEntryDTO, error) {
	if err := ValidateUpdateGoldProductionEntry(req); err != nil {
		return nil, err
	}

	existing, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if !existing.Active {
		return nil, ValidationError{Fields: map[string]string{"id": "Inactive gold production entries cannot be updated"}}
	}
	if err := ensureEditableWorkPeriod(existing.WorkPeriod); err != nil {
		return nil, err
	}

	productionDate, err := parseDate(req.ProductionDate)
	if err != nil {
		return nil, err
	}
	if err := ensureProductionDateMatchesWorkPeriod(productionDate, existing.WorkPeriod.WorkDate); err != nil {
		return nil, err
	}

	locationID := strings.TrimSpace(req.LocationID)
	if err := s.validateLocation(ctx, locationID); err != nil {
		return nil, err
	}
	if err := s.validateNoDuplicate(ctx, existing.WorkPeriodID, locationID, productionDate, existing.ID); err != nil {
		return nil, err
	}

	existing.LocationID = locationID
	existing.ProductionDate = productionDate
	existing.GoldGramsProduced = req.GoldGramsProduced
	existing.Notes = strings.TrimSpace(req.Notes)
	existing.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func (s *service) Deactivate(ctx context.Context, id string, actorUserID string) (*GoldProductionEntryDTO, error) {
	existing, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if err := ensureEditableWorkPeriod(existing.WorkPeriod); err != nil {
		return nil, err
	}
	if !existing.Active {
		return ptr(ToDTO(*existing)), nil
	}
	existing.Active = false
	existing.UpdatedAt = time.Now().UTC()
	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func (s *service) Delete(ctx context.Context, id string, actorUserID string) error {
	_, err := s.Deactivate(ctx, id, actorUserID)
	return err
}

func (s *service) validateLocation(ctx context.Context, locationID string) error {
	exists, err := s.repo.ExistsActiveLocation(ctx, strings.TrimSpace(locationID))
	if err != nil {
		return err
	}
	if !exists {
		return ValidationError{Fields: map[string]string{"locationId": "Location must be active reference data of type location"}}
	}
	return nil
}

func (s *service) validateNoDuplicate(ctx context.Context, workPeriodID string, locationID string, productionDate time.Time, excludeID string) error {
	exists, err := s.repo.ExistsActiveEntryForPeriodLocationDate(ctx, workPeriodID, locationID, productionDate, excludeID)
	if err != nil {
		return err
	}
	if exists {
		return ValidationError{Fields: map[string]string{"locationId": "An active gold production entry already exists for this work period, location, and production date"}}
	}
	return nil
}

func normalizeListFilter(filter GoldProductionEntryListFilter) (normalizedGoldProductionEntryListFilter, error) {
	if err := ValidateListFilter(filter); err != nil {
		return normalizedGoldProductionEntryListFilter{}, err
	}
	page := filter.Page
	if page == 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize == 0 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	var dateFrom *time.Time
	if strings.TrimSpace(filter.DateFrom) != "" {
		parsed, err := parseDate(filter.DateFrom)
		if err != nil {
			return normalizedGoldProductionEntryListFilter{}, err
		}
		dateFrom = &parsed
	}
	var dateTo *time.Time
	if strings.TrimSpace(filter.DateTo) != "" {
		parsed, err := parseDate(filter.DateTo)
		if err != nil {
			return normalizedGoldProductionEntryListFilter{}, err
		}
		dateTo = &parsed
	}

	return normalizedGoldProductionEntryListFilter{
		LocationID:      strings.TrimSpace(filter.LocationID),
		DateFrom:        dateFrom,
		DateTo:          dateTo,
		IncludeInactive: filter.IncludeInactive,
		Page:            page,
		PageSize:        pageSize,
	}, nil
}

func ensureEditableWorkPeriod(workPeriod db.WorkPeriod) error {
	if workPeriod.Status == "CLOSED" {
		return ValidationError{Fields: map[string]string{"workPeriodId": "Closed work periods cannot be changed"}}
	}
	return nil
}

func ensureProductionDateMatchesWorkPeriod(productionDate time.Time, workDate time.Time) error {
	if !sameDate(productionDate, workDate) {
		return ValidationError{Fields: map[string]string{"productionDate": "Production date must match the Work Period work date"}}
	}
	return nil
}

func sameDate(a time.Time, b time.Time) bool {
	aa := a.UTC()
	bb := b.UTC()
	return aa.Year() == bb.Year() && aa.Month() == bb.Month() && aa.Day() == bb.Day()
}

func parseDate(value string) (time.Time, error) {
	parsed, err := time.Parse(dateLayout, strings.TrimSpace(value))
	if err != nil {
		return time.Time{}, ValidationError{Fields: map[string]string{"productionDate": "Must be a valid date in YYYY-MM-DD format"}}
	}
	return parsed, nil
}

func ptr[T any](value T) *T { return &value }
