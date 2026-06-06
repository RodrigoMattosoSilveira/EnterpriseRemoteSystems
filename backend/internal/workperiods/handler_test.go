package workperiods_test

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

const workPeriodsURL = "/api/v1/work-periods/"

type apiErrorResponse struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
}

type apiWorkPeriodResponse struct {
	Data struct {
		ID         string `json:"id"`
		TenantID   string `json:"tenantId"`
		WorkDate   string `json:"workDate"`
		PeriodCode string `json:"periodCode"`
		Name       string `json:"name"`
		StartsAt   string `json:"startsAt"`
		EndsAt     string `json:"endsAt"`
		Status     string `json:"status"`
		InformedAt string `json:"informedAt"`
	} `json:"data"`
}

type apiWorkPeriodListResponse struct {
	Data struct {
		Items []struct {
			ID         string `json:"id"`
			WorkDate   string `json:"workDate"`
			PeriodCode string `json:"periodCode"`
			Status     string `json:"status"`
		} `json:"items"`
		Total    int `json:"total"`
		Page     int `json:"page"`
		PageSize int `json:"pageSize"`
	} `json:"data"`
}

func TestCreateWorkPeriodReturnsCreated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postJSON(t, server, http.MethodPost, workPeriodsURL, validWorkPeriodPayload(nil))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiWorkPeriodResponse
	decodeJSON(t, res, &body)

	if body.Data.ID == "" {
		t.Fatal("expected work period id")
	}
	if body.Data.TenantID != "default" {
		t.Fatalf("expected default tenant, got %q", body.Data.TenantID)
	}
	if body.Data.WorkDate != "2026-06-05" {
		t.Fatalf("expected work date 2026-06-05, got %q", body.Data.WorkDate)
	}
	if body.Data.PeriodCode != "DAY" {
		t.Fatalf("expected DAY period code, got %q", body.Data.PeriodCode)
	}
	if body.Data.Status != "PLANNING" {
		t.Fatalf("expected PLANNING status, got %q", body.Data.Status)
	}
}

func TestListAndGetWorkPeriodReturnCreatedWorkPeriod(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createWorkPeriod(t, server, nil)

	listRes := getJSON(t, server, workPeriodsURL+"?dateFrom=2026-06-05&dateTo=2026-06-05&status=PLANNING")
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listRes.StatusCode)
	}
	var listBody apiWorkPeriodListResponse
	decodeJSON(t, listRes, &listBody)
	if listBody.Data.Total != 1 {
		t.Fatalf("expected one work period, got total %d", listBody.Data.Total)
	}
	if listBody.Data.Items[0].ID != created.Data.ID {
		t.Fatalf("expected created work period in list, got %q", listBody.Data.Items[0].ID)
	}

	getRes := getJSON(t, server, workPeriodsURL+created.Data.ID)
	defer getRes.Body.Close()
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, getRes.StatusCode)
	}
	var getBody apiWorkPeriodResponse
	decodeJSON(t, getRes, &getBody)
	if getBody.Data.ID != created.Data.ID {
		t.Fatalf("expected created work period id, got %q", getBody.Data.ID)
	}
}

