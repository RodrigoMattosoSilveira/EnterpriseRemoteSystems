package collaborators

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

func ToDTO(row db.CollaboratorJourney) CollaboratorDTO {
	return CollaboratorDTO{
		ID:                 row.ID,
		TenantID:           row.TenantID,
		PersonID:           row.PersonID,
		PersonName:         personName(row.Person),
		JourneyStartDate:   formatDate(row.JourneyStartDate),
		DefaultEndDate:     formatDate(row.DefaultEndDate),
		ExtensionDays:      row.ExtensionDays,
		ProjectedEndDate:   formatDate(row.ProjectedEndDate),
		PaymentMethodID:    row.PaymentMethodID,
		PaymentMethodLabel: row.PaymentMethod.Label,
		PaymentValue:       row.PaymentValue,
		SectorID:           row.SectorID,
		SectorLabel:        row.Sector.Label,
		LocationID:         row.LocationID,
		LocationLabel:      row.Location.Label,
		TaskID:             row.TaskID,
		TaskLabel:          row.Task.Label,
		StatusID:           row.StatusID,
		StatusLabel:        row.Status.Label,
		Notes:              row.Notes,
		ClosedAt:           formatDateTimePtr(row.ClosedAt),
		CreatedAt:          row.CreatedAt.Format(time.RFC3339),
		UpdatedAt:          row.UpdatedAt.Format(time.RFC3339),
	}
}

func ToDTOList(rows []db.CollaboratorJourney) []CollaboratorDTO {
	out := make([]CollaboratorDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToDTO(row))
	}
	return out
}

func personName(person db.Person) string {
	name := strings.TrimSpace(strings.Join([]string{person.FirstName, person.LastName}, " "))
	if person.Nickname == "" {
		return name
	}
	return strings.TrimSpace(name + " (" + person.Nickname + ")")
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
