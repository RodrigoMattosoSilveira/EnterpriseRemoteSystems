package workperiodassignments_test

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
		ID                         string `json:"id"`
		TenantID                   string `json:"tenantId"`
		WorkPeriodID               string `json:"workPeriodId"`
		CollaboratorID             string `json:"collaboratorId"`
		CollaboratorName           string `json:"collaboratorName"`
		PlannedStatus              string `json:"plannedStatus"`
		ActualStatus               string `json:"actualStatus"`
		ReplacementForAssignmentID string `json:"replacementForAssignmentId"`
		SectorID                   string `json:"sectorId"`
		SectorLabel                string `json:"sectorLabel"`
		LocationID                 string `json:"locationId"`
		LocationLabel              string `json:"locationLabel"`
		TaskID                     string `json:"taskId"`
		TaskLabel                  string `json:"taskLabel"`
		Active                     bool   `json:"active"`
	} `json:"data"`
}

type apiAssignmentListResponse struct {
	Data struct {
		Items []struct {
			ID             string `json:"id"`
			CollaboratorID string `json:"collaboratorId"`
			PlannedStatus  string `json:"plannedStatus"`
			ActualStatus   string `json:"actualStatus"`
			Active         bool   `json:"active"`
		} `json:"items"`
		Total    int `json:"total"`
		Page     int `json:"page"`
		PageSize int `json:"pageSize"`
	} `json:"data"`
}

type apiPlanningTemplateRow struct {
	AssignmentID         string `json:"assignmentId"`
	TemplateAssignmentID string `json:"templateAssignmentId"`
	CollaboratorID       string `json:"collaboratorId"`
	CollaboratorName     string `json:"collaboratorName"`
	CollaboratorNickname string `json:"collaboratorNickname"`
	ProjectedEndDate     string `json:"projectedEndDate"`
	Selected             bool   `json:"selected"`
	SectorID             string `json:"sectorId"`
	LocationID           string `json:"locationId"`
	TaskID               string `json:"taskId"`
}

type apiPlanningTemplateResponse struct {
	Data struct {
		WorkPeriodID       string                   `json:"workPeriodId"`
		SourceWorkPeriodID string                   `json:"sourceWorkPeriodId"`
		SourceWorkDate     string                   `json:"sourceWorkDate"`
		SourcePeriodName   string                   `json:"sourcePeriodName"`
		Rows               []apiPlanningTemplateRow `json:"rows"`
	} `json:"data"`
}

type apiBulkPlanResponse struct {
	Data struct {
		SelectedCount int `json:"selectedCount"`
		Assignments   []struct {
			ID             string `json:"id"`
			CollaboratorID string `json:"collaboratorId"`
			PlannedStatus  string `json:"plannedStatus"`
			SectorID       string `json:"sectorId"`
			LocationID     string `json:"locationId"`
			TaskID         string `json:"taskId"`
			Active         bool   `json:"active"`
		} `json:"assignments"`
	} `json:"data"`
}

