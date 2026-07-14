package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
)

type stubValidationError struct {
	fields map[string]string
}

func (e stubValidationError) Error() string {
	return "invalid"
}

func (e stubValidationError) ValidationFields() map[string]string {
	return e.fields
}

func TestWriteErrorReturnsLocalizedMessageKeyForValidationErrors(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		return WriteError(c, stubValidationError{fields: map[string]string{"email": "errors.validation.required"}})
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Accept-Language", "pt-BR")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("expected no test error, got %v", err)
	}

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, resp.StatusCode)
	}

	var payload struct {
		Error struct {
			Code       string            `json:"code"`
			Message    string            `json:"message"`
			MessageKey string            `json:"messageKey"`
			Fields     map[string]string `json:"fields"`
		} `json:"error"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("expected valid json response, got %v", err)
	}

	if payload.Error.Code != "validation_failed" {
		t.Fatalf("expected validation_failed code, got %q", payload.Error.Code)
	}

	if payload.Error.MessageKey != "errors.validation.failed" {
		t.Fatalf("expected messageKey errors.validation.failed, got %q", payload.Error.MessageKey)
	}

	if payload.Error.Message != "Falha de validação" {
		t.Fatalf("expected localized message, got %q", payload.Error.Message)
	}
}
