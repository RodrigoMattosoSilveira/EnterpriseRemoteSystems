package goldproduction

import (
	"math"
	"strings"
	"time"

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
	RuleInactiveEntryNotEditable = "inactive_entry_not_editable"
	RuleInactiveReference        = "inactive_reference"
	RuleProductionDateMismatch   = "production_date_mismatch"
	RuleProductionEntryExists    = "production_entry_exists"
	RuleTooManyDecimals          = "too_many_decimals"
	RuleWorkPeriodClosed         = "work_period_closed"
)

func fieldError(field string, rule string, message string) ValidationError {
	fields, codes := fielderrors.Single(field, rule, message)
	return ValidationError{Fields: fields, Codes: codes}
}

func ValidateCreateGoldProductionEntry(req CreateGoldProductionEntryRequest) error {
	errs := fielderrors.New()
	errs.Require("locationId", req.LocationID)
	errs.Require("productionDate", req.ProductionDate)
	validateDate(errs, "productionDate", req.ProductionDate)
	validateGoldGrams(errs, req.GoldGramsProduced)
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateUpdateGoldProductionEntry(req UpdateGoldProductionEntryRequest) error {
	errs := fielderrors.New()
	errs.Require("locationId", req.LocationID)
	errs.Require("productionDate", req.ProductionDate)
	validateDate(errs, "productionDate", req.ProductionDate)
	validateGoldGrams(errs, req.GoldGramsProduced)
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateListFilter(filter GoldProductionEntryListFilter) error {
	errs := fielderrors.New()
	validateDate(errs, "dateFrom", filter.DateFrom)
	validateDate(errs, "dateTo", filter.DateTo)
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

func validateDate(errs *fielderrors.Collector, key string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if _, err := time.Parse(dateLayout, trimmed); err != nil {
		errs.Add(key, fielderrors.InvalidDate, "Must be a valid date in YYYY-MM-DD format")
	}
}

func validateGoldGrams(errs *fielderrors.Collector, value float64) {
	if value <= 0 {
		errs.Add("goldGramsProduced", fielderrors.MustBePositive, "Gold grams produced must be greater than zero")
		return
	}
	if !hasAtMostEightDecimalPlaces(value) {
		errs.Add("goldGramsProduced", RuleTooManyDecimals, "Gold grams produced supports at most 8 decimal places")
	}
}

func hasAtMostEightDecimalPlaces(value float64) bool {
	scaled := value * 100000000
	return math.Abs(scaled-math.Round(scaled)) < 0.000001
}
