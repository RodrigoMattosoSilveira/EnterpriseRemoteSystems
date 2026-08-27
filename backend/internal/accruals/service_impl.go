package accruals

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/workperiodassignments"
	"enterpriseremotesystems/backend/internal/workperiods"
	"gorm.io/gorm"
)

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
	run := &db.AccrualRun{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: workPeriod.TenantID, WorkPeriodID: workPeriod.ID, Status: RunStatusDraft, AccrualDate: accrualDate, Notes: strings.TrimSpace(req.Notes)}
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

func (s *service) PostRun(ctx context.Context, id string, actorUserID string) (*AccrualRunDTO, error) {
	run, err := s.repo.FindRunByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if run.Status == RunStatusPosted {
		return s.GetRunByID(ctx, run.ID)
	}
	if run.Status == RunStatusVoided {
		return nil, ValidationError{Fields: map[string]string{"status": "Voided accrual runs cannot be posted"}}
	}
	if run.WorkPeriod.Status == workperiods.StatusClosed {
		return nil, ValidationError{Fields: map[string]string{"workPeriodId": "Closed work periods cannot be posted"}}
	}
	readyItems, err := s.repo.ListReadyItemsByRun(ctx, run.ID)
	if err != nil {
		return nil, err
	}
	if len(readyItems) == 0 {
		return nil, ValidationError{Fields: map[string]string{"status": "No READY accrual items are available to post"}}
	}
	entries, err := s.ledgerEntriesForReadyItems(ctx, *run, readyItems)
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return nil, ValidationError{Fields: map[string]string{"items": "READY accrual items do not contain positive BRL or gold amounts"}}
	}
	pendingCount, err := s.repo.PendingItemCountByRun(ctx, run.ID)
	if err != nil {
		return nil, err
	}
	workPeriodStatus := workperiods.StatusFullyPosted
	if pendingCount > 0 {
		workPeriodStatus = workperiods.StatusPartiallyPosted
	}
	run.Status = RunStatusPosted
	run.UpdatedAt = time.Now().UTC()
	if err := s.repo.PostReadyItems(ctx, run, readyItems, entries, workPeriodStatus); err != nil {
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
	postedItemKeys, err := s.repo.PostedItemKeysForWorkPeriod(ctx, run.WorkPeriodID)
	if err != nil {
		return nil, err
	}
	replacementsByOriginalID := replacementsByOriginal(assignments)
	originalByReplacementID := originalByReplacement(assignments)
	now := time.Now().UTC()
	items := make([]db.AccrualItem, 0, len(assignments)*2)
	for _, assignment := range assignments {
		assignmentID := assignment.ID
		personID := strings.TrimSpace(assignment.Collaborator.Membership.PersonID)
		if personID == "" {
			return nil, errors.New("work period assignment collaborator must resolve to a Person–Tenant Membership")
		}
		base := db.AccrualItem{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: run.TenantID, PersonID: personID, AccrualRunID: run.ID, WorkPeriodID: run.WorkPeriodID, WorkPeriodAssignmentID: &assignmentID, CollaboratorID: assignment.CollaboratorID, Direction: DirectionCredit}
		status := strings.TrimSpace(stringValue(assignment.ActualStatus))
		if status == "" {
			item := base
			item.CalculationType = "ACTUAL_OUTCOME"
			item.Status = ItemStatusPending
			item.PendingReason = PendingReasonActualOutcomeMissing
			item.Description = "Actual outcome has not been marked"
			items = appendIfNotPosted(items, item, postedItemKeys)
			continue
		}
		switch status {
		case workperiodassignments.ActualStatusAbsent, workperiodassignments.ActualStatusCancelled, workperiodassignments.ActualStatusReplaced:
			item := base
			item.CalculationType = status
			item.Status = ItemStatusSkipped
			item.Description = "No earning is calculated for actual status " + status
			items = appendIfNotPosted(items, item, postedItemKeys)
			continue
		}
		if original, ok := originalByReplacementID[assignment.ID]; ok && strings.TrimSpace(stringValue(original.ActualStatus)) == workperiodassignments.ActualStatusTimeOff {
			continue
		}
		switch status {
		case workperiodassignments.ActualStatusTimeOff:
			calculated, err := s.calculateTimeOffItems(ctx, run, assignment, replacementsByOriginalID[assignment.ID], base, now)
			if err != nil {
				return nil, err
			}
			items = appendAllIfNotPosted(items, calculated, postedItemKeys)
			continue
		}
		calculated, err := s.calculatePaymentItem(ctx, run, assignment, status, base)
		if err != nil {
			return nil, err
		}
		items = appendIfNotPosted(items, calculated, postedItemKeys)
		if status == workperiodassignments.ActualStatusSickDayOff && isGoldCommissionAssignment(assignment) {
			replacementItems, err := s.calculateSickDayOffReplacementItems(ctx, run, assignment, replacementsByOriginalID[assignment.ID], now)
			if err != nil {
				return nil, err
			}
			items = appendAllIfNotPosted(items, replacementItems, postedItemKeys)
		}
	}
	return items, nil
}

