package collaborators

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

func ToDTO(row db.CollaboratorJourney) CollaboratorDTO {
	return CollaboratorDTO{
		ID:                             row.ID,
		TenantID:                       row.TenantID,
		PersonID:                       row.PersonID,
		PersonName:                     personName(row.Person),
		PersonNickname:                 strings.TrimSpace(row.Person.Nickname),
		JourneyStartDate:               formatDate(row.JourneyStartDate),
		DefaultEndDate:                 formatDate(row.DefaultEndDate),
		ExtensionDays:                  row.ExtensionDays,
		ProjectedEndDate:               formatDate(row.ProjectedEndDate),
		PaymentMethodID:                row.PaymentMethodID,
		PaymentMethodLabel:             row.PaymentMethod.Label,
		PaymentValue:                   paymentValueForCompatibility(row),
		FixedMonthlyBRLAmount:          row.FixedMonthlyBRLAmount,
		DailyBRLAmount:                 row.DailyBRLAmount,
		GoldCommissionPercent:          row.GoldCommissionPercent,
		TimeOffGoldSplitPercent:        row.TimeOffGoldSplitPercent,
		SickDayOffReplacementGoldGrams: row.SickDayOffReplacementGoldGrams,
		PlanningAvailability:           normalizePlanningAvailability(row.PlanningAvailability),
		SectorID:                       row.SectorID,
		SectorLabel:                    row.Sector.Label,
		LocationID:                     row.LocationID,
		LocationLabel:                  row.Location.Label,
		TaskID:                         row.TaskID,
		TaskLabel:                      row.Task.Label,
		StatusID:                       row.StatusID,
		StatusCode:                     row.Status.Code,
		StatusLabel:                    row.Status.Label,
		Notes:                          row.Notes,
		ClosedAt:                       formatDateTimePtr(row.ClosedAt),
		CreatedAt:                      row.CreatedAt.Format(time.RFC3339),
		UpdatedAt:                      row.UpdatedAt.Format(time.RFC3339),
	}
}

func paymentValueForCompatibility(row db.CollaboratorJourney) float64 {
	if row.PaymentValue > 0 {
		return row.PaymentValue
	}
	if row.DailyBRLAmount != nil {
		return *row.DailyBRLAmount
	}
	if row.FixedMonthlyBRLAmount != nil {
		return *row.FixedMonthlyBRLAmount
	}
	if row.GoldCommissionPercent != nil {
		return *row.GoldCommissionPercent
	}
	return 0
}

func ToDTOList(rows []db.CollaboratorJourney) []CollaboratorDTO {
	out := make([]CollaboratorDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToDTO(row))
	}
	return out
}

func personName(person db.Person) string {
	return strings.TrimSpace(strings.Join([]string{person.FirstName, person.LastName}, " "))
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

func formatDateTimePtr(value *time.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}
