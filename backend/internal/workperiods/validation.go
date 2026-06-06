package workperiods

import "strings"

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

const (
	StatusPlanning        = "PLANNING"
	StatusInformed        = "INFORMED"
	StatusAccrualOpen     = "ACCRUAL_OPEN"
	StatusPartiallyPosted = "PARTIALLY_POSTED"
	StatusFullyPosted     = "FULLY_POSTED"
	StatusClosed          = "CLOSED"
)

func ValidateCreateWorkPeriod(req CreateWorkPeriodRequest) error {
	fields := map[string]string{}
	requireString(fields, "workDate", req.WorkDate)
	requireString(fields, "periodCode", req.PeriodCode)
	requireString(fields, "name", req.Name)
	requireString(fields, "startsAt", req.StartsAt)
	requireString(fields, "endsAt", req.EndsAt)

	if strings.TrimSpace(req.WorkDate) != "" {
		if _, err := parseDate(req.WorkDate); err != nil {
			fields["workDate"] = "Work date must be YYYY-MM-DD"
		}
	}

	startsAt, startsAtErr := parseTimestamp(req.StartsAt)
	endsAt, endsAtErr := parseTimestamp(req.EndsAt)
	if strings.TrimSpace(req.StartsAt) != "" && startsAtErr != nil {
		fields["startsAt"] = "Start time must be RFC3339"
	}
	if strings.TrimSpace(req.EndsAt) != "" && endsAtErr != nil {
		fields["endsAt"] = "End time must be RFC3339"
	}
	if strings.TrimSpace(req.StartsAt) != "" && strings.TrimSpace(req.EndsAt) != "" && startsAtErr == nil && endsAtErr == nil && !startsAt.Before(endsAt) {
		fields["endsAt"] = "End time must be after start time"
	}

	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func ValidateListFilter(filter WorkPeriodListFilter) error {
	fields := map[string]string{}
	if strings.TrimSpace(filter.DateFrom) != "" {
		if _, err := parseDate(filter.DateFrom); err != nil {
			fields["dateFrom"] = "Date from must be YYYY-MM-DD"
		}
	}
	if strings.TrimSpace(filter.DateTo) != "" {
		if _, err := parseDate(filter.DateTo); err != nil {
			fields["dateTo"] = "Date to must be YYYY-MM-DD"
		}
	}
	if strings.TrimSpace(filter.Status) != "" && !isKnownStatus(strings.ToUpper(strings.TrimSpace(filter.Status))) {
		fields["status"] = "Unknown work period status"
	}
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

func isKnownStatus(status string) bool {
	switch status {
	case StatusPlanning, StatusInformed, StatusAccrualOpen, StatusPartiallyPosted, StatusFullyPosted, StatusClosed:
		return true
	default:
		return false
	}
}
