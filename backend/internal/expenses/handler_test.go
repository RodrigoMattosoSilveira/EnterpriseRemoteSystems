package expenses_test

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

const (
	peopleURL        = "/api/v1/people/"
	collaboratorsURL = "/api/v1/collaborators/"
	expensesURL      = "/api/v1/expenses/"
)

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
		ID string `json:"id"`
	} `json:"data"`
}

type apiCollaboratorResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

type apiExpenseResponse struct {
	Data struct {
		ID                   string  `json:"id"`
		TenantID             string  `json:"tenantId"`
		CollaboratorID       string  `json:"collaboratorId"`
		CollaboratorLabel    string  `json:"collaboratorLabel"`
		ExpenseCategoryID    string  `json:"expenseCategoryId"`
		ExpenseCategoryLabel string  `json:"expenseCategoryLabel"`
		ValueUnitID          string  `json:"valueUnitId"`
		ValueUnitLabel       string  `json:"valueUnitLabel"`
		Amount               float64 `json:"amount"`
		ExpenseDate          string  `json:"expenseDate"`
		Description          string  `json:"description"`
	} `json:"data"`
}

type apiExpenseListResponse struct {
	Data struct {
		Items []struct {
			ID             string  `json:"id"`
			CollaboratorID string  `json:"collaboratorId"`
			Amount         float64 `json:"amount"`
		} `json:"items"`
		Total int `json:"total"`
	} `json:"data"`
}

func TestCreateExpenseReturnsCreated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)

	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, nil))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiExpenseResponse
	decodeJSON(t, res, &body)

	if body.Data.ID == "" {
		t.Fatal("expected expense id")
	}
	if body.Data.TenantID != "default" {
		t.Fatalf("expected tenantId default, got %q", body.Data.TenantID)
	}
	if body.Data.CollaboratorID != collaborator.Data.ID {
		t.Fatalf("expected collaborator id %q, got %q", collaborator.Data.ID, body.Data.CollaboratorID)
	}
	if body.Data.CollaboratorLabel != "P1" {
		t.Fatalf("expected collaborator label P1, got %q", body.Data.CollaboratorLabel)
	}
	if body.Data.ExpenseCategoryID != "ref-expense-category-canteen" {
		t.Fatalf("expected canteen category, got %q", body.Data.ExpenseCategoryID)
	}
	if body.Data.ExpenseCategoryLabel != "Canteen" {
		t.Fatalf("expected Canteen label, got %q", body.Data.ExpenseCategoryLabel)
	}
	if body.Data.ValueUnitID != "ref-value-unit-brl" {
		t.Fatalf("expected BRL value unit, got %q", body.Data.ValueUnitID)
	}
	if body.Data.ValueUnitLabel != "Brazilian Real" {
		t.Fatalf("expected Brazilian Real label, got %q", body.Data.ValueUnitLabel)
	}
	if body.Data.Amount != 42.5 {
		t.Fatalf("expected amount 42.5, got %f", body.Data.Amount)
	}
	if body.Data.ExpenseDate != "2026-06-03" {
		t.Fatalf("expected expense date 2026-06-03, got %q", body.Data.ExpenseDate)
	}
	if body.Data.Description != "Lunch at canteen" {
		t.Fatalf("expected description, got %q", body.Data.Description)
	}
}

func TestListAndGetExpenseReturnCreatedExpense(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := getJSON(t, server, expensesURL)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected list status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var listBody apiExpenseListResponse
	decodeJSON(t, res, &listBody)
	if listBody.Data.Total != 1 || len(listBody.Data.Items) != 1 {
		t.Fatalf("expected one expense, got total=%d len=%d", listBody.Data.Total, len(listBody.Data.Items))
	}
	if listBody.Data.Items[0].ID != expense.Data.ID {
		t.Fatalf("expected listed expense id %q, got %q", expense.Data.ID, listBody.Data.Items[0].ID)
	}

	res = getJSON(t, server, expensesURL+expense.Data.ID)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected get status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var getBody apiExpenseResponse
	decodeJSON(t, res, &getBody)
	if getBody.Data.ID != expense.Data.ID {
		t.Fatalf("expected expense id %q, got %q", expense.Data.ID, getBody.Data.ID)
	}
}

func TestCreateExpenseRejectsMissingRequiredFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postJSON(t, server, http.MethodPost, expensesURL, map[string]any{})
	defer res.Body.Close()

	assertValidationError(t, res, "collaboratorId", "Required")
}

func TestCreateExpenseRejectsInvalidAmount(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, map[string]any{"amount": 0}))
	defer res.Body.Close()

	assertValidationError(t, res, "amount", "Amount must be greater than zero")
}

func TestCreateExpenseRejectsMissingCollaborator(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload("missing-collaborator", nil))
	defer res.Body.Close()

	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, res.StatusCode)
	}
}

func TestCreateExpenseRejectsInactiveCollaborator(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createFinishedCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, nil))
	defer res.Body.Close()

	assertValidationError(t, res, "collaboratorId", "Collaborator must be active")
}

