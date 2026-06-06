package accruals

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/tenants"
	"enterpriseremotesystems/backend/internal/workperiodassignments"
	"enterpriseremotesystems/backend/internal/workperiods"
	"gorm.io/gorm"
)

const defaultTenantID = tenants.DefaultTenantID

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) ListRunsByWorkPeriod(ctx context.Context, workPeriodID string, filter AccrualRunListFilter) (*AccrualRunListResult, error) {
	if _, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID)); err != nil {
		return nil, err
	}
	normalized, err := normalizeRunListFilter(filter)
	if err != nil {
		return nil, err
	}
	rows, total, err := s.repo.ListRunsByWorkPeriod(ctx, strings.TrimSpace(workPeriodID), normalized)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	summaries, err := s.repo.SummariesForRuns(ctx, ids)
	if err != nil {
		return nil, err
	}
	return &AccrualRunListResult{Items: ToRunDTOList(rows, summaries), Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func (s *service) CreateRun(ctx context.Context, workPeriodID string, req CreateAccrualRunRequest, actorUserID string) (*AccrualRunDTO, error) {
	if err := ValidateCreateAccrualRun(req); err != nil {
		return nil, err
	}
	workPeriod, err := s.repo.FindWorkPeriodByID(ctx, strings.TrimSpace(workPeriodID))
	if err != nil {
		return nil, err
	}
	if workPeriod.Status == workperiods.StatusClosed {
		return nil, ValidationError{Fields: map[string]string{"workPeriodId": "Closed work periods cannot be accrued"}}
	}
	accrualDate := workPeriod.WorkDate
	if strings.TrimSpace(req.AccrualDate) != "" {
		accrualDate, _ = parseDate(req.AccrualDate)
	}
	now := time.Now().UTC()
	run := &db.AccrualRun{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, WorkPeriodID: workPeriod.ID, Status: RunStatusDraft, AccrualDate: accrualDate, Notes: strings.TrimSpace(req.Notes)}
	if err := s.repo.CreateRun(ctx, run); err != nil {
		return nil, err
	}
	return s.RecalculateRun(ctx, run.ID, actorUserID)
}

func (s *service) GetRunByID(ctx context.Context, id string) (*AccrualRunDTO, error) {
	run, err := s.repo.FindRunByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	summaries, err := s.repo.SummariesForRuns(ctx, []string{run.ID})
	if err != nil {
		return nil, err
	}
	return ptr(ToRunDTO(*run, summaries[run.ID])), nil
}

func (s *service) RecalculateRun(ctx context.Context, id string, actorUserID string) (*AccrualRunDTO, error) {
	run, err := s.repo.FindRunByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if run.Status == RunStatusPosted || run.Status == RunStatusVoided {
		return nil, ValidationError{Fields: map[string]string{"status": "Posted or voided accrual runs cannot be recalculated"}}
	}
	if run.WorkPeriod.Status == workperiods.StatusClosed {
		return nil, ValidationError{Fields: map[string]string{"workPeriodId": "Closed work periods cannot be accrued"}}
	}
	items, err := s.calculateItems(ctx, *run)
	if err != nil {
		return nil, err
	}
	run.Status = statusForItems(items)
	run.UpdatedAt = time.Now().UTC()
	if err := s.repo.ReplaceItemsForRun(ctx, run, items); err != nil {
		return nil, err
	}
	return s.GetRunByID(ctx, run.ID)
}

func (s *service) ListItemsByRun(ctx context.Context, runID string, filter AccrualItemListFilter) (*AccrualItemListResult, error) {
	if _, err := s.repo.FindRunByID(ctx, strings.TrimSpace(runID)); err != nil {
		return nil, err
	}
	normalized, err := normalizeItemListFilter(filter)
	if err != nil {
		return nil, err
	}
	rows, total, err := s.repo.ListItemsByRun(ctx, strings.TrimSpace(runID), normalized)
	if err != nil {
		return nil, err
	}
	return &AccrualItemListResult{Items: ToItemDTOList(rows), Total: total, Page: normalized.Page, PageSize: normalized.PageSize}, nil
}

func (s *service) calculateItems(ctx context.Context, run db.AccrualRun) ([]db.AccrualItem, error) {
	assignments, err := s.repo.ListAssignmentsForCalculation(ctx, run.WorkPeriodID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	items := make([]db.AccrualItem, 0, len(assignments))
	for _, assignment := range assignments {
		assignmentID := assignment.ID
		item := db.AccrualItem{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: defaultTenantID, AccrualRunID: run.ID, WorkPeriodID: run.WorkPeriodID, WorkPeriodAssignmentID: &assignmentID, CollaboratorID: assignment.CollaboratorID, Direction: DirectionCredit}
		status := strings.TrimSpace(stringValue(assignment.ActualStatus))
		if status == "" {
			item.CalculationType = "ACTUAL_OUTCOME"
			item.Status = ItemStatusPending
			item.PendingReason = PendingReasonActualOutcomeMissing
			item.Description = "Actual outcome has not been marked"
			items = append(items, item)
			continue
		}
		switch status {
		case workperiodassignments.ActualStatusAbsent, workperiodassignments.ActualStatusCancelled, workperiodassignments.ActualStatusReplaced:
			item.CalculationType = status
			item.Status = ItemStatusSkipped
			item.Description = "No earning is calculated for actual status " + status
			items = append(items, item)
			continue
		case workperiodassignments.ActualStatusTimeOff:
			item.CalculationType = "TIME_OFF_REPLACEMENT"
			item.Status = ItemStatusPending
			item.PendingReason = PendingReasonReplacementRuleDeferred
			item.Description = "TIME_OFF replacement split calculation is deferred to the replacement-rules slice"
			items = append(items, item)
			continue
		}
		calculated, err := s.calculatePaymentItem(ctx, run, assignment, status, item)
		if err != nil {
			return nil, err
		}
		items = append(items, calculated)
	}
	return items, nil
}

func (s *service) calculatePaymentItem(ctx context.Context, run db.AccrualRun, assignment db.WorkPeriodAssignment, actualStatus string, item db.AccrualItem) (db.AccrualItem, error) {
	methodCode := strings.ToUpper(strings.TrimSpace(assignment.Collaborator.PaymentMethod.Code))
	switch methodCode {
	case "DAILY", "DAILY_WAGES", "DAILY_BRL":
		amount := valueOrFallback(assignment.Collaborator.DailyBRLAmount, assignment.Collaborator.PaymentValue)
		if amount <= 0 {
			return pendingPaymentConfig(item, "DAILY_BRL", "Daily BRL amount is missing"), nil
		}
		item.CalculationType = "DAILY_BRL"
		item.BRLAmount = &amount
		item.Status = ItemStatusReady
		item.Description = "Daily BRL earning for work period"
		return item, nil
	case "SALARY", "FIXED_BRL":
		monthly := valueOrFallback(assignment.Collaborator.FixedMonthlyBRLAmount, assignment.Collaborator.PaymentValue)
		if monthly <= 0 {
			return pendingPaymentConfig(item, "FIXED_BRL_DAILY", "Fixed monthly BRL amount is missing"), nil
		}
		amount := monthly / 30.0
		item.CalculationType = "FIXED_BRL_DAILY"
		item.BRLAmount = &amount
		item.Status = ItemStatusReady
		item.Description = "Fixed BRL earning prorated at 1/30 per work period"
		return item, nil
	case "COMMISSION", "GOLD_COMMISSION":
		percent := valueOrFallback(assignment.Collaborator.GoldCommissionPercent, assignment.Collaborator.PaymentValue)
		if percent <= 0 {
			return pendingPaymentConfig(item, "GOLD_COMMISSION", "Gold commission percent is missing"), nil
		}
		production, err := s.repo.FindGoldProduction(ctx, run.WorkPeriodID, assignment.LocationID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				item.CalculationType = "GOLD_COMMISSION"
				item.Status = ItemStatusPending
				item.PendingReason = PendingReasonGoldProductionMissing
				item.Description = "Gold production is missing for this work period and location"
				return item, nil
			}
			return item, err
		}
		amount := production.GoldGramsProduced * percent / 100.0
		if actualStatus == workperiodassignments.ActualStatusSickDayOff {
			item.Description = "Full gold commission for sick day off"
		} else {
			item.Description = "Gold commission earning for work period"
		}
		item.CalculationType = "GOLD_COMMISSION"
		item.GoldGramAmount = &amount
		item.Status = ItemStatusReady
		return item, nil
	default:
		return pendingPaymentConfig(item, "UNKNOWN_PAYMENT_METHOD", "Unknown payment method"), nil
	}
}

func pendingPaymentConfig(item db.AccrualItem, calculationType string, description string) db.AccrualItem {
	item.CalculationType = calculationType
	item.Status = ItemStatusPending
	item.PendingReason = PendingReasonPaymentConfigurationMissing
	item.Description = description
	return item
}
func valueOrFallback(value *float64, fallback float64) float64 {
	if value != nil {
		return *value
	}
	return fallback
}
func statusForItems(items []db.AccrualItem) string {
	if len(items) == 0 {
		return RunStatusDraft
	}
	pending := false
	ready := false
	for _, item := range items {
		if item.Status == ItemStatusPending {
			pending = true
		}
		if item.Status == ItemStatusReady {
			ready = true
		}
	}
	if pending {
		return RunStatusPendingInput
	}
	if ready {
		return RunStatusReadyToPost
	}
	return RunStatusDraft
}

func normalizeRunListFilter(filter AccrualRunListFilter) (normalizedAccrualRunListFilter, error) {
	if err := ValidateRunListFilter(filter); err != nil {
		return normalizedAccrualRunListFilter{}, err
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
	return normalizedAccrualRunListFilter{Status: strings.ToUpper(strings.TrimSpace(filter.Status)), Page: page, PageSize: pageSize}, nil
}
func normalizeItemListFilter(filter AccrualItemListFilter) (normalizedAccrualItemListFilter, error) {
	if err := ValidateItemListFilter(filter); err != nil {
		return normalizedAccrualItemListFilter{}, err
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
	return normalizedAccrualItemListFilter{Status: strings.ToUpper(strings.TrimSpace(filter.Status)), PendingReason: strings.ToUpper(strings.TrimSpace(filter.PendingReason)), CollaboratorID: strings.TrimSpace(filter.CollaboratorID), Page: page, PageSize: pageSize}, nil
}
func parseDate(value string) (time.Time, error) {
	return time.Parse(dateLayout, strings.TrimSpace(value))
}
func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func ptr[T any](value T) *T { return &value }