func TestInformWorkPeriodMovesPlanningPeriodToInformed(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createWorkPeriod(t, server, nil)

	res := postJSON(t, server, http.MethodPost, workPeriodsURL+created.Data.ID+"/inform", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiWorkPeriodResponse
	decodeJSON(t, res, &body)
	if body.Data.Status != "INFORMED" {
		t.Fatalf("expected INFORMED status, got %q", body.Data.Status)
	}
	if body.Data.InformedAt == "" {
		t.Fatal("expected informedAt")
	}
}

func TestCreateWorkPeriodRejectsMissingRequiredFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postJSON(t, server, http.MethodPost, workPeriodsURL, map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}

	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if body.Error == nil || body.Error.Fields["workDate"] == "" || body.Error.Fields["periodCode"] == "" || body.Error.Fields["startsAt"] == "" || body.Error.Fields["endsAt"] == "" {
		t.Fatalf("expected required field errors, got %+v", body.Error)
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

func validWorkPeriodPayload(overrides map[string]any) map[string]any {
	payload := map[string]any{
		"workDate":   "2026-06-05",
		"periodCode": "DAY",
		"name":       "06:00-18:00",
		"startsAt":   "2026-06-05T06:00:00Z",
		"endsAt":     "2026-06-05T18:00:00Z",
	}
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
}

func postJSON(t *testing.T, server *fiber.App, method string, url string, payload any) *http.Response {
	t.Helper()
	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			t.Fatalf("encode request payload: %v", err)
		}
	}
	req := httptest.NewRequest(method, url, &body)
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

type apiPrintRosterResponse struct {
	Data struct {
		WorkPeriodID string `json:"workPeriodId"`
		Title        string `json:"title"`
		Subtitle     string `json:"subtitle"`
		DisplayDate  string `json:"displayDate"`
		PeriodName   string `json:"periodName"`
		Rows         []struct {
			AssignmentID   string `json:"assignmentId"`
			CollaboratorID string `json:"collaboratorId"`
			Name           string `json:"name"`
			Nickname       string `json:"nickname"`
			SectorLabel    string `json:"sectorLabel"`
			LocationLabel  string `json:"locationLabel"`
			TaskLabel      string `json:"taskLabel"`
		} `json:"rows"`
	} `json:"data"`
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

type apiAssignmentResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

func TestPrintRosterReturnsOnlyIncludedAssignments(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	includedCollaborator := createActiveCollaborator(t, server, 1)
	excludedCollaborator := createActiveCollaborator(t, server, 2)

	createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(includedCollaborator.Data.ID, nil))
	createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(excludedCollaborator.Data.ID, map[string]any{"plannedStatus": "EXCLUDED"}))

	informRes := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/inform", nil)
	defer informRes.Body.Close()
	if informRes.StatusCode != http.StatusOK {
		t.Fatalf("expected inform status %d, got %d", http.StatusOK, informRes.StatusCode)
	}

	res := getJSON(t, server, workPeriodsURL+workPeriod.Data.ID+"/print-roster")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected print roster status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiPrintRosterResponse
	decodeJSON(t, res, &body)
	if body.Data.WorkPeriodID != workPeriod.Data.ID {
		t.Fatalf("expected workPeriodId %q, got %q", workPeriod.Data.ID, body.Data.WorkPeriodID)
	}
	if body.Data.Title != "Work Plan" {
		t.Fatalf("expected title Work Plan, got %q", body.Data.Title)
	}
	if body.Data.DisplayDate != "06/05/2026" {
		t.Fatalf("expected display date 06/05/2026, got %q", body.Data.DisplayDate)
	}
	if body.Data.PeriodName != "06:00-18:00" {
		t.Fatalf("expected period name 06:00-18:00, got %q", body.Data.PeriodName)
	}
	if len(body.Data.Rows) != 1 {
		t.Fatalf("expected one included roster row, got %d", len(body.Data.Rows))
	}
	row := body.Data.Rows[0]
	if row.CollaboratorID != includedCollaborator.Data.ID {
		t.Fatalf("expected included collaborator %q, got %q", includedCollaborator.Data.ID, row.CollaboratorID)
	}
	if row.Name != "Person1 Silva" {
		t.Fatalf("expected collaborator name Person1 Silva, got %q", row.Name)
	}
	if row.SectorLabel == "" || row.LocationLabel == "" || row.TaskLabel == "" {
		t.Fatalf("expected roster reference labels, got sector=%q location=%q task=%q", row.SectorLabel, row.LocationLabel, row.TaskLabel)
	}
}

func createActiveCollaborator(t *testing.T, server *fiber.App, seq int) apiCollaboratorResponse {
	t.Helper()
	person := createPerson(t, server, validCompletePersonPayload(seq, nil))
	return createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))
}

func createPerson(t *testing.T, server *fiber.App, payload map[string]any) apiPersonResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, "/api/v1/people/", payload)
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
	res := postJSON(t, server, http.MethodPost, "/api/v1/collaborators/", payload)
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

func validAssignmentPayload(collaboratorID string, overrides map[string]any) map[string]any {
	payload := map[string]any{
		"collaboratorId": collaboratorID,
		"plannedStatus":  "INCLUDED",
		"sectorId":       "ref-sector-mining",
		"locationId":     "ref-location-main-mine",
		"taskId":         "ref-task-miner",
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
		"notes":            "Roster collaborator journey",
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
		"rg":                fmt.Sprintf("ROSTER-RG-%06d", seq),
		"cellular":          cellularForSeq(seq),
		"email":             fmt.Sprintf("roster-person%d@example.com", seq),
		"street1":           "Rua Completa 123",
		"street2":           "Apto 5",
		"city":              "Sao Paulo",
		"state":             "SP",
		"cep":               "01001000",
		"country":           "Brasil",
		"bankName":          "Banco Teste",
		"bankNumber":        "001",
		"checkingAccount":   "12345-6",
		"pixKey":            fmt.Sprintf("roster-person%d-pix@example.com", seq),
		"emergencyName":     "Emergency Contact",
		"emergencyCellular": "11912345678",
		"emergencyEmail":    fmt.Sprintf("roster-emergency%d@example.com", seq),
		"statusId":          "ref-person-status-active",
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
	return fmt.Sprintf("11%d%08d", 9, 98766000+seq)
}
