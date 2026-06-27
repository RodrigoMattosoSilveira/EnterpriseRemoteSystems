package pricelists

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

func ToPriceListItemDTO(row db.ExpensePriceListItem) PriceListItemDTO {
	dto := PriceListItemDTO{
		ID:           row.ID,
		TenantID:     row.TenantID,
		ItemType:     row.ItemType,
		Code:         row.Code,
		Description:  row.Description,
		UnitPriceBRL: row.UnitPriceBRL,
		Active:       row.Active,
		SortOrder:    row.SortOrder,
		CreatedAt:    row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:    row.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if row.SupersededPriceListItemID != nil {
		dto.SupersededPriceListItemID = *row.SupersededPriceListItemID
	}
	return dto
}

func ToPriceListItemDTOList(rows []db.ExpensePriceListItem) []PriceListItemDTO {
	out := make([]PriceListItemDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToPriceListItemDTO(row))
	}
	return out
}

func ToGoldPriceDTO(row db.GoldPrice) GoldPriceDTO {
	return GoldPriceDTO{
		ID:         row.ID,
		TenantID:   row.TenantID,
		PriceDate:  formatStoredDate(row.PriceDate),
		BRLPerGram: row.BRLPerGram,
		RecordedBy: row.RecordedBy,
		Notes:      row.Notes,
		Active:     row.Active,
		CreatedAt:  row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:  row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func ToGoldPriceDTOList(rows []db.GoldPrice) []GoldPriceDTO {
	out := make([]GoldPriceDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToGoldPriceDTO(row))
	}
	return out
}

func parseDate(value string) (time.Time, error) {
	return time.Parse(dateLayout, strings.TrimSpace(value))
}

func formatDate(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(dateLayout)
}

func formatStoredDate(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if parsed, err := time.Parse(dateLayout, trimmed); err == nil {
		return parsed.Format(dateLayout)
	}
	if len(trimmed) >= len(dateLayout) {
		prefix := trimmed[:len(dateLayout)]
		if parsed, err := time.Parse(dateLayout, prefix); err == nil {
			return parsed.Format(dateLayout)
		}
	}
	return trimmed
}
