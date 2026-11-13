package workperiodassignments

import (
	"fmt"
	"strings"

	"enterpriseremotesystems/backend/internal/shared/fielderrors"
)

type ValidationError struct {
	Fields map[string]string
	Codes  map[string]string
}

func (e ValidationError) Error() string                           { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string     { return e.Fields }
func (e ValidationError) ValidationFieldCodes() map[string]string { return e.Codes }

// Stable rule codes returned as `fieldCodes` (shared ones live in
// internal/shared/fielderrors). Renaming one is an API change.
const (
	RuleAssignmentNotIncluded            = "assignment_not_included"
	RuleCollaboratorAlreadyAssigned      = "collaborator_already_assigned"
	RuleCollaboratorNotActive            = "collaborator_not_active"
	RuleDuplicateCollaborator            = "duplicate_collaborator"
	RuleInactiveAssignmentNotEditable    = "inactive_assignment_not_editable"
	RuleInactiveReference                = "inactive_reference"
	RuleInvalidActualStatus              = "invalid_actual_status"
	RuleInvalidPlannedStatus             = "invalid_planned_status"
	RuleInvalidPlanningAvailability      = "invalid_planning_availability"
	RuleReplacementNotInPlan             = "replacement_not_in_plan"
	RuleReplacementNotSelected           = "replacement_not_selected"
	RuleReplacementOtherWorkPeriod       = "replacement_other_work_period"
	RuleReplacementSelf                  = "replacement_self"
	RuleReplacementTargetAlreadyReplaced = "replacement_target_already_replaced"
	RuleReplacementTargetAvailable       = "replacement_target_available"
	RuleReplacementTargetIsReplacement   = "replacement_target_is_replacement"
	RuleReplacementTargetNotInPlan       = "replacement_target_not_in_plan"
	RuleReplacementUnavailable           = "replacement_unavailable"
	RuleWorkPeriodClosed                 = "work_period_closed"
)

func fieldError(field string, rule string, message string) ValidationError {
	fields, codes := fielderrors.Single(field, rule, message)
	return ValidationError{Fields: fields, Codes: codes}
}

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
	errs := fielderrors.New()
	errs.Require("collaboratorId", req.CollaboratorID)
	errs.Require("plannedStatus", req.PlannedStatus)
	errs.Require("sectorId", req.SectorID)
	errs.Require("locationId", req.LocationID)
	errs.Require("taskId", req.TaskID)
	validatePlannedStatus(errs, req.PlannedStatus)
	validatePlanningAvailability(errs, "planningAvailability", req.PlanningAvailability)
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateUpdateWorkPeriodAssignment(req UpdateWorkPeriodAssignmentRequest) error {
	errs := fielderrors.New()
	errs.Require("collaboratorId", req.CollaboratorID)
	errs.Require("plannedStatus", req.PlannedStatus)
	errs.Require("sectorId", req.SectorID)
	errs.Require("locationId", req.LocationID)
	errs.Require("taskId", req.TaskID)
	validatePlannedStatus(errs, req.PlannedStatus)
	validatePlanningAvailability(errs, "planningAvailability", req.PlanningAvailability)
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidatePlanAssignmentRefinement(req PlanAssignmentRefinementRequest) error {
	errs := fielderrors.New()
	errs.Require("collaboratorId", req.CollaboratorID)
	errs.Require("sectorId", req.SectorID)
	errs.Require("locationId", req.LocationID)
	errs.Require("taskId", req.TaskID)
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateBulkPlanWorkPeriodAssignments(req BulkPlanWorkPeriodAssignmentsRequest) error {
	errs := fielderrors.New()
	seen := map[string]bool{}
	for index, row := range req.Rows {
		if strings.TrimSpace(row.CollaboratorID) == "" {
			errs.Add(fmt.Sprintf("rows[%d].collaboratorId", index), fielderrors.Required, "Required")
		} else if seen[strings.TrimSpace(row.CollaboratorID)] {
			errs.Add(fmt.Sprintf("rows[%d].collaboratorId", index), RuleDuplicateCollaborator, "Collaborator can only appear once")
		}
		seen[strings.TrimSpace(row.CollaboratorID)] = true

		validatePlanningAvailability(errs, fmt.Sprintf("rows[%d].planningAvailability", index), row.PlanningAvailability)

		// Bulk planning can update availability on an already-planned selected row
		// without re-sending sector/location/task values. The service resolves
		// effective planning references from request values, an existing assignment,
		// or collaborator planning defaults before validating them.
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateMarkActualOutcome(req MarkActualOutcomeRequest) error {
	errs := fielderrors.New()
	errs.Require("actualStatus", req.ActualStatus)
	validateActualStatus(errs, req.ActualStatus)
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateListFilter(filter WorkPeriodAssignmentListFilter) error {
	errs := fielderrors.New()
	validatePlannedStatus(errs, filter.PlannedStatus)
	validateActualStatus(errs, filter.ActualStatus)
	if filter.Page < 0 {
		errs.Add("page", fielderrors.MustBePositive, "Page must be greater than zero")
	}
	if filter.PageSize < 0 {
		errs.Add("pageSize", fielderrors.MustBePositive, "Page size must be greater than zero")
	}
	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func validatePlannedStatus(errs *fielderrors.Collector, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if !isKnownPlannedStatus(strings.ToUpper(trimmed)) {
		errs.Add("plannedStatus", RuleInvalidPlannedStatus, "Planned status must be INCLUDED or EXCLUDED")
	}
}

func validatePlanningAvailability(errs *fielderrors.Collector, key string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if !isKnownPlanningAvailability(strings.ToUpper(trimmed)) {
		errs.Add(key, RuleInvalidPlanningAvailability, "Planning availability must be ACTIVE, DAY_OFF, or LEAVE_OF_ABSENCE")
	}
}

func validateActualStatus(errs *fielderrors.Collector, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if !isKnownActualStatus(strings.ToUpper(trimmed)) {
		errs.Add("actualStatus", RuleInvalidActualStatus, "Actual status must be WORKED, ABSENT, SICK_DAY_OFF, TIME_OFF, REPLACED, or CANCELLED")
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
