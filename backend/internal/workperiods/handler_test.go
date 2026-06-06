package workperiods_test

import (
	"bytes"
	"encoding/json"
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
