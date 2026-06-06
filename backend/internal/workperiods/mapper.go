package workperiods

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

func ToDTO(row db.WorkPeriod) WorkPeriodDTO {
	return WorkPeriodDTO{
		ID:              row.ID,
		TenantID:        row.TenantID,
		WorkDate:        formatDate(row.WorkDate),
		PeriodCode:      row.PeriodCode,
		Name:            row.Name,
		StartsAt:        formatTime(row.StartsAt),
		EndsAt:          formatTime(row.EndsAt),
		Status:          row.Status,
		InformedAt:      formatOptionalTime(row.InformedAt),
		AccrualOpenedAt: formatOptionalTime(row.AccrualOpenedAt),
		ClosedAt:        formatOptionalTime(row.ClosedAt),
		CreatedAt:       row.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:       row.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func ToDTOList(rows []db.WorkPeriod) []WorkPeriodDTO {
	out := make([]WorkPeriodDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToDTO(row))
	}
	return out
}

func parseDate(value string) (time.Time, error) {
	return time.Parse(dateLayout, strings.TrimSpace(value))
}

func parseTimestamp(value string) (time.Time, error) {
	return time.Parse(time.RFC3339, strings.TrimSpace(value))
}

func formatDate(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(dateLayout)
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func formatOptionalTime(value *time.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}