func (s *service) calculateSickDayOffReplacementItems(ctx context.Context, run db.AccrualRun, original db.WorkPeriodAssignment, replacements []db.WorkPeriodAssignment, now time.Time) ([]db.AccrualItem, error) {
	if len(replacements) == 0 {
		return []db.AccrualItem{pendingReplacementAssignment(original, run, "SICK_DAY_OFF_REPLACEMENT", "Sick day off replacement assignment is missing", now)}, nil
	}
	if _, err := s.goldCommissionAmount(ctx, run, original); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return []db.AccrualItem{
				pendingGoldProductionForReplacement(original, run, "SICK_DAY_OFF_REPLACEMENT_GOLD_DEBIT", "Gold production is required before sick day off replacement gold can be debited", now),
				pendingGoldProductionForReplacement(replacements[0], run, "SICK_DAY_OFF_REPLACEMENT_GOLD_CREDIT", "Gold production is required before sick day off replacement gold can be credited", now),
			}, nil
		}
		return nil, err
	}
	amount := valueOrDefault(original.Collaborator.SickDayOffReplacementGoldGrams, 1.0)
	return []db.AccrualItem{
		replacementGoldItem(original, run, "SICK_DAY_OFF_REPLACEMENT_GOLD_DEBIT", DirectionDebit, amount, "Sick day off replacement gold paid to substitute", now),
		replacementGoldItem(replacements[0], run, "SICK_DAY_OFF_REPLACEMENT_GOLD_CREDIT", DirectionCredit, amount, "Sick day off replacement gold received from replaced collaborator", now),
	}, nil
}

func (s *service) calculateTimeOffItems(ctx context.Context, run db.AccrualRun, original db.WorkPeriodAssignment, replacements []db.WorkPeriodAssignment, base db.AccrualItem, now time.Time) ([]db.AccrualItem, error) {
	if !isGoldCommissionAssignment(original) {
		base.CalculationType = workperiodassignments.ActualStatusTimeOff
		base.Status = ItemStatusSkipped
		base.Description = "No earning is calculated for TIME_OFF with this payment method"
		return []db.AccrualItem{base}, nil
	}
	if len(replacements) == 0 {
		return []db.AccrualItem{pendingReplacementAssignment(original, run, "TIME_OFF_REPLACEMENT", "Time off replacement assignment is missing", now)}, nil
	}
	total, err := s.goldCommissionAmount(ctx, run, original)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return []db.AccrualItem{
				pendingGoldProductionForReplacement(original, run, "TIME_OFF_GOLD_COMMISSION_RETAINED", "Gold production is missing for this work period and location", now),
				pendingGoldProductionForReplacement(replacements[0], run, "TIME_OFF_REPLACEMENT_GOLD_CREDIT", "Gold production is missing for this work period and location", now),
			}, nil
		}
		return nil, err
	}
	replacementPercent := valueOrDefault(original.Collaborator.TimeOffGoldSplitPercent, 50.0)
	originalPercent := 100.0 - replacementPercent
	originalAmount := total * originalPercent / 100.0
	replacementAmount := total * replacementPercent / 100.0
	return []db.AccrualItem{
		replacementGoldItem(original, run, "TIME_OFF_GOLD_COMMISSION_RETAINED", DirectionCredit, originalAmount, "Time off retained gold commission", now),
		replacementGoldItem(replacements[0], run, "TIME_OFF_REPLACEMENT_GOLD_CREDIT", DirectionCredit, replacementAmount, "Time off replacement gold split", now),
	}, nil
}

