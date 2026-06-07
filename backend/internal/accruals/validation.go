package accruals

import "strings"

type ValidationError struct{ Fields map[string]string }

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

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

	LedgerEntryTypeEarningCredit       = "EARNING_CREDIT"
	LedgerEntryTypeReplacementTransfer = "REPLACEMENT_TRANSFER"
	LedgerSourceTypeAccrualItem        = "ACCRUAL_ITEM"
	ValueUnitCodeBRL                   = "BRL"
	ValueUnitCodeGoldGram              = "GOLD_GRAM"

	PendingReasonActualOutcomeMissing         = "ACTUAL_OUTCOME_MISSING"
	PendingReasonGoldProductionMissing        = "GOLD_PRODUCTION_MISSING"
	PendingReasonPaymentConfigurationMissing  = "PAYMENT_CONFIGURATION_MISSING"
	PendingReasonReplacementRuleDeferred      = "REPLACEMENT_RULE_DEFERRED"
	PendingReasonReplacementAssignmentMissing = "REPLACEMENT_ASSIGNMENT_MISSING"
)

const dateLayout = "2006-01-02"

func ValidateCreateAccrualRun(req CreateAccrualRunRequest) error {
	fields := map[string]string{}
	if strings.TrimSpace(req.AccrualDate) != "" {
		if _, err := parseDate(req.AccrualDate); err != nil {
			fields["accrualDate"] = "Accrual date must be YYYY-MM-DD"
		}
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateRunListFilter(filter AccrualRunListFilter) error {
	fields := map[string]string{}
	if strings.TrimSpace(filter.Status) != "" && !isKnownRunStatus(strings.ToUpper(strings.TrimSpace(filter.Status))) {
		fields["status"] = "Unknown accrual run status"
	}
	if filter.Page < 0 {
		fields["page"] = "Page must be greater than zero"
	}
	if filter.PageSize < 0 {
		fields["pageSize"] = "Page size must be greater than zero"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateItemListFilter(filter AccrualItemListFilter) error {
	fields := map[string]string{}
	if strings.TrimSpace(filter.Status) != "" && !isKnownItemStatus(strings.ToUpper(strings.TrimSpace(filter.Status))) {
		fields["status"] = "Unknown accrual item status"
	}
	if filter.Page < 0 {
		fields["page"] = "Page must be greater than zero"
	}
	if filter.PageSize < 0 {
		fields["pageSize"] = "Page size must be greater than zero"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
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
