package currentaccounts

import (
	"context"
	"math"
	"strings"

	"enterpriseremotesystems/backend/internal/db"
)

const (
	defaultPageSize                      = 50
	maxPageSize                          = 200
	ledgerSourceTypeWorkPeriodAssignment = "WORK_PERIOD_ASSIGNMENT"
)

type service struct {
	repo                Repository
	ledgerCorrectionKey string
	ledgerSettlementKey string
}

func NewService(repo Repository, ledgerCorrectionKey, ledgerSettlementKey string) Service {
	return &service{
		repo:                repo,
		ledgerCorrectionKey: strings.TrimSpace(ledgerCorrectionKey),
		ledgerSettlementKey: strings.TrimSpace(ledgerSettlementKey),
	}
}

func (s *service) SettlementPreview(ctx context.Context, collaboratorID string) (*SettlementPreviewDTO, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	collaborator, err := s.repo.FindCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}

	balances, err := s.repo.ListBalances(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	pendingAccrualItems, err := s.repo.CountPendingAccrualItems(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	outstandingReceipts, err := s.repo.CountOutstandingReceiptsForCollaborator(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}

	preview := &SettlementPreviewDTO{
		CollaboratorID:      collaborator.ID,
		CollaboratorLabel:   collaboratorLabel(collaborator.Person),
		JourneyStatusCode:   collaborator.Status.Code,
		PendingAccrualItems: pendingAccrualItems,
		OutstandingReceipts: outstandingReceipts,
		BlockingReasons:     []string{},
	}
	for _, balance := range balances {
		switch balance.ValueUnitCode {
		case "BRL":
			preview.BRLBalance = balance.Balance
		case "GOLD_GRAM":
			preview.GoldGramBalance = balance.Balance
		}
	}

	if strings.EqualFold(collaborator.Status.Code, "FINISHED") || collaborator.ClosedAt != nil {
		preview.BlockingReasons = append(preview.BlockingReasons, SettlementBlockerJourneyAlreadyClosed)
	}
	if preview.BRLBalance < -0.00000001 || preview.GoldGramBalance < -0.00000001 {
		preview.BlockingReasons = append(preview.BlockingReasons, SettlementBlockerNegativeBalance)
	}
	if pendingAccrualItems > 0 {
		preview.BlockingReasons = append(preview.BlockingReasons, SettlementBlockerPendingAccruals)
	}
	if outstandingReceipts > 0 {
		preview.BlockingReasons = append(preview.BlockingReasons, SettlementBlockerOutstandingReceipts)
	}

	preview.BRLBalance = normalizedZero(preview.BRLBalance)
	preview.GoldGramBalance = normalizedZero(preview.GoldGramBalance)
	preview.CanClose = len(preview.BlockingReasons) == 0
	return preview, nil
}

func normalizedZero(value float64) float64 {
	if math.Abs(value) <= 0.00000001 {
		return 0
	}
	return value
}

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

	dtos, err := s.ledgerEntryDTOsWithSourceDetails(ctx, entries)
	if err != nil {
		return nil, err
	}

	return &CurrentAccountDetailDTO{
		CollaboratorID:    collaborator.ID,
		CollaboratorLabel: collaboratorLabel(collaborator.Person),
		Balances:          ToBalanceDTOList(balances),
		LedgerEntries: LedgerEntryListResult{
			Items:    dtos,
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
	dtos, err := s.ledgerEntryDTOsWithSourceDetails(ctx, rows)
	if err != nil {
		return nil, err
	}
	return &LedgerEntryListResult{Items: dtos, Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func (s *service) ledgerEntryDTOsWithSourceDetails(ctx context.Context, rows []db.LedgerEntry) ([]LedgerEntryDTO, error) {
	dtos := ToLedgerEntryDTOList(rows)
	assignmentIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		if strings.EqualFold(strings.TrimSpace(row.SourceType), ledgerSourceTypeWorkPeriodAssignment) && strings.TrimSpace(row.SourceID) != "" {
			assignmentIDs = append(assignmentIDs, row.SourceID)
		}
	}
	if len(assignmentIDs) == 0 {
		return dtos, nil
	}
	details, err := s.repo.FindWorkPeriodAssignmentSourceDetails(ctx, assignmentIDs)
	if err != nil {
		return nil, err
	}
	for i := range dtos {
		if !strings.EqualFold(strings.TrimSpace(dtos[i].SourceType), ledgerSourceTypeWorkPeriodAssignment) {
			continue
		}
		detail, ok := details[dtos[i].SourceID]
		if !ok {
			continue
		}
		dtos[i].SourceWorkPeriodID = detail.WorkPeriodID
		dtos[i].SourceWorkDate = formatDate(detail.WorkDate)
		dtos[i].SourceWorkPeriodName = strings.TrimSpace(detail.WorkPeriodName)
		dtos[i].SourceLabel = workPeriodAssignmentSourceLabel(detail)
	}
	return dtos, nil
}

func workPeriodAssignmentSourceLabel(detail WorkPeriodAssignmentSourceDetail) string {
	date := formatDate(detail.WorkDate)
	name := strings.TrimSpace(detail.WorkPeriodName)
	periodCode := strings.TrimSpace(detail.PeriodCode)
	if name != "" {
		return strings.TrimSpace("Work Period " + date + " · " + name)
	}
	if periodCode != "" {
		return strings.TrimSpace("Work Period " + date + " · " + periodCode)
	}
	return strings.TrimSpace("Work Period " + date)
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
		ValueUnitID:         strings.TrimSpace(filter.ValueUnitID),
		EntryType:           strings.TrimSpace(filter.EntryType),
		Direction:           strings.ToUpper(strings.TrimSpace(filter.Direction)),
		SourceType:          strings.TrimSpace(filter.SourceType),
		OutstandingReceipts: filter.OutstandingReceipts,
		IncludeInactive:     filter.IncludeInactive,
		Page:                page,
		PageSize:            pageSize,
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

func (s *service) CollaboratorTenantID(ctx context.Context, collaboratorID string) (string, error) {
	return s.repo.FindCollaboratorTenantID(ctx, strings.TrimSpace(collaboratorID))
}

func (s *service) LedgerEntryTenantID(ctx context.Context, entryID string) (string, error) {
	return s.repo.FindLedgerEntryTenantID(ctx, strings.TrimSpace(entryID))
}
