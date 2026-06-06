package accruals_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	apppkg "enterpriseremotesystems/backend/internal/app"
	"github.com/gofiber/fiber/v3"
)

const (
	peopleURL        = "/api/v1/people/"
	collaboratorsURL = "/api/v1/collaborators/"
	workPeriodsURL   = "/api/v1/work-periods/"
	assignmentsURL   = "/api/v1/work-period-assignments/"
	accrualRunsURL   = "/api/v1/accrual-runs/"
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
type apiWorkPeriodResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}
type apiAssignmentResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

type apiAccrualRunResponse struct {
	Data struct {
		ID           string `json:"id"`
		WorkPeriodID string `json:"workPeriodId"`
		Status       string `json:"status"`
		AccrualDate  string `json:"accrualDate"`
		Summary      struct {
			TotalItems   int `json:"totalItems"`
			ReadyItems   int `json:"readyItems"`
			PendingItems int `json:"pendingItems"`
			SkippedItems int `json:"skippedItems"`
		} `json:"summary"`
	} `json:"data"`
}
type apiAccrualItemListResponse struct {
	Data struct {
		Items []struct {
			ID              string   `json:"id"`
			CollaboratorID  string   `json:"collaboratorId"`
			CalculationType string   `json:"calculationType"`
			Direction       string   `json:"direction"`
			BRLAmount       *float64 `json:"brlAmount"`
			GoldGramAmount  *float64 `json:"goldGramAmount"`
			Status          string   `json:"status"`
			PendingReason   string   `json:"pendingReason"`
		} `json:"items"`
		Total int `json:"total"`
	} `json:"data"`
}

func TestCreateAccrualRunCreatesReadyDailyBRLItem(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "dailyBrlAmount": 150.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")

	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	if run.Data.Status != "READY_TO_POST" {
		t.Fatalf("expected READY_TO_POST, got %q", run.Data.Status)
	}
	if run.Data.Summary.ReadyItems != 1 || run.Data.Summary.TotalItems != 1 {
		t.Fatalf("expected one ready item, got %+v", run.Data.Summary)
	}

	items := listAccrualItems(t, server, run.Data.ID, "")
	if items.Data.Total != 1 {
		t.Fatalf("expected one item, got %d", items.Data.Total)
	}
	item := items.Data.Items[0]
	if item.CalculationType != "DAILY_BRL" || item.Status != "READY" || item.BRLAmount == nil || *item.BRLAmount != 150.0 {
		t.Fatalf("expected ready daily BRL item, got %+v", item)
	}
}

func TestGoldCommissionAccrualItemPendingWhenProductionMissing(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 5.0, "goldCommissionPercent": 5.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")

	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	if run.Data.Status != "PENDING_INPUT" {
		t.Fatalf("expected PENDING_INPUT, got %q", run.Data.Status)
	}
	items := listAccrualItems(t, server, run.Data.ID, "status=PENDING")
	if items.Data.Total != 1 || items.Data.Items[0].PendingReason != "GOLD_PRODUCTION_MISSING" {
		t.Fatalf("expected pending production item, got %+v", items.Data.Items)
	}
}