func (s *service) goldCommissionAmount(ctx context.Context, run db.AccrualRun, assignment db.WorkPeriodAssignment) (float64, error) {
	percent := valueOrFallback(assignment.Collaborator.GoldCommissionPercent, assignment.Collaborator.PaymentValue)
	if percent <= 0 {
		return 0, nil
	}
	production, err := s.repo.FindGoldProduction(ctx, run.WorkPeriodID, assignment.LocationID)
	if err != nil {
		return 0, err
	}
	return production.GoldGramsProduced * percent / 100.0, nil
}

func replacementsByOriginal(assignments []db.WorkPeriodAssignment) map[string][]db.WorkPeriodAssignment {
	out := map[string][]db.WorkPeriodAssignment{}
	for _, assignment := range assignments {
		if assignment.ReplacementForAssignmentID == nil || strings.TrimSpace(*assignment.ReplacementForAssignmentID) == "" {
			continue
		}
		originalID := strings.TrimSpace(*assignment.ReplacementForAssignmentID)
		out[originalID] = append(out[originalID], assignment)
	}
	return out
}

func originalByReplacement(assignments []db.WorkPeriodAssignment) map[string]db.WorkPeriodAssignment {
	byID := map[string]db.WorkPeriodAssignment{}
	for _, assignment := range assignments {
		byID[assignment.ID] = assignment
	}

	out := map[string]db.WorkPeriodAssignment{}
	for _, assignment := range assignments {
		if assignment.ReplacementForAssignmentID == nil || strings.TrimSpace(*assignment.ReplacementForAssignmentID) == "" {
			continue
		}
		original, ok := byID[strings.TrimSpace(*assignment.ReplacementForAssignmentID)]
		if !ok {
			continue
		}
		out[assignment.ID] = original
	}
	return out
}

func appendAllIfNotPosted(items []db.AccrualItem, additions []db.AccrualItem, posted map[string]bool) []db.AccrualItem {
	for _, item := range additions {
		items = appendIfNotPosted(items, item, posted)
	}
	return items
}

func appendIfNotPosted(items []db.AccrualItem, item db.AccrualItem, posted map[string]bool) []db.AccrualItem {
	if item.WorkPeriodAssignmentID != nil && posted[itemKey(*item.WorkPeriodAssignmentID, item.CalculationType, item.Direction)] {
		return items
	}
	return append(items, item)
}

func itemKey(assignmentID string, calculationType string, direction string) string {
	return strings.TrimSpace(assignmentID) + "|" + strings.ToUpper(strings.TrimSpace(calculationType)) + "|" + strings.ToUpper(strings.TrimSpace(direction))
}

func isGoldCommissionAssignment(assignment db.WorkPeriodAssignment) bool {
	methodCode := strings.ToUpper(strings.TrimSpace(assignment.Collaborator.PaymentMethod.Code))
	return methodCode == "COMMISSION" || methodCode == "GOLD_COMMISSION"
}

func pendingReplacementAssignment(assignment db.WorkPeriodAssignment, run db.AccrualRun, calculationType string, description string, now time.Time) db.AccrualItem {
	assignmentID := assignment.ID
	return db.AccrualItem{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: run.TenantID, PersonID: assignment.Collaborator.Membership.PersonID, AccrualRunID: run.ID, WorkPeriodID: run.WorkPeriodID, WorkPeriodAssignmentID: &assignmentID, CollaboratorID: assignment.CollaboratorID, CalculationType: calculationType, Direction: DirectionCredit, Status: ItemStatusPending, PendingReason: PendingReasonReplacementAssignmentMissing, Description: description}
}

func pendingGoldProductionForReplacement(assignment db.WorkPeriodAssignment, run db.AccrualRun, calculationType string, description string, now time.Time) db.AccrualItem {
	assignmentID := assignment.ID
	return db.AccrualItem{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: run.TenantID, PersonID: assignment.Collaborator.Membership.PersonID, AccrualRunID: run.ID, WorkPeriodID: run.WorkPeriodID, WorkPeriodAssignmentID: &assignmentID, CollaboratorID: assignment.CollaboratorID, CalculationType: calculationType, Direction: DirectionCredit, Status: ItemStatusPending, PendingReason: PendingReasonGoldProductionMissing, Description: description}
}