func TestPlanningTemplateUsesMostRecentPriorSamePeriod(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	previous := createWorkPeriod(t, server, map[string]any{
		"workDate": "2026-06-04",
		"startsAt": "2026-06-04T06:00:00Z",
		"endsAt":   "2026-06-04T18:00:00Z",
	})
	current := createWorkPeriod(t, server, map[string]any{
		"workDate": "2026-06-05",
		"startsAt": "2026-06-05T06:00:00Z",
		"endsAt":   "2026-06-05T18:00:00Z",
	})
	selectedCollaborator := createActiveCollaborator(t, server, 1)
	unselectedCollaborator := createActiveCollaborator(t, server, 2)
	previousAssignment := createAssignment(t, server, previous.Data.ID, validAssignmentPayload(selectedCollaborator.Data.ID, map[string]any{"locationId": "ref-location-main-mine"}))

	res := getJSON(t, server, workPeriodsURL+current.Data.ID+"/assignments/planning-template")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected template status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiPlanningTemplateResponse
	decodeJSON(t, res, &body)
	if body.Data.SourceWorkPeriodID != previous.Data.ID || body.Data.SourceWorkDate != "2026-06-04" {
		t.Fatalf("expected previous period as source, got id=%q date=%q", body.Data.SourceWorkPeriodID, body.Data.SourceWorkDate)
	}
	selectedRow := findTemplateRow(body, selectedCollaborator.Data.ID)
	if selectedRow == nil || !selectedRow.Selected || selectedRow.TemplateAssignmentID != previousAssignment.Data.ID {
		t.Fatalf("expected selected collaborator templated from previous assignment, got %+v", selectedRow)
	}
	unselectedRow := findTemplateRow(body, unselectedCollaborator.Data.ID)
	if unselectedRow == nil || unselectedRow.Selected {
		t.Fatalf("expected other active collaborator to be present and unselected, got %+v", unselectedRow)
	}
}

func TestBulkPlanSavesSelectedCollaboratorsOnlyAndIgnoresUnselectedRows(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	first := createActiveCollaborator(t, server, 1)
	second := createActiveCollaborator(t, server, 2)
	createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(first.Data.ID, nil))

	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/assignments/bulk-plan", map[string]any{
		"rows": []map[string]any{
			{
				"collaboratorId": first.Data.ID,
				"selected":       false,
			},
			{
				"collaboratorId": second.Data.ID,
				"selected":       true,
				"sectorId":       "ref-sector-mining",
				"locationId":     "ref-location-main-mine",
				"taskId":         "ref-task-miner",
			},
		},
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected bulk-plan status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
	var body apiBulkPlanResponse
	decodeJSON(t, res, &body)
	if body.Data.SelectedCount != 1 || len(body.Data.Assignments) != 1 {
		t.Fatalf("expected one saved selected assignment, got selected=%d assignments=%d", body.Data.SelectedCount, len(body.Data.Assignments))
	}
	if body.Data.Assignments[0].CollaboratorID != second.Data.ID || body.Data.Assignments[0].PlannedStatus != "INCLUDED" || !body.Data.Assignments[0].Active {
		t.Fatalf("expected active included assignment for second collaborator, got %+v", body.Data.Assignments[0])
	}

	listRes := getJSON(t, server, workPeriodsURL+workPeriod.Data.ID+"/assignments?plannedStatus=INCLUDED")
	defer listRes.Body.Close()
	var listBody apiAssignmentListResponse
	decodeJSON(t, listRes, &listBody)
	if listBody.Data.Total != 2 {
		t.Fatalf("expected original current assignment to remain active while selected row is saved, got total=%d items=%+v", listBody.Data.Total, listBody.Data.Items)
	}
	activeByCollaborator := map[string]bool{}
	for _, item := range listBody.Data.Items {
		activeByCollaborator[item.CollaboratorID] = item.Active
	}
	if !activeByCollaborator[first.Data.ID] || !activeByCollaborator[second.Data.ID] {
		t.Fatalf("expected both original and selected collaborators to remain active, got %+v", listBody.Data.Items)
	}
}

func TestCreateWorkPeriodAssignmentReturnsCreated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1)

	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/assignments", validAssignmentPayload(collaborator.Data.ID, nil))
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiAssignmentResponse
	decodeJSON(t, res, &body)
	if body.Data.ID == "" {
		t.Fatal("expected assignment id")
	}
	if body.Data.WorkPeriodID != workPeriod.Data.ID {
		t.Fatalf("expected workPeriodId %q, got %q", workPeriod.Data.ID, body.Data.WorkPeriodID)
	}
	if body.Data.CollaboratorID != collaborator.Data.ID {
		t.Fatalf("expected collaboratorId %q, got %q", collaborator.Data.ID, body.Data.CollaboratorID)
	}
	if body.Data.PlannedStatus != "INCLUDED" {
		t.Fatalf("expected INCLUDED planned status, got %q", body.Data.PlannedStatus)
	}
	if body.Data.SectorLabel == "" || body.Data.LocationLabel == "" || body.Data.TaskLabel == "" {
		t.Fatalf("expected reference labels, got sector=%q location=%q task=%q", body.Data.SectorLabel, body.Data.LocationLabel, body.Data.TaskLabel)
	}
}

