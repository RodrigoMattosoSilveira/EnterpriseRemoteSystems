package workperiods

import (
	"context"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"enterpriseremotesystems/backend/internal/tenants"
)

const defaultTenantID = tenants.DefaultTenantID

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) List(ctx context.Context, filter WorkPeriodListFilter) (*WorkPeriodListResult, error) {
	normalized, err := normalizeListFilter(filter)
	if err != nil {
		return nil, err
	}

	rows, total, err := s.repo.List(ctx, normalized)
	if err != nil {
		return nil, err
	}
	return &WorkPeriodListResult{Items: ToDTOList(rows), Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func (s *service) Create(ctx context.Context, req CreateWorkPeriodRequest, actorUserID string) (*WorkPeriodDTO, error) {
	if err := ValidateCreateWorkPeriod(req); err != nil {
		return nil, err
	}

	workDate, _ := parseDate(req.WorkDate)
	periodCode := strings.ToUpper(strings.TrimSpace(req.PeriodCode))
	startsAt, _ := parseTimestamp(req.StartsAt)
	endsAt, _ := parseTimestamp(req.EndsAt)

	exists, err := s.repo.ExistsByDateAndCode(ctx, workDate, periodCode)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ValidationError{Fields: map[string]string{"workDate": "A Work Period already exists for this date and period"}}
	}

	now := time.Now().UTC()

	workPeriod := &db.WorkPeriod{
		BaseModel:  db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:   tenantctx.TenantID(ctx),
		WorkDate:   workDate,
		PeriodCode: periodCode,
		Name:       strings.TrimSpace(req.Name),
		StartsAt:   startsAt.UTC(),
		EndsAt:     endsAt.UTC(),
		Status:     StatusPlanning,
	}

	if err := s.repo.Create(ctx, workPeriod); err != nil {
		return nil, err
	}

	created, err := s.repo.FindByID(ctx, workPeriod.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*created)), nil
}

func (s *service) GetByID(ctx context.Context, id string) (*WorkPeriodDTO, error) {
	row, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*row)), nil
}

func (s *service) Inform(ctx context.Context, id string, actorUserID string) (*WorkPeriodDTO, error) {
	existing, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if existing.Status == StatusInformed {
		return ptr(ToDTO(*existing)), nil
	}
	if existing.Status != StatusPlanning {
		return nil, ValidationError{Fields: map[string]string{"status": "Only planning work periods can be informed"}}
	}

	now := time.Now().UTC()
	existing.Status = StatusInformed
	existing.InformedAt = &now
	existing.UpdatedAt = now

	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, existing.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func (s *service) PrintRoster(ctx context.Context, id string) (*WorkPlanRosterDTO, error) {
	workPeriod, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	assignments, err := s.repo.ListIncludedAssignmentsForRoster(ctx, workPeriod.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToRosterDTO(*workPeriod, assignments)), nil
}

func normalizeListFilter(filter WorkPeriodListFilter) (normalizedWorkPeriodListFilter, error) {
	if err := ValidateListFilter(filter); err != nil {
		return normalizedWorkPeriodListFilter{}, err
	}

	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	out := normalizedWorkPeriodListFilter{Status: strings.TrimSpace(filter.Status), Page: page, PageSize: pageSize}
	if out.Status != "" {
		out.Status = strings.ToUpper(out.Status)
	}
	if strings.TrimSpace(filter.DateFrom) != "" {
		value, err := parseDate(filter.DateFrom)
		if err != nil {
			return normalizedWorkPeriodListFilter{}, ValidationError{Fields: map[string]string{"dateFrom": "Date from must be YYYY-MM-DD"}}
		}
		out.DateFrom = &value
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		value, err := parseDate(filter.DateTo)
		if err != nil {
			return normalizedWorkPeriodListFilter{}, ValidationError{Fields: map[string]string{"dateTo": "Date to must be YYYY-MM-DD"}}
		}
		out.DateTo = &value
	}
	return out, nil
}

func ptr[T any](value T) *T { return &value }
