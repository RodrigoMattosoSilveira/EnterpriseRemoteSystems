package currentaccounts

import (
	"math"
	"strings"
)

type ValidationError struct{ Fields map[string]string }

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

func ValidateLedgerEntryListFilter(filter LedgerEntryListFilter) error {
	fields := map[string]string{}
	if strings.TrimSpace(filter.DateFrom) != "" {
		if _, err := parseDate(filter.DateFrom); err != nil {
			fields["dateFrom"] = "Date from must be YYYY-MM-DD"
		}
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		if _, err := parseDate(filter.DateTo); err != nil {
			fields["dateTo"] = "Date to must be YYYY-MM-DD"
		}
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

func validateCorrectionReason(fields map[string]string, req CorrectionReasonRequest) {
	code, text := normalizedCorrectionReason(req)
	if code == "" {
		fields["reasonCode"] = "Required"
	}
	if text == "" {
		fields["reasonText"] = "Required"
	}
}

func normalizedSecondApproval(req CorrectionReasonRequest) (string, string) {
	if req.SecondApproval == nil {
		return "", ""
	}
	return strings.TrimSpace(req.SecondApproval.ApprovedBy), strings.TrimSpace(req.SecondApproval.Notes)
}

func validateRequiredSecondApproval(fields map[string]string, req CorrectionReasonRequest, authorizedBy string) {
	if req.SecondApproval == nil {
		fields["secondApproval.approvedBy"] = "Required when second-person approval is configured for sensitive operations"
		return
	}
	validateOptionalSecondApproval(fields, req, authorizedBy)
}

func validateOptionalSecondApproval(fields map[string]string, req CorrectionReasonRequest, authorizedBy string) {
	approvedBy, _ := normalizedSecondApproval(req)
	if req.SecondApproval == nil {
		return
	}
	if approvedBy == "" {
		fields["secondApproval.approvedBy"] = "Required"
		return
	}
	if strings.EqualFold(approvedBy, strings.TrimSpace(authorizedBy)) {
		fields["secondApproval.approvedBy"] = "Second approver must be different from the authorizing actor"
	}
}

func ValidateReverseLedgerEntryRequest(req ReverseLedgerEntryRequest, authorizedBy string) error {
	fields := map[string]string{}
	if strings.TrimSpace(authorizedBy) == "" {
		fields["authorizedBy"] = "Required"
	}
	validateCorrectionReason(fields, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(fields, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		fields["effectiveDate"] = "Effective date must be YYYY-MM-DD"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateReplaceLedgerEntryRequest(req ReplaceLedgerEntryRequest, authorizedBy string) error {
	fields := map[string]string{}
	if strings.TrimSpace(authorizedBy) == "" {
		fields["authorizedBy"] = "Required"
	}
	validateCorrectionReason(fields, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(fields, req.CorrectionReasonRequest, authorizedBy)
	if strings.TrimSpace(req.ValueUnitID) == "" {
		fields["valueUnitId"] = "Required"
	}
	if strings.TrimSpace(req.EntryType) == "" {
		fields["entryType"] = "Required"
	}
	direction := strings.ToUpper(strings.TrimSpace(req.Direction))
	if direction != "CREDIT" && direction != "DEBIT" {
		fields["direction"] = "Direction must be CREDIT or DEBIT"
	}
	if req.Amount <= 0 {
		fields["amount"] = "Amount must be greater than zero"
	}
	if _, err := parseDate(req.EffectiveDate); err != nil {
		fields["effectiveDate"] = "Effective date must be YYYY-MM-DD"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateZeroGoldRequest(req ZeroGoldRequest, authorizedBy string) error {
	fields := map[string]string{}
	if strings.TrimSpace(authorizedBy) == "" {
		fields["authorizedBy"] = "Required"
	}
	if strings.TrimSpace(req.RequestID) == "" {
		fields["requestId"] = "Required"
	}
	validateCorrectionReason(fields, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(fields, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		fields["effectiveDate"] = "Effective date must be YYYY-MM-DD"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidatePartialPayoutRequest(req PartialPayoutRequest, authorizedBy string) error {
	fields := map[string]string{}
	if strings.TrimSpace(authorizedBy) == "" {
		fields["authorizedBy"] = "Required"
	}
	if strings.TrimSpace(req.RequestID) == "" {
		fields["requestId"] = "Required"
	}
	validateCorrectionReason(fields, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(fields, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		fields["effectiveDate"] = "Effective date must be YYYY-MM-DD"
	}
	if req.BRLAmount < 0 {
		fields["brlAmount"] = "BRL amount cannot be negative"
	} else if !hasAtMostDecimalPlaces(req.BRLAmount, 2) {
		fields["brlAmount"] = "BRL amount supports at most 2 decimal places"
	}
	if req.GoldGramAmount < 0 {
		fields["goldGramAmount"] = "Gold amount cannot be negative"
	} else if !hasAtMostDecimalPlaces(req.GoldGramAmount, 8) {
		fields["goldGramAmount"] = "Gold amount supports at most 8 decimal places"
	}
	if req.BRLAmount <= 0 && req.GoldGramAmount <= 0 {
		fields["amount"] = "At least one payout amount must be greater than zero"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
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
	fields := map[string]string{}
	if strings.TrimSpace(authorizedBy) == "" {
		fields["authorizedBy"] = "Required"
	}
	if strings.TrimSpace(req.RequestID) == "" {
		fields["requestId"] = "Required"
	}
	validateCorrectionReason(fields, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(fields, req.CorrectionReasonRequest, authorizedBy)
	if _, err := parseDate(req.EffectiveDate); err != nil {
		fields["effectiveDate"] = "Effective date must be YYYY-MM-DD"
	}
	if !req.Confirm {
		fields["confirm"] = "Confirmation is required"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateReceiptBackfillRequest(req ReceiptBackfillRequest, authorizedBy string) error {
	fields := map[string]string{}
	if strings.TrimSpace(authorizedBy) == "" {
		fields["authorizedBy"] = "Required"
	}
	validateCorrectionReason(fields, req.CorrectionReasonRequest)
	validateOptionalSecondApproval(fields, req.CorrectionReasonRequest, authorizedBy)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}
