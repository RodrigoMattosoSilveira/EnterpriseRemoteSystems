package collaborators

import "strings"

const (
	PlanningAvailabilityActive         = "ACTIVE"
	PlanningAvailabilityDayOff         = "DAY_OFF"
	PlanningAvailabilityLeaveOfAbsence = "LEAVE_OF_ABSENCE"
)

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

func ValidateCreateCollaborator(req CreateCollaboratorRequest) error {
	fields := map[string]string{}
	if strings.TrimSpace(req.MembershipID) == "" && strings.TrimSpace(req.PersonID) == "" {
		fields["membershipId"] = "Required"
	}
	requireString(fields, "journeyStartDate", req.JourneyStartDate)
	requireString(fields, "paymentMethodId", req.PaymentMethodID)
	requireString(fields, "sectorId", req.SectorID)
	requireString(fields, "locationId", req.LocationID)
	requireString(fields, "taskId", req.TaskID)
	requireString(fields, "statusId", req.StatusID)

	if strings.TrimSpace(req.JourneyStartDate) != "" {
		if _, err := parseDate(req.JourneyStartDate); err != nil {
			fields["journeyStartDate"] = "Journey start date must be YYYY-MM-DD"
		}
	}
	validatePlanningAvailability(fields, req.PlanningAvailability)

	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}

	return nil
}

func ValidateUpdateCollaborator(req UpdateCollaboratorRequest) error {
	fields := map[string]string{}
	requireString(fields, "paymentMethodId", req.PaymentMethodID)
	requireString(fields, "sectorId", req.SectorID)
	requireString(fields, "locationId", req.LocationID)
	requireString(fields, "taskId", req.TaskID)

	if req.ExtensionDays < 0 {
		fields["extensionDays"] = "Extension days must be zero or greater"
	}
	validatePlanningAvailability(fields, req.PlanningAvailability)

	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}

	return nil
}

func ValidateUpdateCollaboratorWorkAssignment(req UpdateCollaboratorWorkAssignmentRequest) error {
	fields := map[string]string{}
	requireString(fields, "sectorId", req.SectorID)
	requireString(fields, "locationId", req.LocationID)
	requireString(fields, "taskId", req.TaskID)

	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateExtendCollaboratorJourney(req ExtendCollaboratorJourneyRequest) error {
	if req.AdditionalDays <= 0 {
		return ValidationError{Fields: map[string]string{
			"additionalDays": "Additional days must be greater than zero",
		}}
	}
	return nil
}

func requireString(fields map[string]string, key string, value string) {
	if strings.TrimSpace(value) == "" {
		fields[key] = "Required"
	}
}

func validatePlanningAvailability(fields map[string]string, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if !isKnownPlanningAvailability(strings.ToUpper(trimmed)) {
		fields["planningAvailability"] = "Planning availability must be ACTIVE, DAY_OFF, or LEAVE_OF_ABSENCE"
	}
}

func normalizePlanningAvailability(value string) string {
	trimmed := strings.ToUpper(strings.TrimSpace(value))
	if isKnownPlanningAvailability(trimmed) {
		return trimmed
	}
	return PlanningAvailabilityActive
}

func isKnownPlanningAvailability(value string) bool {
	switch value {
	case PlanningAvailabilityActive, PlanningAvailabilityDayOff, PlanningAvailabilityLeaveOfAbsence:
		return true
	default:
		return false
	}
}
