package httpx

import (
	"errors"
	"log"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
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

type FieldValidationError interface {
	error
	ValidationFields() map[string]string
}

func WriteError(c fiber.Ctx, err error) error {
	if err == nil {
		return nil
	}

	var validationErr FieldValidationError
	if errors.As(err, &validationErr) {
		return c.Status(fiber.StatusBadRequest).JSON(APIResponse{
			Error: &APIError{
				Code:    "validation_failed",
				Message: "Validation failed",
				Fields:  validationErr.ValidationFields(),
			},
		})
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(APIResponse{
			Error: &APIError{
				Code:    "not_found",
				Message: "Record not found",
			},
		})
	}

	log.Printf("internal API error: %v", err)

	return c.Status(fiber.StatusInternalServerError).JSON(APIResponse{
		Error: &APIError{
			Code:    "internal_error",
			Message: "Unexpected server error",
		},
	})
}