func TestRecalculateAccrualRunUsesGoldProduction(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 5.0, "goldCommissionPercent": 5.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")
	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	createGoldProductionEntry(t, server, workPeriod.Data.ID, map[string]any{"locationId": "ref-location-main-mine", "productionDate": "2026-06-05", "goldGramsProduced": 100.0})

	res := postJSON(t, server, http.MethodPost, accrualRunsURL+run.Data.ID+"/recalculate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected recalculate status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
	var recalculated apiAccrualRunResponse
	decodeJSON(t, res, &recalculated)
	if recalculated.Data.Status != "READY_TO_POST" {
		t.Fatalf("expected READY_TO_POST, got %q", recalculated.Data.Status)
	}
	items := listAccrualItems(t, server, run.Data.ID, "status=READY")
	if items.Data.Total != 1 || items.Data.Items[0].GoldGramAmount == nil || *items.Data.Items[0].GoldGramAmount != 5.0 {
		t.Fatalf("expected 5g ready item, got %+v", items.Data.Items)
	}
}

func newTestServer(t *testing.T) (*fiber.App, func()) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := apppkg.Bootstrap(apppkg.Config{Env: "test", HTTPAddr: ":0", DBPath: dbPath, JWTSecret: "test-secret"})
	if err != nil {
		t.Fatalf("bootstrap test server: %v", err)
	}
	return server, cleanup
}
func createWorkPeriod(t *testing.T, server *fiber.App, overrides map[string]any) apiWorkPeriodResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, workPeriodsURL, validWorkPeriodPayload(overrides))
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("create work period: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiWorkPeriodResponse
	decodeJSON(t, res, &body)
	return body
}
func createActiveCollaborator(t *testing.T, server *fiber.App, seq int, payload map[string]any) apiCollaboratorResponse {
	t.Helper()
	person := createPerson(t, server, validCompletePersonPayload(seq, nil))
	payload["personId"] = person.Data.ID
	return createCollaborator(t, server, payload)
}
func createPerson(t *testing.T, server *fiber.App, payload map[string]any) apiPersonResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, peopleURL, payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("create person: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
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
		t.Fatalf("create collaborator: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiCollaboratorResponse
	decodeJSON(t, res, &body)
	return body
}
func createAssignment(t *testing.T, server *fiber.App, workPeriodID string, payload map[string]any) apiAssignmentResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriodID+"/assignments", payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("create assignment: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiAssignmentResponse
	decodeJSON(t, res, &body)
	return body
}
func markOutcome(t *testing.T, server *fiber.App, assignmentID string, status string) {
	t.Helper()
	res := postJSON(t, server, http.MethodPatch, assignmentsURL+assignmentID+"/outcome", map[string]any{"actualStatus": status})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("mark outcome: expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
}
func createAccrualRun(t *testing.T, server *fiber.App, workPeriodID string, payload map[string]any) apiAccrualRunResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriodID+"/accrual-runs", payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("create accrual run: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiAccrualRunResponse
	decodeJSON(t, res, &body)
	return body
}
func listAccrualItems(t *testing.T, server *fiber.App, runID string, query string) apiAccrualItemListResponse {
	t.Helper()
	url := accrualRunsURL + runID + "/items"
	if query != "" {
		url += "?" + query
	}
	res := getJSON(t, server, url)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected list items status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var body apiAccrualItemListResponse
	decodeJSON(t, res, &body)
	return body
}
func createGoldProductionEntry(t *testing.T, server *fiber.App, workPeriodID string, payload map[string]any) {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriodID+"/gold-production-entries", payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("create gold production: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
}

func validWorkPeriodPayload(overrides map[string]any) map[string]any {
	payload := map[string]any{"workDate": "2026-06-05", "periodCode": "DAY", "name": "06:00-18:00", "startsAt": "2026-06-05T06:00:00Z", "endsAt": "2026-06-05T18:00:00Z"}
	for k, v := range overrides {
		payload[k] = v
	}
	return payload
}
func validAssignmentPayload(collaboratorID string, overrides map[string]any) map[string]any {
	payload := map[string]any{"collaboratorId": collaboratorID, "plannedStatus": "INCLUDED", "sectorId": "ref-sector-mining", "locationId": "ref-location-main-mine", "taskId": "ref-task-miner"}
	for k, v := range overrides {
		payload[k] = v
	}
	return payload
}
func validCollaboratorPayload(personID string, overrides map[string]any) map[string]any {
	payload := map[string]any{"personId": personID, "journeyStartDate": "2026-06-01", "paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "sectorId": "ref-sector-mining", "locationId": "ref-location-main-mine", "taskId": "ref-task-miner", "statusId": "ref-collaborator-status-active", "notes": "Accrual collaborator"}
	for k, v := range overrides {
		payload[k] = v
	}
	return payload
}
func validCompletePersonPayload(seq int, overrides map[string]any) map[string]any {
	payload := map[string]any{"firstName": fmt.Sprintf("Accrual%d", seq), "lastName": "Silva", "nickname": fmt.Sprintf("A%d", seq), "cpf": cpfForSeq(seq), "rg": fmt.Sprintf("AC-%06d", seq), "cellular": cellularForSeq(seq), "email": fmt.Sprintf("accrual%d@example.com", seq), "street1": "Rua Completa 123", "city": "Sao Paulo", "state": "SP", "cep": "01001000", "country": "Brasil", "bankName": "Banco Teste", "bankNumber": "001", "checkingAccount": "12345-6", "pixKey": fmt.Sprintf("accrual%d-pix@example.com", seq), "emergencyName": "Emergency Contact", "emergencyCellular": "11912345678", "emergencyEmail": fmt.Sprintf("accrual-emergency%d@example.com", seq), "statusId": "ref-person-status-active"}
	for k, v := range overrides {
		payload[k] = v
	}
	return payload
}
func cpfForSeq(seq int) string {
	cpfs := []string{"39053344705", "93541134780", "35711002844", "12345678909"}
	return cpfs[(seq-1)%len(cpfs)]
}
func cellularForSeq(seq int) string { return fmt.Sprintf("11%d%08d", 9, 98865000+seq) }
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
func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}
