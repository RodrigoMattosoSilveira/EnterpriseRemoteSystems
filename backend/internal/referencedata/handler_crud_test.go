package referencedata_test

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

const referenceDataURL = "/api/v1/reference-data/"

type apiErrorResponse struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
}

type apiReferenceDataResponse struct {
	Data referenceDataDTO `json:"data"`
}

type apiReferenceDataListResponse struct {
	Data []referenceDataDTO `json:"data"`
}

type apiTenantResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

type referenceDataDTO struct {
	ID           string `json:"id"`
	TenantID     string `json:"tenantId"`
	Type         string `json:"type"`
	Code         string `json:"code"`
	Label        string `json:"label"`
	Description  string `json:"description"`
	Active       bool   `json:"active"`
	SortOrder    int    `json:"sortOrder"`
	MetadataJSON string `json:"metadataJson"`
}

func TestListReferenceDataByTypeReturnsSeededRows(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := getJSON(t, server, referenceDataURL+"method")
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiReferenceDataListResponse
	decodeJSON(t, res, &body)

	if len(body.Data) < 3 {
		t.Fatalf("expected seeded method rows, got %d", len(body.Data))
	}
	if body.Data[0].Type != "method" {
		t.Fatalf("expected method type, got %q", body.Data[0].Type)
	}
}

func TestReferenceDataIsScopedBySelectedTenant(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	defaultTask := createReferenceData(t, server, "task", map[string]any{
		"code":  "TENANT_ISOLATION_TASK",
		"label": "Default Tenant Isolation Task",
	})

	res := postJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{
		"code":        "REFERENCE-DATA-TENANT",
		"name":        "Reference Data Tenant",
		"description": "Reference-data tenant-isolation test",
		"active":      true,
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected tenant create status %d, got %d", http.StatusCreated, res.StatusCode)
	}
	var tenantBody apiTenantResponse
	decodeJSON(t, res, &tenantBody)
	if tenantBody.Data.ID == "" {
		t.Fatal("expected created tenant id")
	}

	secondaryTask := createReferenceDataForTenant(t, server, tenantBody.Data.ID, "task", map[string]any{
		"code":  "TENANT_ISOLATION_TASK",
		"label": "Secondary Tenant Isolation Task",
	})
	if secondaryTask.Data.TenantID != tenantBody.Data.ID {
		t.Fatalf("expected secondary item tenant %q, got %q", tenantBody.Data.ID, secondaryTask.Data.TenantID)
	}

	secondaryRows := listReferenceDataForTenant(t, server, tenantBody.Data.ID, "task")
	assertReferenceDataContainsID(t, secondaryRows.Data, secondaryTask.Data.ID, true)
	assertReferenceDataContainsID(t, secondaryRows.Data, defaultTask.Data.ID, false)

	defaultRows := listReferenceDataForTenant(t, server, "default", "task")
	assertReferenceDataContainsID(t, defaultRows.Data, defaultTask.Data.ID, true)
	assertReferenceDataContainsID(t, defaultRows.Data, secondaryTask.Data.ID, false)

	res = postJSONForTenant(t, server, tenantBody.Data.ID, http.MethodPut, referenceDataURL+"task/"+defaultTask.Data.ID, map[string]any{
		"code":  "TENANT_ISOLATION_TASK",
		"label": "Cross-tenant update must fail",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("expected cross-tenant update status %d, got %d", http.StatusNotFound, res.StatusCode)
	}
}

func TestCreateReferenceDataItemReturnsCreated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postJSON(t, server, http.MethodPost, referenceDataURL+"sector", map[string]any{
		"code":        "PLANT",
		"label":       "Processing Plant",
		"description": "Plant operations",
		"sortOrder":   40,
	})
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiReferenceDataResponse
	decodeJSON(t, res, &body)

	if body.Data.ID == "" {
		t.Fatal("expected id")
	}
	if body.Data.TenantID != "default" {
		t.Fatalf("expected tenantId default, got %q", body.Data.TenantID)
	}
	if body.Data.Type != "sector" {
		t.Fatalf("expected type sector, got %q", body.Data.Type)
	}
	if body.Data.Code != "PLANT" {
		t.Fatalf("expected normalized code PLANT, got %q", body.Data.Code)
	}
	if body.Data.Label != "Processing Plant" {
		t.Fatalf("expected label, got %q", body.Data.Label)
	}
	if !body.Data.Active {
		t.Fatal("expected new reference data to default active")
	}
}

