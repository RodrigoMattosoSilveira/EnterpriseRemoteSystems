package http

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	"enterpriseremotesystems/backend/internal/people"
)

type APIError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

type APIResponse struct {
	Data  any       `json:"data,omitempty"`
	Error *APIError `json:"error,omitempty"`
}

func WriteError(c fiber.Ctx, err error) error {
	if err == nil {
		return nil
	}

	// Validation errors
	if validationErr, ok := people.IsValidationError(err); ok {
		return c.Status(fiber.StatusBadRequest).JSON(APIResponse{
			Error: &APIError{
				Code:    "validation_failed",
				Message: "Validation failed",
				Fields:  validationErr.Fields,
			},
		})
	}

	// Not found
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(APIResponse{
			Error: &APIError{
				Code:    "not_found",
				Message: "Record not found",
			},
		})
	}

	// Default
	return c.Status(fiber.StatusInternalServerError).JSON(APIResponse{
		Error: &APIError{
			Code:    "internal_error",
			Message: "Unexpected server error",
		},
	})
}