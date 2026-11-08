package currentaccounts

import (
	"math"
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
	RuleConfirmationRequired      = "confirmation_required"
	RuleDifferentApproverRequired = "different_approver_required"
	RuleInvalidDirection          = "invalid_direction"
	RuleInvalidSourceType         = "invalid_source_type"
	RuleMustNotBeNegative         = "must_not_be_negative"
	RulePayoutAmountRequired      = "payout_amount_required"
	RuleSecondApprovalRequired    = "second_approval_required"
	RuleTooManyDecimals           = "too_many_decimals"
	RuleUnknownStatus             = "unknown_status"
)

func fieldError(field string, rule string, message string) ValidationError {
	fields, codes := fielderrors.Single(field, rule, message)
	return ValidationError{Fields: fields, Codes: codes}
}

func ValidateLedgerEntryListFilter(filter LedgerEntryListFilter) error {
	errs := fielderrors.New()
	if strings.TrimSpace(filter.DateFrom) != "" {
		if _, err := parseDate(filter.DateFrom); err != nil {
			errs.Add("dateFrom", fielderrors.InvalidDate, "Date from must be YYYY-MM-DD")
		}
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		if _, err := parseDate(filter.DateTo); err != nil {
			errs.Add("dateTo", fielderrors.InvalidDate, "Date to must be YYYY-MM-DD")
		}
	}
	direction := strings.ToUpper(strings.TrimSpace(filter.Direction))
	if direction != "" && direction != "CREDIT" && direction != "DEBIT" {
		errs.Add("direction", RuleInvalidDirection, "Direction must be CREDIT or DEBIT")
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

func normalizedCorrectionReason(req CorrectionReasonRequest) (string, string) {
	code := strings.ToUpper(strings.TrimSpace(req.ReasonCode))
	text := strings.TrimSpace(req.ReasonText)
	if text == "" {
		text = strings.TrimSpace(req.Reason)
	}
	if code == "" && text != "" {
		code = "MANUAL_CORRECTION"
	}
	return code, text
}

func validateCorrectionReason(errs *fielderrors.Collector, req CorrectionReasonRequest) {
	code, text := normalizedCorrectionReason(req)
	if code == "" {
		errs.Add("reasonCode", fielderrors.Required, "Required")
	}
	if text == "" {
		errs.Add("reasonText", fielderrors.Required, "Required")
	}
}

func normalizedSecondApproval(req CorrectionReasonRequest) (string, string) {
	if req.SecondApproval == nil {
		return "", ""
	}
	return strings.TrimSpace(req.SecondApproval.ApprovedBy), strings.TrimSpace(req.SecondApproval.Notes)
}

func validateRequiredSecondApproval(errs *fielderrors.Collector, req CorrectionReasonRequest, authorizedBy string) {
	if req.SecondApproval == nil {
		errs.Add("secondApproval.approvedBy", RuleSecondApprovalRequired, "Required when second-person approval is configured for sensitive operations")
		return
	}
	validateOptionalSecondApproval(errs, req, authorizedBy)
}

func validateOptionalSecondApproval(errs *fielderrors.Collector, req CorrectionReasonRequest, authorizedBy string) {
	approvedBy, _ := normalizedSecondApproval(req)
	if req.SecondApproval == nil {
		return
	}
	if approvedBy == "" {
		errs.Add("secondApproval.approvedBy", fielderrors.Required, "Required")
		return
	}
	if strings.EqualFold(approvedBy, strings.TrimSpace(authorizedBy)) {
		errs.Add("secondApproval.approvedBy", RuleDifferentApproverRequired, "Second approver must be different from the authorizing actor")
	}
}

func ValidateReverseLedgerEntryRequest(req ReverseLedgerEntryRequest, authorizedBy string) error {
	errs := fielderrors.New()
	if strings.TrimSpace(authorizedBy) == "" {
		errs.Add("authorizedBy", fielderrors.Required, "Required")
	}
	validateCorrectionReason(errs, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(errs, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		errs.Add("effectiveDate", fielderrors.InvalidDate, "Effective date must be YYYY-MM-DD")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateReplaceLedgerEntryRequest(req ReplaceLedgerEntryRequest, authorizedBy string) error {
	errs := fielderrors.New()
	if strings.TrimSpace(authorizedBy) == "" {
		errs.Add("authorizedBy", fielderrors.Required, "Required")
	}
	validateCorrectionReason(errs, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(errs, req.CorrectionReasonRequest, authorizedBy)
	if strings.TrimSpace(req.ValueUnitID) == "" {
		errs.Add("valueUnitId", fielderrors.Required, "Required")
	}
	if strings.TrimSpace(req.EntryType) == "" {
		errs.Add("entryType", fielderrors.Required, "Required")
	}
	direction := strings.ToUpper(strings.TrimSpace(req.Direction))
	if direction != "CREDIT" && direction != "DEBIT" {
		errs.Add("direction", RuleInvalidDirection, "Direction must be CREDIT or DEBIT")
	}
	if req.Amount <= 0 {
		errs.Add("amount", fielderrors.MustBePositive, "Amount must be greater than zero")
	}
	if _, err := parseDate(req.EffectiveDate); err != nil {
		errs.Add("effectiveDate", fielderrors.InvalidDate, "Effective date must be YYYY-MM-DD")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateZeroGoldRequest(req ZeroGoldRequest, authorizedBy string) error {
	errs := fielderrors.New()
	if strings.TrimSpace(authorizedBy) == "" {
		errs.Add("authorizedBy", fielderrors.Required, "Required")
	}
	if strings.TrimSpace(req.RequestID) == "" {
		errs.Add("requestId", fielderrors.Required, "Required")
	}
	validateCorrectionReason(errs, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(errs, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		errs.Add("effectiveDate", fielderrors.InvalidDate, "Effective date must be YYYY-MM-DD")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidatePartialPayoutRequest(req PartialPayoutRequest, authorizedBy string) error {
	errs := fielderrors.New()
	if strings.TrimSpace(authorizedBy) == "" {
		errs.Add("authorizedBy", fielderrors.Required, "Required")
	}
	if strings.TrimSpace(req.RequestID) == "" {
		errs.Add("requestId", fielderrors.Required, "Required")
	}
	validateCorrectionReason(errs, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(errs, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		errs.Add("effectiveDate", fielderrors.InvalidDate, "Effective date must be YYYY-MM-DD")
	}
	if req.BRLAmount < 0 {
		errs.Add("brlAmount", RuleMustNotBeNegative, "BRL amount cannot be negative")
	} else if !hasAtMostDecimalPlaces(req.BRLAmount, 2) {
		errs.Add("brlAmount", RuleTooManyDecimals, "BRL amount supports at most 2 decimal places")
	}
	if req.GoldGramAmount < 0 {
		errs.Add("goldGramAmount", RuleMustNotBeNegative, "Gold amount cannot be negative")
	} else if !hasAtMostDecimalPlaces(req.GoldGramAmount, 8) {
		errs.Add("goldGramAmount", RuleTooManyDecimals, "Gold amount supports at most 8 decimal places")
	}
	if req.BRLAmount <= 0 && req.GoldGramAmount <= 0 {
		errs.Add("amount", RulePayoutAmountRequired, "At least one payout amount must be greater than zero")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func hasAtMostDecimalPlaces(value float64, places int) bool {
	scale := 1.0
	for range places {
		scale *= 10
	}
	scaled := value * scale
	return math.Abs(scaled-math.Round(scaled)) < 0.0000001
}
func ValidateCloseJourneyRequest(req CloseJourneyRequest, authorizedBy string) error {
	errs := fielderrors.New()
	if strings.TrimSpace(authorizedBy) == "" {
		errs.Add("authorizedBy", fielderrors.Required, "Required")
	}
	if strings.TrimSpace(req.RequestID) == "" {
		errs.Add("requestId", fielderrors.Required, "Required")
	}
	validateCorrectionReason(errs, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(errs, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		errs.Add("effectiveDate", fielderrors.InvalidDate, "Effective date must be YYYY-MM-DD")
	}
	if !req.Confirm {
		errs.Add("confirm", RuleConfirmationRequired, "Confirmation is required")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateReceiptBackfillRequest(req ReceiptBackfillRequest, authorizedBy string) error {
	errs := fielderrors.New()
	if strings.TrimSpace(authorizedBy) == "" {
		errs.Add("authorizedBy", fielderrors.Required, "Required")
	}
	validateCorrectionReason(errs, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(errs, req.CorrectionReasonRequest, authorizedBy)
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateFinalSettlementRequest(req FinalSettlementRequest, authorizedBy string) error {
	errs := fielderrors.New()
	if strings.TrimSpace(authorizedBy) == "" {
		errs.Add("authorizedBy", fielderrors.Required, "Required")
	}
	if strings.TrimSpace(req.RequestID) == "" {
		errs.Add("requestId", fielderrors.Required, "Required")
	}
	validateCorrectionReason(errs, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(errs, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		errs.Add("effectiveDate", fielderrors.InvalidDate, "Effective date must be YYYY-MM-DD")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateAcceptReceiptRequest(req AcceptReceiptRequest) error {
	if req.Confirm {
		return nil
	}
	return fieldError("confirm", RuleConfirmationRequired, "Confirmation is required")
}
