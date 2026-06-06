package workperiods

import (
	"fmt"
	"sort"
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

func ToRosterDTO(workPeriod db.WorkPeriod, assignments []db.WorkPeriodAssignment) WorkPlanRosterDTO {
	rows := make([]WorkPlanRosterRow, 0, len(assignments))
	sort.SliceStable(assignments, func(i, j int) bool {
		return strings.ToLower(collaboratorDisplayName(assignments[i])) < strings.ToLower(collaboratorDisplayName(assignments[j]))
	})

	for _, assignment := range assignments {
		row := WorkPlanRosterRow{
			AssignmentID:   assignment.ID,
			CollaboratorID: assignment.CollaboratorID,
			Name:           collaboratorDisplayName(assignment),
			Nickname:       assignment.Collaborator.Person.Nickname,
			SectorID:       assignment.SectorID,
			SectorLabel:    assignment.Sector.Label,
			LocationID:     assignment.LocationID,
			LocationLabel:  assignment.Location.Label,
			TaskID:         assignment.TaskID,
			TaskLabel:      assignment.Task.Label,
		}
		if assignment.ReplacementForAssignmentID != nil {
			row.ReplacementForID = *assignment.ReplacementForAssignmentID
		}
		rows = append(rows, row)
	}

	displayDate := formatDisplayDate(workPeriod.WorkDate)
	periodName := workPeriod.Name
	return WorkPlanRosterDTO{
		WorkPeriodID: workPeriod.ID,
		WorkDate:     formatDate(workPeriod.WorkDate),
		DisplayDate:  displayDate,
		PeriodCode:   workPeriod.PeriodCode,
		PeriodName:   periodName,
		Title:        "Work Plan",
		Subtitle:     fmt.Sprintf("%s — %s", displayDate, periodName),
		Status:       workPeriod.Status,
		Rows:         rows,
	}
}

func collaboratorDisplayName(assignment db.WorkPeriodAssignment) string {
	person := assignment.Collaborator.Person
	name := strings.TrimSpace(strings.TrimSpace(person.FirstName) + " " + strings.TrimSpace(person.LastName))
	if name != "" {
		return name
	}
	return assignment.CollaboratorID
}

func formatDisplayDate(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format("01/02/2006")
}
