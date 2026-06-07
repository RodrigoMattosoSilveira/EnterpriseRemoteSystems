package currentaccounts

import (
	"context"
	"strings"
)

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) GetDetail(ctx context.Context, collaboratorID string, filter LedgerEntryListFilter) (*CurrentAccountDetailDTO, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	collaborator, err := s.repo.FindCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}

	normalized, err := normalizeListFilter(filter)
	if err != nil {
		return nil, err
	}
	entries, total, err := s.repo.ListEntries(ctx, collaboratorID, normalized)
	if err != nil {
		return nil, err
	}
	balances, err := s.repo.ListBalances(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}

	return &CurrentAccountDetailDTO{
		CollaboratorID:    collaborator.ID,
		CollaboratorLabel: collaboratorLabel(collaborator.Person),
		Balances:          ToBalanceDTOList(balances),
		LedgerEntries: LedgerEntryListResult{
			Items:    ToLedgerEntryDTOList(entries),
			Total:    total,
			Page:     normalized.Page,
			PageSize: normalized.PageSize,
		},
	}, nil
}

func (s *service) ListEntries(ctx context.Context, collaboratorID string, filter LedgerEntryListFilter) (*LedgerEntryListResult, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	if _, err := s.repo.FindCollaboratorByID(ctx, collaboratorID); err != nil {
		return nil, err
	}

	normalized, err := normalizeListFilter(filter)
	if err != nil {
		return nil, err
	}
	rows, total, err := s.repo.ListEntries(ctx, collaboratorID, normalized)
	if err != nil {
		return nil, err
	}
	return &LedgerEntryListResult{Items: ToLedgerEntryDTOList(rows), Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func (s *service) ListBalances(ctx context.Context, collaboratorID string) ([]CurrentAccountBalanceDTO, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	if _, err := s.repo.FindCollaboratorByID(ctx, collaboratorID); err != nil {
		return nil, err
	}
	rows, err := s.repo.ListBalances(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	return ToBalanceDTOList(rows), nil
}

func normalizeListFilter(filter LedgerEntryListFilter) (normalizedLedgerEntryListFilter, error) {
	if err := ValidateLedgerEntryListFilter(filter); err != nil {
		return normalizedLedgerEntryListFilter{}, err
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
	out := normalizedLedgerEntryListFilter{
		ValueUnitID:     strings.TrimSpace(filter.ValueUnitID),
		EntryType:       strings.TrimSpace(filter.EntryType),
		SourceType:      strings.TrimSpace(filter.SourceType),
		IncludeInactive: filter.IncludeInactive,
		Page:            page,
		PageSize:        pageSize,
	}
	if strings.TrimSpace(filter.DateFrom) != "" {
		value, err := parseDate(filter.DateFrom)
		if err != nil {
			return normalizedLedgerEntryListFilter{}, ValidationError{Fields: map[string]string{"dateFrom": "Date from must be YYYY-MM-DD"}}
		}
		out.DateFrom = &value
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		value, err := parseDate(filter.DateTo)
		if err != nil {
			return normalizedLedgerEntryListFilter{}, ValidationError{Fields: map[string]string{"dateTo": "Date to must be YYYY-MM-DD"}}
		}
		out.DateTo = &value
	}
	return out, nil
}
