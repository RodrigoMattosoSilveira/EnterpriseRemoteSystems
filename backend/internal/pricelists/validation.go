package pricelists

import "strings"

// ValidationError carries the English field messages (the existing API
// contract and log text) plus a stable rule code per field. Clients translate
// the rule code; the English message must never be used as a lookup key.
type ValidationError struct {
	Fields map[string]string
	Codes  map[string]string
}

func (e ValidationError) Error() string                           { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string     { return e.Fields }
func (e ValidationError) ValidationFieldCodes() map[string]string { return e.Codes }

const (
	ItemTypeCanteen        = "CANTEEN"
	ItemTypeAdministrative = "ADMINISTRATIVE"
)

// Stable, locale-independent field rule codes returned to clients as
// `fieldCodes`. Renaming one is an API change.
const (
	RuleRequired            = "required"
	RuleMustBePositive      = "must_be_positive"
	RuleInvalidDate         = "invalid_date"
	RuleInvalidItemType     = "invalid_item_type"
	RuleDuplicateActiveCode = "duplicate_active_code"
	RuleInactiveNotEditable = "inactive_not_editable"
)

type fieldErrors struct {
	fields map[string]string
	codes  map[string]string
}

func newFieldErrors() *fieldErrors {
	return &fieldErrors{fields: map[string]string{}, codes: map[string]string{}}
}

func (f *fieldErrors) add(field string, rule string, message string) {
	f.fields[field] = message
	f.codes[field] = rule
}

func (f *fieldErrors) err() error {
	if len(f.fields) == 0 {
		return nil
	}
	return ValidationError{Fields: f.fields, Codes: f.codes}
}

func fieldError(field string, rule string, message string) ValidationError {
	return ValidationError{
		Fields: map[string]string{field: message},
		Codes:  map[string]string{field: rule},
	}
}

func ValidateCreatePriceListItem(req CreatePriceListItemRequest) error {
	return validatePriceListItemFields(req.ItemType, req.Code, req.Description, req.UnitPriceBRL)
}

func ValidateUpdatePriceListItem(req UpdatePriceListItemRequest) error {
	return validatePriceListItemFields(req.ItemType, req.Code, req.Description, req.UnitPriceBRL)
}

func ValidateCreateGoldPrice(req CreateGoldPriceRequest) error {
	errs := newFieldErrors()
	requireString(errs, "priceDate", req.PriceDate)
	requireString(errs, "recordedBy", req.RecordedBy)
	if strings.TrimSpace(req.PriceDate) != "" {
		if _, err := parseDate(req.PriceDate); err != nil {
			errs.add("priceDate", RuleInvalidDate, "Price date must be YYYY-MM-DD")
		}
	}
	if req.BRLPerGram <= 0 {
		errs.add("brlPerGram", RuleMustBePositive, "BRL per gram must be greater than zero")
	}
	return errs.err()
}

func normalizeItemType(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func normalizeCode(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func validatePriceListItemFields(itemType string, code string, description string, unitPriceBRL float64) error {
	errs := newFieldErrors()
	normalizedType := normalizeItemType(itemType)
	requireString(errs, "itemType", itemType)
	requireString(errs, "code", code)
	requireString(errs, "description", description)

	if strings.TrimSpace(itemType) != "" && normalizedType != ItemTypeCanteen && normalizedType != ItemTypeAdministrative {
		errs.add("itemType", RuleInvalidItemType, "Item type must be CANTEEN or ADMINISTRATIVE")
	}
	if unitPriceBRL <= 0 {
		errs.add("unitPriceBrl", RuleMustBePositive, "Unit price in BRL must be greater than zero")
	}
	return errs.err()
}

func requireString(errs *fieldErrors, key string, value string) {
	if strings.TrimSpace(value) == "" {
		errs.add(key, RuleRequired, "Required")
	}
}