func replacementGoldItem(assignment db.WorkPeriodAssignment, run db.AccrualRun, calculationType string, direction string, amount float64, description string, now time.Time) db.AccrualItem {
	assignmentID := assignment.ID
	return db.AccrualItem{BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: run.TenantID, PersonID: assignment.Collaborator.Membership.PersonID, AccrualRunID: run.ID, WorkPeriodID: run.WorkPeriodID, WorkPeriodAssignmentID: &assignmentID, CollaboratorID: assignment.CollaboratorID, CalculationType: calculationType, Direction: direction, GoldGramAmount: &amount, Status: ItemStatusReady, Description: description}
}

func valueOrDefault(value *float64, fallback float64) float64 {
	if value != nil {
		return *value
	}
	return fallback
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

func (s *service) ledgerEntriesForReadyItems(ctx context.Context, run db.AccrualRun, items []db.AccrualItem) ([]db.LedgerEntry, error) {
	brlUnit, err := s.repo.FindValueUnitByCode(ctx, ValueUnitCodeBRL)
	if err != nil {
		return nil, err
	}
	goldUnit, err := s.repo.FindValueUnitByCode(ctx, ValueUnitCodeGoldGram)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	entries := make([]db.LedgerEntry, 0, len(items)*2)
	for _, item := range items {
		direction := strings.TrimSpace(item.Direction)
		if direction == "" {
			direction = DirectionCredit
		}
		if item.BRLAmount != nil && *item.BRLAmount > 0 {
			entries = append(entries, accrualLedgerEntry(item, *brlUnit, direction, *item.BRLAmount, run.AccrualDate, now, "brl"))
		}
		if item.GoldGramAmount != nil && *item.GoldGramAmount > 0 {
			entries = append(entries, accrualLedgerEntry(item, *goldUnit, direction, *item.GoldGramAmount, run.AccrualDate, now, "gold"))
		}
	}
	return entries, nil
}

func accrualLedgerEntry(item db.AccrualItem, valueUnit db.ReferenceData, direction string, amount float64, effectiveDate time.Time, now time.Time, suffix string) db.LedgerEntry {
	entryType := ledgerEntryTypeForAccrualItem(item)
	sourceType, sourceID := ledgerSourceForAccrualItem(item, entryType)
	entryID := "ledger-accrual-" + suffix + "-" + item.ID
	if sourceType == LedgerSourceTypeWorkPeriodAssignment {
		entryID = "ledger-work-period-assignment-" + suffix + "-" + strings.ToLower(strings.TrimSpace(direction)) + "-" + sourceID
	}

	return db.LedgerEntry{
		BaseModel: db.BaseModel{
			ID:        entryID,
			CreatedAt: now,
			UpdatedAt: now,
		},
		TenantID:       item.TenantID,
		PersonID:       item.PersonID,
		CollaboratorID: item.CollaboratorID,
		ValueUnitID:    valueUnit.ID,
		EntryType:      entryType,
		Direction:      direction,
		Amount:         amount,
		EffectiveDate:  effectiveDate,
		SourceType:     sourceType,
		SourceID:       sourceID,
		Description:    item.Description,
		Active:         true,
		CorrectionType: "ORIGINAL",
	}
}

func ledgerEntryTypeForAccrualItem(item db.AccrualItem) string {
	calculationType := strings.ToUpper(strings.TrimSpace(item.CalculationType))
	if strings.Contains(calculationType, "REPLACEMENT") {
		return LedgerEntryTypeReplacementTransfer
	}
	return LedgerEntryTypeEarningCredit
}

func ledgerSourceForAccrualItem(item db.AccrualItem, entryType string) (string, string) {
	if entryType == LedgerEntryTypeEarningCredit && item.WorkPeriodAssignmentID != nil {
		assignmentID := strings.TrimSpace(*item.WorkPeriodAssignmentID)
		if assignmentID != "" {
			return LedgerSourceTypeWorkPeriodAssignment, assignmentID
		}
	}
	return LedgerSourceTypeAccrualItem, item.ID
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
