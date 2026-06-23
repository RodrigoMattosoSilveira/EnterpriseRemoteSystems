package pricelists

import "strings"

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

const (
	ItemTypeCanteen        = "CANTEEN"
	ItemTypeAdministrative = "ADMINISTRATIVE"
)

func ValidateCreatePriceListItem(req CreatePriceListItemRequest) error {
	return validatePriceListItemFields(req.ItemType, req.Code, req.Description, req.UnitPriceBRL)
}

func ValidateUpdatePriceListItem(req UpdatePriceListItemRequest) error {
	return validatePriceListItemFields(req.ItemType, req.Code, req.Description, req.UnitPriceBRL)
}

func ValidateCreateGoldPrice(req CreateGoldPriceRequest) error {
	fields := map[string]string{}
	requireString(fields, "priceDate", req.PriceDate)
	requireString(fields, "recordedBy", req.RecordedBy)
	if strings.TrimSpace(req.PriceDate) != "" {
		if _, err := parseDate(req.PriceDate); err != nil {
			fields["priceDate"] = "Price date must be YYYY-MM-DD"
		}
	}
	if req.BRLPerGram <= 0 {
		fields["brlPerGram"] = "BRL per gram must be greater than zero"
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func normalizeItemType(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func normalizeCode(value string) string {
	return strings.ToUpper(strings.TrimSpace(value))
}

func validatePriceListItemFields(itemType string, code string, description string, unitPriceBRL float64) error {
	fields := map[string]string{}
	normalizedType := normalizeItemType(itemType)
	requireString(fields, "itemType", itemType)
	requireString(fields, "code", code)
	requireString(fields, "description", description)

	if strings.TrimSpace(itemType) != "" && normalizedType != ItemTypeCanteen && normalizedType != ItemTypeAdministrative {
		fields["itemType"] = "Item type must be CANTEEN or ADMINISTRATIVE"
	}
	if unitPriceBRL <= 0 {
		fields["unitPriceBrl"] = "Unit price in BRL must be greater than zero"
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
