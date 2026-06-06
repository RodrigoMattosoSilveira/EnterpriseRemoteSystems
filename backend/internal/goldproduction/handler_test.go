package goldproduction_test

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

const (
	workPeriodsURL         = "/api/v1/work-periods/"
	goldProductionEntryURL = "/api/v1/gold-production-entries/"
)

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
		ID       string `json:"id"`
		WorkDate string `json:"workDate"`
	} `json:"data"`
}

type apiGoldProductionEntryResponse struct {
	Data struct {
		ID                string  `json:"id"`
		TenantID          string  `json:"tenantId"`
		WorkPeriodID      string  `json:"workPeriodId"`
		LocationID        string  `json:"locationId"`
		LocationLabel     string  `json:"locationLabel"`
		ProductionDate    string  `json:"productionDate"`
		GoldGramsProduced float64 `json:"goldGramsProduced"`
		Active            bool    `json:"active"`
		Notes             string  `json:"notes"`
	} `json:"data"`
}

type apiGoldProductionEntryListResponse struct {
	Data struct {
		Items []struct {
			ID                string  `json:"id"`
			LocationID        string  `json:"locationId"`
			ProductionDate    string  `json:"productionDate"`
			GoldGramsProduced float64 `json:"goldGramsProduced"`
			Active            bool    `json:"active"`
		} `json:"items"`
		Total    int `json:"total"`
		Page     int `json:"page"`
		PageSize int `json:"pageSize"`
	} `json:"data"`
}

func TestCreateGoldProductionEntryReturnsCreated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)

	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/gold-production-entries", validGoldProductionPayload(nil))
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiGoldProductionEntryResponse
	decodeJSON(t, res, &body)
	if body.Data.ID == "" {
		t.Fatal("expected gold production entry id")
	}
	if body.Data.TenantID != "default" {
		t.Fatalf("expected default tenant, got %q", body.Data.TenantID)
	}
	if body.Data.WorkPeriodID != workPeriod.Data.ID {
		t.Fatalf("expected workPeriodId %q, got %q", workPeriod.Data.ID, body.Data.WorkPeriodID)
	}
	if body.Data.LocationID != "ref-location-main-mine" {
		t.Fatalf("expected main mine location, got %q", body.Data.LocationID)
	}
	if body.Data.LocationLabel == "" {
		t.Fatal("expected location label")
	}
	if body.Data.ProductionDate != "2026-06-05" {
		t.Fatalf("expected productionDate 2026-06-05, got %q", body.Data.ProductionDate)
	}
	if body.Data.GoldGramsProduced != 12.12345678 {
		t.Fatalf("expected 12.12345678 grams, got %.8f", body.Data.GoldGramsProduced)
	}
	if !body.Data.Active {
		t.Fatal("expected active entry")
	}
}

func TestListGetUpdateAndDeactivateGoldProductionEntry(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	created := createGoldProductionEntry(t, server, workPeriod.Data.ID, validGoldProductionPayload(nil))

	listRes := getJSON(t, server, workPeriodsURL+workPeriod.Data.ID+"/gold-production-entries?locationId=ref-location-main-mine")
	defer listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, listRes.StatusCode)
	}
	var listBody apiGoldProductionEntryListResponse
	decodeJSON(t, listRes, &listBody)
	if listBody.Data.Total != 1 || listBody.Data.Items[0].ID != created.Data.ID {
		t.Fatalf("expected created entry in list, got total=%d items=%+v", listBody.Data.Total, listBody.Data.Items)
	}

	getRes := getJSON(t, server, goldProductionEntryURL+created.Data.ID)
	defer getRes.Body.Close()
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, getRes.StatusCode)
	}

	updateRes := postJSON(t, server, http.MethodPatch, goldProductionEntryURL+created.Data.ID, validGoldProductionPayload(map[string]any{"goldGramsProduced": 20.5, "notes": "Updated production"}))
	defer updateRes.Body.Close()
	if updateRes.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, updateRes, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, updateRes.StatusCode, body.Error)
	}
	var updateBody apiGoldProductionEntryResponse
	decodeJSON(t, updateRes, &updateBody)
	if updateBody.Data.GoldGramsProduced != 20.5 || updateBody.Data.Notes != "Updated production" {
		t.Fatalf("expected updated entry, got %+v", updateBody.Data)
	}

	deactivateRes := postJSON(t, server, http.MethodPatch, goldProductionEntryURL+created.Data.ID+"/deactivate", map[string]any{})
	defer deactivateRes.Body.Close()
	if deactivateRes.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, deactivateRes.StatusCode)
	}
	var deactivateBody apiGoldProductionEntryResponse
	decodeJSON(t, deactivateRes, &deactivateBody)
	if deactivateBody.Data.Active {
		t.Fatal("expected inactive entry")
	}
}

func TestCreateGoldProductionEntryRejectsDuplicateActiveLocationForWorkPeriodDate(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	createGoldProductionEntry(t, server, workPeriod.Data.ID, validGoldProductionPayload(nil))

	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/gold-production-entries", validGoldProductionPayload(map[string]any{"goldGramsProduced": 99.0}))
	defer res.Body.Close()
	assertValidationError(t, res, "locationId", "An active gold production entry already exists for this work period, location, and production date")
}

func TestCreateGoldProductionEntryRejectsInvalidPrecision(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/gold-production-entries", validGoldProductionPayload(map[string]any{"goldGramsProduced": 1.123456789}))
	defer res.Body.Close()
	assertValidationError(t, res, "goldGramsProduced", "Gold grams produced supports at most 8 decimal places")
}

func TestCreateGoldProductionEntryRejectsProductionDateDifferentFromWorkDate(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	workPeriod := createWorkPeriod(t, server, nil)
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriod.Data.ID+"/gold-production-entries", validGoldProductionPayload(map[string]any{"productionDate": "2026-06-06"}))
	defer res.Body.Close()
	assertValidationError(t, res, "productionDate", "Production date must match the Work Period work date")
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

func createGoldProductionEntry(t *testing.T, server *fiber.App, workPeriodID string, payload map[string]any) apiGoldProductionEntryResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriodID+"/gold-production-entries", payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("create gold production entry: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiGoldProductionEntryResponse
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

func validGoldProductionPayload(overrides map[string]any) map[string]any {
	payload := map[string]any{
		"locationId":        "ref-location-main-mine",
		"productionDate":    "2026-06-05",
		"goldGramsProduced": 12.12345678,
		"notes":             "Gold production for main mine",
	}
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
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

func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}
