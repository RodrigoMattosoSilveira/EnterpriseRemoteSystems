package pricelists

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

func ToPriceListItemDTO(row db.ExpensePriceListItem) PriceListItemDTO {
	return PriceListItemDTO{
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
		PriceDate:  formatDate(row.PriceDate),
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
