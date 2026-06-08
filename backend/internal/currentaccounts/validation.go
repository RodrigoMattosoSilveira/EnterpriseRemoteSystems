package currentaccounts

import "strings"

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