func TestUpdateReferenceDataItemReturnsUpdated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createReferenceData(t, server, "location", map[string]any{
		"code":      "WORKSHOP",
		"label":     "Workshop",
		"sortOrder": 50,
	})

	res := postJSON(t, server, http.MethodPut, referenceDataURL+"location/"+created.Data.ID, map[string]any{
		"code":         "WAREHOUSE",
		"label":        "Warehouse",
		"description":  "Supply warehouse",
		"sortOrder":    60,
		"metadataJson": `{"color":"blue"}`,
	})
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiReferenceDataResponse
	decodeJSON(t, res, &body)

	if body.Data.ID != created.Data.ID {
		t.Fatalf("expected same id %q, got %q", created.Data.ID, body.Data.ID)
	}
	if body.Data.Code != "WAREHOUSE" {
		t.Fatalf("expected updated code, got %q", body.Data.Code)
	}
	if body.Data.Label != "Warehouse" {
		t.Fatalf("expected updated label, got %q", body.Data.Label)
	}
	if body.Data.Description != "Supply warehouse" {
		t.Fatalf("expected updated description, got %q", body.Data.Description)
	}
	if body.Data.SortOrder != 60 {
		t.Fatalf("expected sortOrder 60, got %d", body.Data.SortOrder)
	}
	if body.Data.MetadataJSON != `{"color":"blue"}` {
		t.Fatalf("expected metadataJson, got %q", body.Data.MetadataJSON)
	}
}

func TestDeactivateAndReactivateReferenceDataItem(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createReferenceData(t, server, "task", map[string]any{
		"code":  "DRIVER",
		"label": "Driver",
	})

	res := postJSON(t, server, http.MethodPatch, referenceDataURL+"task/"+created.Data.ID+"/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var deactivated apiReferenceDataResponse
	decodeJSON(t, res, &deactivated)
	if deactivated.Data.Active {
		t.Fatal("expected reference data item to be inactive")
	}

	res = postJSON(t, server, http.MethodPatch, referenceDataURL+"task/"+created.Data.ID+"/reactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected reactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var reactivated apiReferenceDataResponse
	decodeJSON(t, res, &reactivated)
	if !reactivated.Data.Active {
		t.Fatal("expected reference data item to be active")
	}
}

func TestReferenceDataUniquenessIsEnforcedByTenantTypeAndName(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	createReferenceData(t, server, "sector", map[string]any{
		"code":  "SECURITY",
		"label": "Security",
	})

	res := postJSON(t, server, http.MethodPost, referenceDataURL+"sector", map[string]any{
		"code":  "SECURITY_2",
		"label": "Security",
	})
	defer res.Body.Close()

	assertValidationError(t, res, "label", "Name already exists for this type")
}

func TestReferenceDataUniquenessIsEnforcedByTenantTypeAndCode(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	createReferenceData(t, server, "sector", map[string]any{
		"code":  "MAINTENANCE",
		"label": "Maintenance",
	})

	res := postJSON(t, server, http.MethodPost, referenceDataURL+"sector", map[string]any{
		"code":  "maintenance",
		"label": "Maintenance Crew",
	})
	defer res.Body.Close()

	assertValidationError(t, res, "code", "Code already exists for this type")
}

func TestReferenceDataUniquenessExcludesCurrentItemOnUpdate(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createReferenceData(t, server, "sector", map[string]any{
		"code":  "TRANSPORT",
		"label": "Transport",
	})

	res := postJSON(t, server, http.MethodPut, referenceDataURL+"sector/"+created.Data.ID, map[string]any{
		"code":  "TRANSPORT",
		"label": "Transport",
	})
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
}

func createReferenceDataForTenant(t *testing.T, server *fiber.App, tenantID string, typ string, payload map[string]any) apiReferenceDataResponse {
	t.Helper()
	res := postJSONForTenant(t, server, tenantID, http.MethodPost, referenceDataURL+typ, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create reference data status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiReferenceDataResponse
	decodeJSON(t, res, &body)
	return body
}

func listReferenceDataForTenant(t *testing.T, server *fiber.App, tenantID string, typ string) apiReferenceDataListResponse {
	t.Helper()
	res := getJSONForTenant(t, server, tenantID, referenceDataURL+typ)
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected list reference data status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}

	var body apiReferenceDataListResponse
	decodeJSON(t, res, &body)
	return body
}

func assertReferenceDataContainsID(t *testing.T, rows []referenceDataDTO, id string, expected bool) {
	t.Helper()
	found := false
	for _, row := range rows {
		if row.ID == id {
			found = true
			break
		}
	}
	if found != expected {
		t.Fatalf("expected reference data id %q present=%t, got %t", id, expected, found)
	}
}

func createReferenceData(t *testing.T, server *fiber.App, typ string, payload map[string]any) apiReferenceDataResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, referenceDataURL+typ, payload)
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create reference data status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiReferenceDataResponse
	decodeJSON(t, res, &body)
	return body
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

func getJSON(t *testing.T, server *fiber.App, url string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, url, nil)
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	return res
}

func getJSONForTenant(t *testing.T, server *fiber.App, tenantID string, url string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("X-Tenant-ID", tenantID)
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	return res
}

func postJSONForTenant(t *testing.T, server *fiber.App, tenantID string, method string, url string, payload map[string]any) *http.Response {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	req := httptest.NewRequest(method, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", tenantID)

	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}

	return res
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
