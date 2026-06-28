package collaborators

import "strings"

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string                       { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string { return e.Fields }

func ValidateCreateCollaborator(req CreateCollaboratorRequest) error {
	fields := map[string]string{}
	requireString(fields, "personId", req.PersonID)
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
