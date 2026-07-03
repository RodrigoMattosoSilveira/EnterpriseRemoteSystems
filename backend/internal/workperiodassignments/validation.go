package workperiodassignments

import (
	"fmt"
	"strings"
)

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

const (
	PlannedStatusIncluded = "INCLUDED"
	PlannedStatusExcluded = "EXCLUDED"

	ActualStatusWorked     = "WORKED"
	ActualStatusAbsent     = "ABSENT"
	ActualStatusSickDayOff = "SICK_DAY_OFF"
	ActualStatusTimeOff    = "TIME_OFF"
	ActualStatusReplaced   = "REPLACED"
	ActualStatusCancelled  = "CANCELLED"

	PlanningAvailabilityActive         = "ACTIVE"
	PlanningAvailabilityDayOff         = "DAY_OFF"
	PlanningAvailabilityLeaveOfAbsence = "LEAVE_OF_ABSENCE"
)

func ValidateCreateWorkPeriodAssignment(req CreateWorkPeriodAssignmentRequest) error {
	fields := map[string]string{}
	requireString(fields, "collaboratorId", req.CollaboratorID)
	requireString(fields, "plannedStatus", req.PlannedStatus)
	requireString(fields, "sectorId", req.SectorID)
	requireString(fields, "locationId", req.LocationID)
	requireString(fields, "taskId", req.TaskID)
	validatePlannedStatus(fields, req.PlannedStatus)
	validatePlanningAvailability(fields, "planningAvailability", req.PlanningAvailability)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateUpdateWorkPeriodAssignment(req UpdateWorkPeriodAssignmentRequest) error {
	fields := map[string]string{}
	requireString(fields, "collaboratorId", req.CollaboratorID)
	requireString(fields, "plannedStatus", req.PlannedStatus)
	requireString(fields, "sectorId", req.SectorID)
	requireString(fields, "locationId", req.LocationID)
	requireString(fields, "taskId", req.TaskID)
	validatePlannedStatus(fields, req.PlannedStatus)
	validatePlanningAvailability(fields, "planningAvailability", req.PlanningAvailability)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidatePlanAssignmentRefinement(req PlanAssignmentRefinementRequest) error {
	fields := map[string]string{}
	requireString(fields, "collaboratorId", req.CollaboratorID)
	requireString(fields, "sectorId", req.SectorID)
	requireString(fields, "locationId", req.LocationID)
	requireString(fields, "taskId", req.TaskID)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateBulkPlanWorkPeriodAssignments(req BulkPlanWorkPeriodAssignmentsRequest) error {
	fields := map[string]string{}
	seen := map[string]bool{}
	for index, row := range req.Rows {
		if strings.TrimSpace(row.CollaboratorID) == "" {
			fields[fmt.Sprintf("rows[%d].collaboratorId", index)] = "Required"
		} else if seen[strings.TrimSpace(row.CollaboratorID)] {
			fields[fmt.Sprintf("rows[%d].collaboratorId", index)] = "Collaborator can only appear once"
		}
		seen[strings.TrimSpace(row.CollaboratorID)] = true

		validatePlanningAvailability(fields, fmt.Sprintf("rows[%d].planningAvailability", index), row.PlanningAvailability)

		// Bulk planning can update availability on an already-planned selected row
		// without re-sending sector/location/task values. The service resolves
		// effective planning references from request values, an existing assignment,
		// or collaborator planning defaults before validating them.
	}
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateMarkActualOutcome(req MarkActualOutcomeRequest) error {
	fields := map[string]string{}
	requireString(fields, "actualStatus", req.ActualStatus)
	validateActualStatus(fields, req.ActualStatus)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateListFilter(filter WorkPeriodAssignmentListFilter) error {
	fields := map[string]string{}
	validatePlannedStatus(fields, filter.PlannedStatus)
	validateActualStatus(fields, filter.ActualStatus)
	if filter.Page < 0 {
		fields["page"] = "Page must be greater than zero"
	}
	if filter.PageSize < 0 {
		fields["pageSize"] = "Page size must be greater than zero"
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

func validatePlannedStatus(fields map[string]string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if !isKnownPlannedStatus(strings.ToUpper(trimmed)) {
		fields["plannedStatus"] = "Planned status must be INCLUDED or EXCLUDED"
	}
}

func validatePlanningAvailability(fields map[string]string, key string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if !isKnownPlanningAvailability(strings.ToUpper(trimmed)) {
		fields[key] = "Planning availability must be ACTIVE, DAY_OFF, or LEAVE_OF_ABSENCE"
	}
}

func validateActualStatus(fields map[string]string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if !isKnownActualStatus(strings.ToUpper(trimmed)) {
		fields["actualStatus"] = "Actual status must be WORKED, ABSENT, SICK_DAY_OFF, TIME_OFF, REPLACED, or CANCELLED"
	}
}

func isKnownPlannedStatus(status string) bool {
	switch status {
	case PlannedStatusIncluded, PlannedStatusExcluded:
		return true
	default:
		return false
	}
}

func isKnownPlanningAvailability(value string) bool {
	switch value {
	case PlanningAvailabilityActive, PlanningAvailabilityDayOff, PlanningAvailabilityLeaveOfAbsence:
		return true
	default:
		return false
	}
}

func normalizePlanningAvailability(value string) string {
	trimmed := strings.ToUpper(strings.TrimSpace(value))
	if isKnownPlanningAvailability(trimmed) {
		return trimmed
	}
	return PlanningAvailabilityActive
}

func isKnownActualStatus(status string) bool {
	switch status {
	case ActualStatusWorked, ActualStatusAbsent, ActualStatusSickDayOff, ActualStatusTimeOff, ActualStatusReplaced, ActualStatusCancelled:
		return true
	default:
		return false
	}
}