func TestListGetUpdateAndDeactivateWorkPeriodAssignment(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1)
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))

	listRes := getJSON(t, server, workPeriodsURL+workPeriod.Data.ID+"/assignments?plannedStatus=INCLUDED")
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("expected list status %d, got %d", http.StatusOK, listRes.StatusCode)
	}
	var listBody apiAssignmentListResponse
	decodeJSON(t, listRes, &listBody)
	if listBody.Data.Total != 1 || listBody.Data.Items[0].ID != assignment.Data.ID {
		t.Fatalf("expected created assignment in list, got total %d", listBody.Data.Total)
	}

	getRes := getJSON(t, server, assignmentsURL+assignment.Data.ID)
	defer getRes.Body.Close()
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("expected get status %d, got %d", http.StatusOK, getRes.StatusCode)
	}

	updateRes := postJSON(t, server, http.MethodPatch, assignmentsURL+assignment.Data.ID, validAssignmentPayload(collaborator.Data.ID, map[string]any{"plannedStatus": "EXCLUDED"}))
	defer updateRes.Body.Close()
	if updateRes.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, updateRes, &body)
		t.Fatalf("expected update status %d, got %d with error %+v", http.StatusOK, updateRes.StatusCode, body.Error)
	}
	var updateBody apiAssignmentResponse
	decodeJSON(t, updateRes, &updateBody)
	if updateBody.Data.PlannedStatus != "EXCLUDED" {
		t.Fatalf("expected EXCLUDED planned status, got %q", updateBody.Data.PlannedStatus)
	}

	deactivateRes := postJSON(t, server, http.MethodPatch, assignmentsURL+assignment.Data.ID+"/deactivate", map[string]any{})
	defer deactivateRes.Body.Close()
	if deactivateRes.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status %d, got %d", http.StatusOK, deactivateRes.StatusCode)
	}
	var deactivateBody apiAssignmentResponse
	decodeJSON(t, deactivateRes, &deactivateBody)
	if deactivateBody.Data.Active {
		t.Fatal("expected assignment to be inactive")
	}
}

func TestMarkActualOutcomeReturnsUpdatedAssignment(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1)
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))

	res := postJSON(t, server, http.MethodPatch, assignmentsURL+assignment.Data.ID+"/outcome", map[string]any{"actualStatus": "worked"})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiAssignmentResponse
	decodeJSON(t, res, &body)
	if body.Data.ActualStatus != "WORKED" {
		t.Fatalf("expected actual status WORKED, got %q", body.Data.ActualStatus)
	}

	listRes := getJSON(t, server, workPeriodsURL+workPeriod.Data.ID+"/assignments?actualStatus=WORKED")
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("expected list status %d, got %d", http.StatusOK, listRes.StatusCode)
	}
	var listBody apiAssignmentListResponse
	decodeJSON(t, listRes, &listBody)
	if listBody.Data.Total != 1 || listBody.Data.Items[0].ActualStatus != "WORKED" {
		t.Fatalf("expected WORKED assignment in filtered list, got total=%d status=%q", listBody.Data.Total, listBody.Data.Items[0].ActualStatus)
	}
}

func TestMarkActualOutcomeRejectsInvalidStatus(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1)
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))

	res := postJSON(t, server, http.MethodPatch, assignmentsURL+assignment.Data.ID+"/outcome", map[string]any{"actualStatus": "VACATION"})
	defer res.Body.Close()
	assertValidationError(t, res, "actualStatus", "Actual status must be WORKED, ABSENT, SICK_DAY_OFF, TIME_OFF, REPLACED, or CANCELLED")
}

