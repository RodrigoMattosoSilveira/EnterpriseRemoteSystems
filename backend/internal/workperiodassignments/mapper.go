package workperiodassignments

import (
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

func ToDTO(row db.WorkPeriodAssignment) WorkPeriodAssignmentDTO {
	return WorkPeriodAssignmentDTO{
		ID:                         row.ID,
		TenantID:                   row.TenantID,
		WorkPeriodID:               row.WorkPeriodID,
		CollaboratorID:             row.CollaboratorID,
		CollaboratorName:           collaboratorName(row.Collaborator),
		CollaboratorNickname:       row.Collaborator.Person.Nickname,
		PlannedStatus:              row.PlannedStatus,
		ActualStatus:               nilString(row.ActualStatus),
		ReplacementForAssignmentID: nilString(row.ReplacementForAssignmentID),
		SectorID:                   row.SectorID,
		SectorLabel:                row.Sector.Label,
		LocationID:                 row.LocationID,
		LocationLabel:              row.Location.Label,
		TaskID:                     row.TaskID,
		TaskLabel:                  row.Task.Label,
		Active:                     row.Active,
		CreatedAt:                  formatTime(row.CreatedAt),
		UpdatedAt:                  formatTime(row.UpdatedAt),
	}
}

func ToDTOList(rows []db.WorkPeriodAssignment) []WorkPeriodAssignmentDTO {
	items := make([]WorkPeriodAssignmentDTO, 0, len(rows))
	for _, row := range rows {
		items = append(items, ToDTO(row))
	}
	return items
}

func collaboratorName(row db.CollaboratorJourney) string {
	if row.Person.FirstName == "" && row.Person.LastName == "" {
		return ""
	}
	if row.Person.LastName == "" {
		return row.Person.FirstName
	}
	if row.Person.FirstName == "" {
		return row.Person.LastName
	}
	return row.Person.FirstName + " " + row.Person.LastName
}

func nilString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}
