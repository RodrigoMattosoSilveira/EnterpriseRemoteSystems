package currentaccounts_test

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
	peopleURL          = "/api/v1/people/"
	collaboratorsURL   = "/api/v1/collaborators/"
	expensesURL        = "/api/v1/expenses/"
	currentAccountsURL = "/api/v1/current-accounts/"
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
		ID             string  `json:"id"`
		CollaboratorID string  `json:"collaboratorId"`
		ValueUnitID    string  `json:"valueUnitId"`
		Amount         float64 `json:"amount"`
		ExpenseDate    string  `json:"expenseDate"`
		Active         bool    `json:"active"`
	} `json:"data"`
}

type apiLedgerEntryListResponse struct {
	Data struct {
		Items []struct {
			ID                string  `json:"id"`
			CollaboratorID    string  `json:"collaboratorId"`
			CollaboratorLabel string  `json:"collaboratorLabel"`
			ValueUnitID       string  `json:"valueUnitId"`
			ValueUnitCode     string  `json:"valueUnitCode"`
			EntryType         string  `json:"entryType"`
			Direction         string  `json:"direction"`
			Amount            float64 `json:"amount"`
			SignedAmount      float64 `json:"signedAmount"`
			EffectiveDate     string  `json:"effectiveDate"`
			SourceType        string  `json:"sourceType"`
			SourceID          string  `json:"sourceId"`
			Active            bool    `json:"active"`
		} `json:"items"`
		Total    int `json:"total"`
		Page     int `json:"page"`
		PageSize int `json:"pageSize"`
	} `json:"data"`
}

type apiBalancesResponse struct {
	Data []struct {
		CollaboratorID    string  `json:"collaboratorId"`
		CollaboratorLabel string  `json:"collaboratorLabel"`
		ValueUnitID       string  `json:"valueUnitId"`
		ValueUnitCode     string  `json:"valueUnitCode"`
		ValueUnitLabel    string  `json:"valueUnitLabel"`
		Balance           float64 `json:"balance"`
	} `json:"data"`
}

func TestExpenseCreatesDebitLedgerEntryAndNegativeCurrentAccountBalance(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/ledger-entries")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected ledger list status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var entries apiLedgerEntryListResponse
	decodeJSON(t, res, &entries)
	if entries.Data.Total != 1 || len(entries.Data.Items) != 1 {
		t.Fatalf("expected one ledger entry, got %+v", entries.Data)
	}
	entry := entries.Data.Items[0]
	if entry.CollaboratorID != collaborator.Data.ID || entry.CollaboratorLabel != "P1" {
		t.Fatalf("unexpected collaborator fields: %+v", entry)
	}
	if entry.ValueUnitID != "ref-value-unit-brl" || entry.ValueUnitCode != "BRL" {
		t.Fatalf("unexpected value unit fields: %+v", entry)
	}
	if entry.EntryType != "EXPENSE_DEDUCTION" || entry.Direction != "DEBIT" || entry.SourceType != "EXPENSE" || entry.SourceID != expense.Data.ID {
		t.Fatalf("unexpected ledger classification/source: %+v", entry)
	}
	if entry.Amount != 42.5 || entry.SignedAmount != -42.5 || entry.EffectiveDate != "2026-06-03" || !entry.Active {
		t.Fatalf("unexpected ledger amounts/date/active: %+v", entry)
	}

	res = getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/balances")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected balance status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var balances apiBalancesResponse
	decodeJSON(t, res, &balances)
	if len(balances.Data) != 1 {
		t.Fatalf("expected one balance, got %+v", balances.Data)
	}
	balance := balances.Data[0]
	if balance.CollaboratorID != collaborator.Data.ID || balance.CollaboratorLabel != "P1" || balance.ValueUnitCode != "BRL" || balance.Balance != -42.5 {
		t.Fatalf("unexpected balance: %+v", balance)
	}
}

func TestCurrentAccountKeepsSeparateBalancesByValueUnit(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-brl",
		"amount":      10.0,
	}))
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-gold-gram",
		"amount":      2.5,
	}))

	res := getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/balances")
	defer res.Body.Close()
	var balances apiBalancesResponse
	decodeJSON(t, res, &balances)
	if len(balances.Data) != 2 {
		t.Fatalf("expected BRL and GOLD_GRAM balances, got %+v", balances.Data)
	}
	byCode := map[string]float64{}
	for _, balance := range balances.Data {
		byCode[balance.ValueUnitCode] = balance.Balance
	}
	if byCode["BRL"] != -10.0 || byCode["GOLD_GRAM"] != -2.5 {
		t.Fatalf("unexpected balances by code: %+v", byCode)
	}
}

func TestExpenseUpdateAndDeactivateUpdateLedgerAndBalances(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := postJSON(t, server, http.MethodPatch, expensesURL+expense.Data.ID, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-gold-gram",
		"amount":      3.75,
		"expenseDate": "2026-06-04",
	}))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected update status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/ledger-entries?valueUnitId=ref-value-unit-gold-gram")
	defer res.Body.Close()
	var entries apiLedgerEntryListResponse
	decodeJSON(t, res, &entries)
	if entries.Data.Total != 1 || len(entries.Data.Items) != 1 {
		t.Fatalf("expected one updated gold ledger entry, got %+v", entries.Data)
	}
	entry := entries.Data.Items[0]
	if entry.ValueUnitCode != "GOLD_GRAM" || entry.Amount != 3.75 || entry.SignedAmount != -3.75 || entry.EffectiveDate != "2026-06-04" {
		t.Fatalf("unexpected updated ledger entry: %+v", entry)
	}

	res = postJSON(t, server, http.MethodPatch, expensesURL+expense.Data.ID+"/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/balances")
	defer res.Body.Close()
	var balances apiBalancesResponse
	decodeJSON(t, res, &balances)
	if len(balances.Data) != 0 {
		t.Fatalf("expected no active balances after deactivation, got %+v", balances.Data)
	}

	res = getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/ledger-entries?includeInactive=true")
	defer res.Body.Close()
	decodeJSON(t, res, &entries)
	if entries.Data.Total != 1 || len(entries.Data.Items) != 1 || entries.Data.Items[0].Active {
		t.Fatalf("expected one inactive ledger entry when requested, got %+v", entries.Data)
	}
}

func TestCurrentAccountRejectsMissingCollaborator(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := getJSON(t, server, currentAccountsURL+"missing-collaborator/balances")
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, res.StatusCode)
	}
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
		"rg":                fmt.Sprintf("RG-CA-%06d", seq),
		"cellular":          cellularForSeq(seq),
		"email":             fmt.Sprintf("ca-person%d@example.com", seq),
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
		"pixKey":            fmt.Sprintf("ca-person%d-pix@example.com", seq),
		"emergencyName":     "Emergency Contact",
		"emergencyCellular": "11912345678",
		"emergencyEmail":    fmt.Sprintf("ca-emergency%d@example.com", seq),
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

func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}
