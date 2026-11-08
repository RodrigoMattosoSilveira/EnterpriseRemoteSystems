package collaborators

import (
	"strings"

	"enterpriseremotesystems/backend/internal/shared/fielderrors"
)

const (
	PlanningAvailabilityActive         = "ACTIVE"
	PlanningAvailabilityDayOff         = "DAY_OFF"
	PlanningAvailabilityLeaveOfAbsence = "LEAVE_OF_ABSENCE"
)

// ValidationError carries English field messages plus a stable rule code per
// field (Codes), which clients translate. See internal/shared/fielderrors.
type ValidationError struct {
	Fields map[string]string
	Codes  map[string]string
}

func (e ValidationError) Error() string                           { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string     { return e.Fields }
func (e ValidationError) ValidationFieldCodes() map[string]string { return e.Codes }

// Stable Collaborator rule codes returned as `fieldCodes` (shared ones live in
// fielderrors). Renaming one is an API change.
const (
	RuleInvalidPlanningAvailability = "invalid_planning_availability"
	RuleMembershipNotActive         = "membership_not_active"
	RulePersonProfileIncomplete     = "person_profile_incomplete"
	RuleJourneyAlreadyOpen          = "journey_already_open"
	RuleJourneyClosed               = "journey_closed"
	RuleExtensionPending            = "extension_already_pending"
	RuleExtensionNotPending         = "extension_not_pending"
	RuleInactiveReference           = "inactive_reference"
	RuleAmountRequiredForMethod     = "amount_required_for_payment_method"
	RuleTooManyDecimals             = "too_many_decimals"
	RulePercentOutOfRange           = "percent_out_of_range"
	RuleInvalidPaymentMethod        = "invalid_payment_method"
	RuleInvalidValueUnit            = "invalid_value_unit"
	RuleBonusDateOutOfRange         = "bonus_date_out_of_range"
	RuleBonusNotPending             = "bonus_not_pending"
	RuleDifferentApproverRequired   = "different_approver_required"
)

func validationError(errs *fielderrors.Collector) error {
	if errs.Empty() {
		return nil
	}
	return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
}

func fieldError(field string, rule string, message string) ValidationError {
	fields, codes := fielderrors.Single(field, rule, message)
	return ValidationError{Fields: fields, Codes: codes}
}

func ValidateCreateCollaborator(req CreateCollaboratorRequest) error {
	errs := fielderrors.New()
	errs.Require("membershipId", req.MembershipID)
	errs.Require("journeyStartDate", req.JourneyStartDate)
	errs.Require("paymentMethodId", req.PaymentMethodID)
	errs.Require("sectorId", req.SectorID)
	errs.Require("locationId", req.LocationID)
	errs.Require("taskId", req.TaskID)
	errs.Require("statusId", req.StatusID)

	if strings.TrimSpace(req.JourneyStartDate) != "" {
		if _, err := parseDate(req.JourneyStartDate); err != nil {
			errs.Add("journeyStartDate", fielderrors.InvalidDate, "Journey start date must be YYYY-MM-DD")
		}
	}
	validatePlanningAvailability(errs, req.PlanningAvailability)

	return validationError(errs)
}

func ValidateUpdateCollaborator(req UpdateCollaboratorRequest) error {
	errs := fielderrors.New()
	errs.Require("paymentMethodId", req.PaymentMethodID)
	errs.Require("sectorId", req.SectorID)
	errs.Require("locationId", req.LocationID)
	errs.Require("taskId", req.TaskID)

	validatePlanningAvailability(errs, req.PlanningAvailability)

	return validationError(errs)
}

func ValidateUpdateCollaboratorWorkAssignment(req UpdateCollaboratorWorkAssignmentRequest) error {
	errs := fielderrors.New()
	errs.Require("sectorId", req.SectorID)
	errs.Require("locationId", req.LocationID)
	errs.Require("taskId", req.TaskID)
	return validationError(errs)
}

func ValidateExtendCollaboratorJourney(req ExtendCollaboratorJourneyRequest) error {
	errs := fielderrors.New()
	if req.AdditionalDays <= 0 {
		errs.Add("additionalDays", fielderrors.MustBePositive, "Additional days must be greater than zero")
	}
	if strings.TrimSpace(req.Reason) == "" {
		errs.Add("reason", fielderrors.Required, "Reason is required")
	}
	return validationError(errs)
}

func validatePlanningAvailability(errs *fielderrors.Collector, value string) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return
	}
	if !isKnownPlanningAvailability(strings.ToUpper(trimmed)) {
		errs.Add("planningAvailability", RuleInvalidPlanningAvailability, "Planning availability must be ACTIVE, DAY_OFF, or LEAVE_OF_ABSENCE")
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
