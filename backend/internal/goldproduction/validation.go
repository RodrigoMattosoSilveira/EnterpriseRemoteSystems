package goldproduction

import (
	"math"
	"strings"
	"time"
)

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

func ValidateCreateGoldProductionEntry(req CreateGoldProductionEntryRequest) error {
	fields := map[string]string{}
	requireString(fields, "locationId", req.LocationID)
	requireString(fields, "productionDate", req.ProductionDate)
	validateDate(fields, "productionDate", req.ProductionDate)
	validateGoldGrams(fields, req.GoldGramsProduced)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateUpdateGoldProductionEntry(req UpdateGoldProductionEntryRequest) error {
	fields := map[string]string{}
	requireString(fields, "locationId", req.LocationID)
	requireString(fields, "productionDate", req.ProductionDate)
	validateDate(fields, "productionDate", req.ProductionDate)
	validateGoldGrams(fields, req.GoldGramsProduced)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateListFilter(filter GoldProductionEntryListFilter) error {
	fields := map[string]string{}
	validateDate(fields, "dateFrom", filter.DateFrom)
	validateDate(fields, "dateTo", filter.DateTo)
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

func requireString(fields map[string]string, key string, value string) {
	if strings.TrimSpace(value) == "" {
		fields[key] = "Required"
	}
}

func validateDate(fields map[string]string, key string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if _, err := time.Parse(dateLayout, trimmed); err != nil {
		fields[key] = "Must be a valid date in YYYY-MM-DD format"
	}
}

func validateGoldGrams(fields map[string]string, value float64) {
	if value <= 0 {
		fields["goldGramsProduced"] = "Gold grams produced must be greater than zero"
		return
	}
	if !hasAtMostEightDecimalPlaces(value) {
		fields["goldGramsProduced"] = "Gold grams produced supports at most 8 decimal places"
	}
}

func hasAtMostEightDecimalPlaces(value float64) bool {
	scaled := value * 100000000
	return math.Abs(scaled-math.Round(scaled)) < 0.000001
}
