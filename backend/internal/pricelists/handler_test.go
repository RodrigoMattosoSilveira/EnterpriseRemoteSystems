package pricelists_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v3"

	apppkg "enterpriseremotesystems/backend/internal/app"
)

const (
	priceListItemsURL = "/api/v1/price-list-items/"
	goldPricesURL     = "/api/v1/gold-prices/"
)

type apiErrorResponse struct {
	Data  json.RawMessage `json:"data"`
	Error *struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
}

type apiPriceListItemResponse struct {
	Data struct {
		ID           string  `json:"id"`
		TenantID     string  `json:"tenantId"`
		ItemType     string  `json:"itemType"`
		Code         string  `json:"code"`
		Description  string  `json:"description"`
		UnitPriceBRL float64 `json:"unitPriceBrl"`
		Active       bool    `json:"active"`
		SortOrder    int     `json:"sortOrder"`
	} `json:"data"`
}

type apiPriceListItemListResponse struct {
	Data []struct {
		ID           string  `json:"id"`
		TenantID     string  `json:"tenantId"`
		ItemType     string  `json:"itemType"`
		Code         string  `json:"code"`
		Description  string  `json:"description"`
		UnitPriceBRL float64 `json:"unitPriceBrl"`
		Active       bool    `json:"active"`
		SortOrder    int     `json:"sortOrder"`
	} `json:"data"`
}

type apiGoldPriceResponse struct {
	Data struct {
		ID         string  `json:"id"`
		TenantID   string  `json:"tenantId"`
		PriceDate  string  `json:"priceDate"`
		BRLPerGram float64 `json:"brlPerGram"`
		RecordedBy string  `json:"recordedBy"`
		Notes      string  `json:"notes"`
		Active     bool    `json:"active"`
	} `json:"data"`
}

type apiGoldPriceListResponse struct {
	Data []struct {
		ID         string  `json:"id"`
		PriceDate  string  `json:"priceDate"`
		BRLPerGram float64 `json:"brlPerGram"`
		Active     bool    `json:"active"`
	} `json:"data"`
}

func TestCreateAndListPriceListItems(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPriceListItem(t, server, validPriceListItemPayload(nil))

	if created.Data.TenantID != "default" {
		t.Fatalf("expected default tenant, got %q", created.Data.TenantID)
	}
	if created.Data.ItemType != "CANTEEN" || created.Data.Code != "LUNCH" || created.Data.Description != "Lunch" || created.Data.UnitPriceBRL != 42.5 || !created.Data.Active {
		t.Fatalf("unexpected created item: %+v", created.Data)
	}

	res := getJSON(t, server, priceListItemsURL+"?itemType=CANTEEN")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected list status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var list apiPriceListItemListResponse
	decodeJSON(t, res, &list)
	if len(list.Data) != 1 || list.Data[0].ID != created.Data.ID {
		t.Fatalf("expected list to include created item, got %+v", list.Data)
	}
}

func TestUpdateAndDeactivatePriceListItem(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	created := createPriceListItem(t, server, validPriceListItemPayload(nil))

	res := postJSON(t, server, http.MethodPatch, priceListItemsURL+created.Data.ID, validPriceListItemPayload(map[string]any{
		"description":  "Dinner",
		"unitPriceBrl": 55.0,
		"sortOrder":    20,
	}))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected update status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var updated apiPriceListItemResponse
	decodeJSON(t, res, &updated)
	if updated.Data.Description != "Dinner" || updated.Data.UnitPriceBRL != 55.0 || updated.Data.SortOrder != 20 {
		t.Fatalf("unexpected updated item: %+v", updated.Data)
	}

	res = postJSON(t, server, http.MethodPatch, priceListItemsURL+created.Data.ID+"/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}
	decodeJSON(t, res, &updated)
	if updated.Data.Active {
		t.Fatalf("expected item to be inactive: %+v", updated.Data)
	}

	res = getJSON(t, server, priceListItemsURL)
	defer res.Body.Close()
	var list apiPriceListItemListResponse
	decodeJSON(t, res, &list)
	if len(list.Data) != 0 {
		t.Fatalf("expected inactive item hidden from default list, got %+v", list.Data)
	}
}

func TestCreateGoldPriceAndLatestUsesMostRecentActiveDate(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	createGoldPrice(t, server, validGoldPricePayload(map[string]any{"priceDate": "2026-06-01", "brlPerGram": 500.0}))
	latest := createGoldPrice(t, server, validGoldPricePayload(map[string]any{"priceDate": "2026-06-02", "brlPerGram": 550.0}))

	res := getJSON(t, server, goldPricesURL+"latest")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected latest status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var body apiGoldPriceResponse
	decodeJSON(t, res, &body)
	if body.Data.ID != latest.Data.ID || body.Data.BRLPerGram != 550.0 || body.Data.PriceDate != "2026-06-02" {
		t.Fatalf("expected newest active gold price, got %+v", body.Data)
	}
}

func TestGoldPriceValidation(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postJSON(t, server, http.MethodPost, goldPricesURL, map[string]any{"priceDate": "bad", "brlPerGram": 0})
	defer res.Body.Close()
	assertValidationError(t, res, "priceDate", "Price date must be YYYY-MM-DD")
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

func createPriceListItem(t *testing.T, server *fiber.App, payload map[string]any) apiPriceListItemResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, priceListItemsURL, payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create item status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiPriceListItemResponse
	decodeJSON(t, res, &body)
	return body
}

func createGoldPrice(t *testing.T, server *fiber.App, payload map[string]any) apiGoldPriceResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, goldPricesURL, payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create gold price status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiGoldPriceResponse
	decodeJSON(t, res, &body)
	return body
}

func validPriceListItemPayload(overrides map[string]any) map[string]any {
	payload := map[string]any{
		"itemType":     "canteen",
		"code":         "lunch",
		"description":  "Lunch",
		"unitPriceBrl": 42.5,
		"sortOrder":    10,
	}
	for key, value := range overrides {
		payload[key] = value
	}
	return payload
}

func validGoldPricePayload(overrides map[string]any) map[string]any {
	payload := map[string]any{
		"priceDate":  "2026-06-01",
		"brlPerGram": 500.0,
		"recordedBy": "admin-user",
		"notes":      "Daily admin rate",
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