func TestMarkActualOutcomeRejectsExcludedAssignment(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1)
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, map[string]any{"plannedStatus": "EXCLUDED"}))

	res := postJSON(t, server, http.MethodPatch, assignmentsURL+assignment.Data.ID+"/outcome", map[string]any{"actualStatus": "WORKED"})
	defer res.Body.Close()
	assertValidationError(t, res, "plannedStatus", "Only included assignments can receive actual outcomes")
}

func TestCreateWorkPeriodAssignmentRejectsDuplicateActiveCollaboratorInSameWorkPeriod(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1)
	createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))

	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/assignments", validAssignmentPayload(collaborator.Data.ID, map[string]any{"plannedStatus": "EXCLUDED"}))
	defer res.Body.Close()
	assertValidationError(t, res, "collaboratorId", "Collaborator already has an active assignment for this work period")
}

func TestReplacementAssignmentMayReferenceDifferentWorkPeriod(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	originalPeriod := createWorkPeriod(t, server, map[string]any{"periodCode": "DAY", "name": "06:00-18:00"})
	replacementPeriod := createWorkPeriod(t, server, map[string]any{"periodCode": "NIGHT", "name": "18:00-06:00", "startsAt": "2026-06-05T18:00:00Z", "endsAt": "2026-06-06T06:00:00Z"})
	originalCollaborator := createActiveCollaborator(t, server, 1)
	replacementCollaborator := createActiveCollaborator(t, server, 2)

	originalAssignment := createAssignment(t, server, originalPeriod.Data.ID, validAssignmentPayload(originalCollaborator.Data.ID, nil))

	res := postJSON(t, server, http.MethodPost, workPeriodsURL+replacementPeriod.Data.ID+"/assignments", validAssignmentPayload(replacementCollaborator.Data.ID, map[string]any{
		"replacementForAssignmentId": originalAssignment.Data.ID,
	}))
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiAssignmentResponse
	decodeJSON(t, res, &body)
	if body.Data.ReplacementForAssignmentID != originalAssignment.Data.ID {
		t.Fatalf("expected replacementForAssignmentId %q, got %q", originalAssignment.Data.ID, body.Data.ReplacementForAssignmentID)
	}
}

func TestCreateWorkPeriodAssignmentRejectsMissingRequiredFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/assignments", map[string]any{})
	defer res.Body.Close()

	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if body.Error == nil || body.Error.Fields["collaboratorId"] == "" || body.Error.Fields["plannedStatus"] == "" || body.Error.Fields["sectorId"] == "" || body.Error.Fields["locationId"] == "" || body.Error.Fields["taskId"] == "" {
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
		"street1":           "Rua Completa 123",
		"street2":           "Apto 5",
		"city":              "Sao Paulo",
		"state":             "SP",
		"cep":               "01001000",
		"country":           "Brasil",
		"bankName":          "Banco Teste",
		"bankNumber":        "001",
		"checkingAccount":   "12345-6",
		"pixKey":            fmt.Sprintf("person%d-pix@example.com", seq),
		"emergencyName":     "Emergency Contact",
		"emergencyCellular": "11912345678",
		"emergencyEmail":    fmt.Sprintf("emergency%d@example.com", seq),
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
	return fmt.Sprintf("11%d%08d", 9, 98765000+seq)
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
	if body.Error.Fields[field] != message {
		t.Fatalf("expected field %q to be %q, got %q", field, message, body.Error.Fields[field])
	}
}

func findTemplateRow(body apiPlanningTemplateResponse, collaboratorID string) *apiPlanningTemplateRow {
	for index := range body.Data.Rows {
		if body.Data.Rows[index].CollaboratorID == collaboratorID {
			return &body.Data.Rows[index]
		}
	}
	return nil
}

func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}
