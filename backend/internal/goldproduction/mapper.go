package goldproduction

import (
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

func ToDTO(row db.GoldProductionEntry) GoldProductionEntryDTO {
	return GoldProductionEntryDTO{
		ID:                row.ID,
		TenantID:          row.TenantID,
		WorkPeriodID:      row.WorkPeriodID,
		LocationID:        row.LocationID,
		LocationLabel:     row.Location.Label,
		ProductionDate:    row.ProductionDate.Format(dateLayout),
		GoldGramsProduced: row.GoldGramsProduced,
		Active:            row.Active,
		Notes:             row.Notes,
		CreatedAt:         row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:         row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func ToDTOList(rows []db.GoldProductionEntry) []GoldProductionEntryDTO {
	out := make([]GoldProductionEntryDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToDTO(row))
	}
	return out
}
