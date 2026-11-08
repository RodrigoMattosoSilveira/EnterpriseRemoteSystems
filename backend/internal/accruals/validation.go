package accruals

import (
	"strings"

	"enterpriseremotesystems/backend/internal/shared/fielderrors"
)

type ValidationError struct {
	Fields map[string]string
	Codes  map[string]string
}

func (e ValidationError) Error() string                           { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string     { return e.Fields }
func (e ValidationError) ValidationFieldCodes() map[string]string { return e.Codes }

// Stable rule codes returned as `fieldCodes` (shared ones live in
// internal/shared/fielderrors). Renaming one is an API change.
const (
	RuleAccrualRunNotRecalculable = "accrual_run_not_recalculable"
	RuleAccrualRunVoided          = "accrual_run_voided"
	RuleNoPositiveAccrualAmounts  = "no_positive_accrual_amounts"
	RuleNoReadyAccrualItems       = "no_ready_accrual_items"
	RuleUnknownStatus             = "unknown_status"
	RuleWorkPeriodClosed          = "work_period_closed"
)

func fieldError(field string, rule string, message string) ValidationError {
	fields, codes := fielderrors.Single(field, rule, message)
	return ValidationError{Fields: fields, Codes: codes}
}

const (
	RunStatusDraft        = "DRAFT"
	RunStatusPendingInput = "PENDING_INPUT"
	RunStatusReadyToPost  = "READY_TO_POST"
	RunStatusPosted       = "POSTED"
	RunStatusVoided       = "VOIDED"

	ItemStatusPending = "PENDING"
	ItemStatusReady   = "READY"
	ItemStatusPosted  = "POSTED"
	ItemStatusSkipped = "SKIPPED"

	DirectionCredit = "CREDIT"
	DirectionDebit  = "DEBIT"

	LedgerEntryTypeEarningCredit         = "EARNING_CREDIT"
	LedgerEntryTypeReplacementTransfer   = "REPLACEMENT_TRANSFER"
	LedgerSourceTypeAccrualItem          = "ACCRUAL_ITEM"
	LedgerSourceTypeWorkPeriodAssignment = "WORK_PERIOD_ASSIGNMENT"
	ValueUnitCodeBRL                     = "BRL"
	ValueUnitCodeGoldGram                = "GOLD_GRAM"

	PendingReasonActualOutcomeMissing         = "ACTUAL_OUTCOME_MISSING"
	PendingReasonGoldProductionMissing        = "GOLD_PRODUCTION_MISSING"
	PendingReasonPaymentConfigurationMissing  = "PAYMENT_CONFIGURATION_MISSING"
	PendingReasonReplacementRuleDeferred      = "REPLACEMENT_RULE_DEFERRED"
	PendingReasonReplacementAssignmentMissing = "REPLACEMENT_ASSIGNMENT_MISSING"
)

const dateLayout = "2006-01-02"

func ValidateCreateAccrualRun(req CreateAccrualRunRequest) error {
	errs := fielderrors.New()
	if strings.TrimSpace(req.AccrualDate) != "" {
		if _, err := parseDate(req.AccrualDate); err != nil {
			errs.Add("accrualDate", fielderrors.InvalidDate, "Accrual date must be YYYY-MM-DD")
		}
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateRunListFilter(filter AccrualRunListFilter) error {
	errs := fielderrors.New()
	if strings.TrimSpace(filter.Status) != "" && !isKnownRunStatus(strings.ToUpper(strings.TrimSpace(filter.Status))) {
		errs.Add("status", RuleUnknownStatus, "Unknown accrual run status")
	}
	if filter.Page < 0 {
		errs.Add("page", fielderrors.MustBePositive, "Page must be greater than zero")
	}
	if filter.PageSize < 0 {
		errs.Add("pageSize", fielderrors.MustBePositive, "Page size must be greater than zero")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateItemListFilter(filter AccrualItemListFilter) error {
	errs := fielderrors.New()
	if strings.TrimSpace(filter.Status) != "" && !isKnownItemStatus(strings.ToUpper(strings.TrimSpace(filter.Status))) {
		errs.Add("status", RuleUnknownStatus, "Unknown accrual item status")
	}
	if filter.Page < 0 {
		errs.Add("page", fielderrors.MustBePositive, "Page must be greater than zero")
	}
	if filter.PageSize < 0 {
		errs.Add("pageSize", fielderrors.MustBePositive, "Page size must be greater than zero")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func isKnownRunStatus(status string) bool {
	switch status {
	case RunStatusDraft, RunStatusPendingInput, RunStatusReadyToPost, RunStatusPosted, RunStatusVoided:
		return true
	default:
		return false
	}
}
func isKnownItemStatus(status string) bool {
	switch status {
	case ItemStatusPending, ItemStatusReady, ItemStatusPosted, ItemStatusSkipped:
		return true
	default:
		return false
	}
}
