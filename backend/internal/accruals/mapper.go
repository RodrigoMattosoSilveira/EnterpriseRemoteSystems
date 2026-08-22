package accruals

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

func ToRunDTO(row db.AccrualRun, summary AccrualSummaryDTO) AccrualRunDTO {
	return AccrualRunDTO{ID: row.ID, TenantID: row.TenantID, WorkPeriodID: row.WorkPeriodID, Status: row.Status, AccrualDate: formatDate(row.AccrualDate), Notes: row.Notes, Summary: summary, CreatedAt: formatTime(row.CreatedAt), UpdatedAt: formatTime(row.UpdatedAt)}
}

func ToRunDTOList(rows []db.AccrualRun, summaries map[string]AccrualSummaryDTO) []AccrualRunDTO {
	out := make([]AccrualRunDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToRunDTO(row, summaries[row.ID]))
	}
	return out
}

func ToItemDTO(row db.AccrualItem) AccrualItemDTO {
	return AccrualItemDTO{ID: row.ID, TenantID: row.TenantID, PersonID: row.PersonID, AccrualRunID: row.AccrualRunID, WorkPeriodID: row.WorkPeriodID, WorkPeriodAssignmentID: nilString(row.WorkPeriodAssignmentID), CollaboratorID: row.CollaboratorID, CollaboratorName: collaboratorName(row.Collaborator), CalculationType: row.CalculationType, Direction: row.Direction, BRLAmount: row.BRLAmount, GoldGramAmount: row.GoldGramAmount, Status: row.Status, PendingReason: row.PendingReason, Description: row.Description, CreatedAt: formatTime(row.CreatedAt), UpdatedAt: formatTime(row.UpdatedAt)}
}

func ToItemDTOList(rows []db.AccrualItem) []AccrualItemDTO {
	out := make([]AccrualItemDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToItemDTO(row))
	}
	return out
}

func collaboratorName(row db.CollaboratorJourney) string {
	return strings.TrimSpace(strings.Join([]string{row.Person.FirstName, row.Person.LastName}, " "))
}
func nilString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
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