func TestCreateExpenseRejectsInvalidExpenseCategory(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, map[string]any{"expenseCategoryId": "ref-not-real"}))
	defer res.Body.Close()

	assertValidationError(t, res, "expenseCategoryId", "Expense category must be active reference data of type expense_category")
}

func TestCreateExpenseRejectsInactiveExpenseCategory(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPatch, "/api/v1/reference-data/expense_category/ref-expense-category-canteen/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate category status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, nil))
	defer res.Body.Close()

	assertValidationError(t, res, "expenseCategoryId", "Expense category must be active reference data of type expense_category")
}

func TestCreateExpenseRejectsInvalidValueUnit(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, map[string]any{"valueUnitId": "ref-not-real"}))
	defer res.Body.Close()

	assertValidationError(t, res, "valueUnitId", "Value unit must be active reference data of type value_unit")
}

func newTestServer(t *testing.T) (*fiber.App, func()) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := apppkg.Bootstrap(apppkg.Config{
		Env:       "test",
		HTTPAddr:  ":0",
		DBPath:    dbPath,
		JWTSecret: "test-secret",
	})
	if err != nil {
		t.Fatalf("bootstrap test server: %v", err)
	}

	return server, cleanup
}

func createActiveCollaborator(t *testing.T, server *fiber.App, seq int) apiCollaboratorResponse {
	t.Helper()
	person := createPerson(t, server, validCompletePersonPayload(seq, nil))
	return createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))
}

func createFinishedCollaborator(t *testing.T, server *fiber.App, seq int) apiCollaboratorResponse {
	t.Helper()
	person := createPerson(t, server, validCompletePersonPayload(seq, nil))
	return createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{"statusId": "ref-collaborator-status-finished"}))
}

func createPerson(t *testing.T, server *fiber.App, payload map[string]any) apiPersonResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, peopleURL, payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create person status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiPersonResponse
	decodeJSON(t, res, &body)
	return body
}

func createCollaborator(t *testing.T, server *fiber.App, payload map[string]any) apiCollaboratorResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, collaboratorsURL, payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create collaborator status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)
	return body
}

func createExpense(t *testing.T, server *fiber.App, payload map[string]any) apiExpenseResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, expensesURL, payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create expense status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiExpenseResponse
	decodeJSON(t, res, &body)
	return body
}

func postJSON(t *testing.T, server *fiber.App, method string, url string, payload map[string]any) *http.Response {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(method, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	return res
}

func getJSON(t *testing.T, server *fiber.App, url string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, url, nil)
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	return res
}

func validExpensePayload(collaboratorID string, overrides map[string]any) map[string]any {
	payload := map[string]any{
		"collaboratorId":    collaboratorID,
		"expenseCategoryId": "ref-expense-category-canteen",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            42.5,
		"expenseDate":       "2026-06-03",
		"description":       "Lunch at canteen",
	}
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
}

func validCollaboratorPayload(personID string, overrides map[string]any) map[string]any {
	payload := map[string]any{
		"personId":         personID,
		"journeyStartDate": "2026-06-01",
		"paymentMethodId":  "ref-method-daily",
		"paymentValue":     150.0,
		"sectorId":         "ref-sector-mining",
		"locationId":       "ref-location-main-mine",
		"taskId":           "ref-task-miner",
		"statusId":         "ref-collaborator-status-active",
		"notes":            "First collaborator journey",
	}
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
}

func validCompletePersonPayload(seq int, overrides map[string]any) map[string]any {
	payload := map[string]any{
		"firstName":         fmt.Sprintf("Person%d", seq),
		"lastName":          "Silva",
		"nickname":          fmt.Sprintf("P%d", seq),
		"cpf":               cpfForSeq(seq),
		"rg":                fmt.Sprintf("RG-%06d", seq),
		"cellular":          cellularForSeq(seq),
		"email":             fmt.Sprintf("person%d@example.com", seq),
		"country":           "Brasil",
		"statusId":          "ref-person-status-active",
		"street1":           "Rua Completa 123",
		"street2":           "Apto 5",
		"city":              "Sao Paulo",
		"state":             "SP",
		"cep":               "01001000",
		"bankName":          "Banco Teste",
		"bankNumber":        "001",
		"checkingAccount":   "12345-6",
		"pixKey":            fmt.Sprintf("person%d-pix@example.com", seq),
		"emergencyName":     "Emergency Contact",
		"emergencyCellular": "11912345678",
		"emergencyEmail":    fmt.Sprintf("emergency%d@example.com", seq),
	}
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
}

func cpfForSeq(seq int) string {
	cpfs := []string{"39053344705", "93541134780", "35711002844", "12345678909"}
	return cpfs[(seq-1)%len(cpfs)]
}

func cellularForSeq(seq int) string {
	return fmt.Sprintf("11%d%08d", 9, 98765000+seq)
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
		t.Fatalf("decode response body: %v", err)
	}
}
