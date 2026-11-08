package workperiods

import (
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
	RuleEndBeforeStart        = "end_before_start"
	RuleInvalidTime           = "invalid_time"
	RuleUnknownStatus         = "unknown_status"
	RuleWorkPeriodExists      = "work_period_exists"
	RuleWorkPeriodNotPlanning = "work_period_not_planning"
)

func fieldError(field string, rule string, message string) ValidationError {
	fields, codes := fielderrors.Single(field, rule, message)
	return ValidationError{Fields: fields, Codes: codes}
}

const (
	StatusPlanning        = "PLANNING"
	StatusInformed        = "INFORMED"
	StatusAccrualOpen     = "ACCRUAL_OPEN"
	StatusPartiallyPosted = "PARTIALLY_POSTED"
	StatusFullyPosted     = "FULLY_POSTED"
	StatusClosed          = "CLOSED"
)

func ValidateCreateWorkPeriod(req CreateWorkPeriodRequest) error {
	errs := fielderrors.New()
	errs.Require("workDate", req.WorkDate)
	errs.Require("periodCode", req.PeriodCode)
	errs.Require("name", req.Name)
	errs.Require("startsAt", req.StartsAt)
	errs.Require("endsAt", req.EndsAt)

	if strings.TrimSpace(req.WorkDate) != "" {
		if _, err := parseDate(req.WorkDate); err != nil {
			errs.Add("workDate", fielderrors.InvalidDate, "Work date must be YYYY-MM-DD")
		}
	}

	startsAt, startsAtErr := parseTimestamp(req.StartsAt)
	endsAt, endsAtErr := parseTimestamp(req.EndsAt)
	if strings.TrimSpace(req.StartsAt) != "" && startsAtErr != nil {
		errs.Add("startsAt", RuleInvalidTime, "Start time must be RFC3339")
	}
	if strings.TrimSpace(req.EndsAt) != "" && endsAtErr != nil {
		errs.Add("endsAt", RuleInvalidTime, "End time must be RFC3339")
	}
	if strings.TrimSpace(req.StartsAt) != "" && strings.TrimSpace(req.EndsAt) != "" && startsAtErr == nil && endsAtErr == nil && !startsAt.Before(endsAt) {
		errs.Add("endsAt", RuleEndBeforeStart, "End time must be after start time")
	}

	if !errs.Empty() {
		return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
	}
	return nil
}

func ValidateListFilter(filter WorkPeriodListFilter) error {
	errs := fielderrors.New()
	if strings.TrimSpace(filter.DateFrom) != "" {
		if _, err := parseDate(filter.DateFrom); err != nil {
			errs.Add("dateFrom", fielderrors.InvalidDate, "Date from must be YYYY-MM-DD")
		}
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		if _, err := parseDate(filter.DateTo); err != nil {
			errs.Add("dateTo", fielderrors.InvalidDate, "Date to must be YYYY-MM-DD")
		}
	}
	if strings.TrimSpace(filter.Status) != "" && !isKnownStatus(strings.ToUpper(strings.TrimSpace(filter.Status))) {
		errs.Add("status", RuleUnknownStatus, "Unknown work period status")
	}
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

func isKnownStatus(status string) bool {
	switch status {
	case StatusPlanning, StatusInformed, StatusAccrualOpen, StatusPartiallyPosted, StatusFullyPosted, StatusClosed:
		return true
	default:
		return false
	}
}
