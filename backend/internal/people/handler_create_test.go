package people_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v3"

	apppkg "enterpriseremotesystems/backend/internal/app"
)

const peopleCreateURL = "/api/v1/people/"

type apiErrorResponse struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
}

type apiPersonResponse struct {
	Data struct {
		ID       string `json:"id"`
		TenantID string `json:"tenantId"`
		CPF      string `json:"cpf"`
		RG       string `json:"rg"`
		Cellular string `json:"cellular"`
		Email    string `json:"email"`
		StatusID string `json:"statusId"`
	} `json:"data"`
}

func TestCreatePersonReturnsCreated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postPerson(t, server, validPersonPayload(1, nil))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, res.StatusCode)
	}

	var body apiPersonResponse
	decodeJSON(t, res, &body)

	if body.Data.ID == "" {
		t.Fatal("expected created person id")
	}
	if body.Data.TenantID != "default" {
		t.Fatalf("expected tenantId default, got %q", body.Data.TenantID)
	}
	if body.Data.StatusID != "ref-person-status-active" {
		t.Fatalf("expected active status id, got %q", body.Data.StatusID)
	}
}

func TestCreatePersonRejectsMissingStatusID(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	payload := validPersonPayload(1, map[string]any{
		"statusId": "",
	})

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "statusId", "Required")
}

func TestCreatePersonRejectsInvalidStatusID(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	payload := validPersonPayload(1, map[string]any{
		"statusId": "ref-person-status-not-real",
	})

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "statusId", "Status must be an active person status")
}

func TestCreatePersonRejectsInvalidRG(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	payload := validPersonPayload(1, map[string]any{
		"rg": "12",
	})

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "rg", "RG is invalid")
}

func TestCreatePersonRejectsInvalidCellular(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	payload := validPersonPayload(1, map[string]any{
		"cellular": "1133334444",
	})

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "cellular", "Cellular must be a valid Brazilian mobile number")
}

func TestCreatePersonAcceptsFormattedBrazilianCellular(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postPerson(t, server, validPersonPayload(1, map[string]any{
		"cellular": "(11) 98765-4321",
	}))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiPersonResponse
	decodeJSON(t, res, &body)

	if body.Data.Cellular != "11987654321" {
		t.Fatalf("expected normalized Brazilian cellular %q, got %q", "11987654321", body.Data.Cellular)
	}
}

func TestCreatePersonRejectsDuplicateCPF(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(2, map[string]any{
		"cpf": "39053344705",
	})

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "cpf", "CPF already exists")
}

func TestCreatePersonRejectsDuplicateRG(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(2, map[string]any{
		"rg": "RG-000001",
	})

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "rg", "RG already exists")
}

func TestCreatePersonRejectsDuplicateCellular(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(2, map[string]any{
		"cellular": "11998765432",
	})

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "cellular", "Cellular already exists")
}

func TestCreatePersonRejectsDuplicateEmail(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	createPerson(t, server, validPersonPayload(1, nil))

	payload := validPersonPayload(2, map[string]any{
		"email": "person1@example.com",
	})

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	assertValidationError(t, res, "email", "Email already exists")
}

func newTestServer(t *testing.T) (*fiber.App, func()) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := apppkg.Bootstrap(apppkg.Config{
		Env:                       "test",
		HTTPAddr:                  ":0",
		DBPath:                    dbPath,
		JWTSecret:                 "test-secret",
		DisableRouteAuthorization: true,
	})
	if err != nil {
		t.Fatalf("bootstrap test server: %v", err)
	}

	return server, cleanup
}

func createPerson(t *testing.T, server *fiber.App, payload map[string]any) apiPersonResponse {
	t.Helper()

	res := postPerson(t, server, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiPersonResponse
	decodeJSON(t, res, &body)
	return body
}

func postPerson(t *testing.T, server *fiber.App, payload map[string]any) *http.Response {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, peopleCreateURL, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("post person: %v", err)
	}

	return res
}

func assertValidationError(t *testing.T, res *http.Response, field string, message string) {
	t.Helper()

	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}

	var body apiErrorResponse
	decodeJSON(t, res, &body)

	if body.Error == nil {
		t.Fatal("expected error response")
	}
	if body.Error.Code != "validation_failed" {
		t.Fatalf("expected error code validation_failed, got %q", body.Error.Code)
	}
	if body.Error.Fields[field] != message {
		t.Fatalf("expected field %q to be %q, got %q", field, message, body.Error.Fields[field])
	}
}

func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()

	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response JSON: %v", err)
	}
}

func validPersonPayload(n int, overrides map[string]any) map[string]any {
	cpfs := []string{
		"39053344705",
		"93541134780",
		"52998224725",
		"15350946056",
		"11144477735",
	}

	payload := map[string]any{
		"firstName": fmt.Sprintf("Test%d", n),
		"lastName":  "Person",
		"nickname":  fmt.Sprintf("TP%d", n),
		"cpf":       cpfs[(n-1)%len(cpfs)],
		"rg":        fmt.Sprintf("RG-%06d", n),
		"cellular":  fmt.Sprintf("%02d998765432", 10+n),
		"email":     fmt.Sprintf("person%d@example.com", n),
		"statusId":  "ref-person-status-active",
	}

	for key, value := range overrides {
		payload[key] = value
	}

	return payload
}

func TestCreatePersonAcceptsValidRG(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postPerson(t, server, validPersonPayload(1, map[string]any{
		"rg": "12.345.678-9",
	}))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiPersonResponse
	decodeJSON(t, res, &body)

	if body.Data.RG == "" {
		t.Fatal("expected RG to be returned")
	}
}
