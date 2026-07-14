package httpx

import (
	"errors"
	"log"
	"strings"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type APIError struct {
	Code       string            `json:"code"`
	Message    string            `json:"message"`
	MessageKey string            `json:"messageKey,omitempty"`
	Fields     map[string]string `json:"fields,omitempty"`
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

	locale := resolveLocale(c)

	var validationErr FieldValidationError
	if errors.As(err, &validationErr) {
		localizedFields := map[string]string{}
		for field, messageKey := range validationErr.ValidationFields() {
			localizedFields[field] = translateMessage(locale, messageKey)
		}

		return c.Status(fiber.StatusBadRequest).JSON(APIResponse{
			Error: &APIError{
				Code:       "validation_failed",
				Message:    translateMessage(locale, "errors.validation.failed"),
				MessageKey: "errors.validation.failed",
				Fields:     localizedFields,
			},
		})
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(APIResponse{
			Error: &APIError{
				Code:       "not_found",
				Message:    translateMessage(locale, "errors.not_found"),
				MessageKey: "errors.not_found",
			},
		})
	}

	log.Printf("internal API error: %v", err)

	return c.Status(fiber.StatusInternalServerError).JSON(APIResponse{
		Error: &APIError{
			Code:       "internal_error",
			Message:    translateMessage(locale, "errors.internal"),
			MessageKey: "errors.internal",
		},
	})
}

func resolveLocale(c fiber.Ctx) string {
	if header := c.Get("Accept-Language"); header != "" {
		return strings.Split(header, ",")[0]
	}

	return "en"
}

func translateMessage(locale string, key string) string {
	messages := map[string]map[string]string{
		"en": {
			"errors.validation.failed":      "Validation failed",
			"errors.not_found":              "Record not found",
			"errors.internal":               "Unexpected server error",
			"errors.validation.required":    "Required",
			"errors.people.status_inactive": "The person status is inactive",
		},
		"pt-BR": {
			"errors.validation.failed":      "Falha de validação",
			"errors.not_found":              "Registro não encontrado",
			"errors.internal":               "Erro inesperado do servidor",
			"errors.validation.required":    "Obrigatório",
			"errors.people.status_inactive": "O status da pessoa está inativo",
		},
	}

	if locale == "pt-BR" {
		if msg, ok := messages[locale][key]; ok {
			return msg
		}
	}

	if msg, ok := messages["en"][key]; ok {
		return msg
	}

	return key
}
