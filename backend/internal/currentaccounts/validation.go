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

func ValidateReverseLedgerEntryRequest(req ReverseLedgerEntryRequest, authorizedBy string) error {
	fields := map[string]string{}
	if strings.TrimSpace(authorizedBy) == "" {
		fields["authorizedBy"] = "Required"
	}
	if strings.TrimSpace(req.Reason) == "" {
		fields["reason"] = "Required"
	}
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
	if strings.TrimSpace(req.Reason) == "" {
		fields["reason"] = "Required"
	}
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
