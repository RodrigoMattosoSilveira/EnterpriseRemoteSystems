package pricelists_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"

	apppkg "enterpriseremotesystems/backend/internal/app"
	dbpkg "enterpriseremotesystems/backend/internal/db"
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
		ID                    string  `json:"id"`
		TenantID              string  `json:"tenantId"`
		PriceDate             string  `json:"priceDate"`
		BRLPerGram            float64 `json:"brlPerGram"`
		RecordedBy            string  `json:"recordedBy"`
		Notes                 string  `json:"notes"`
		Active                bool    `json:"active"`
		SupersededGoldPriceID string  `json:"supersededGoldPriceId"`
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

func TestUpdateDeactivateAndReactivatePriceListItem(t *testing.T) {
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

	res = getJSON(t, server, priceListItemsURL+"?includeInactive=true")
	defer res.Body.Close()
	decodeJSON(t, res, &list)
	if len(list.Data) != 1 || list.Data[0].ID != created.Data.ID || list.Data[0].Active {
		t.Fatalf("expected inactive item visible when requested, got %+v", list.Data)
	}

	res = postJSON(t, server, http.MethodPatch, priceListItemsURL+created.Data.ID+"/reactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected reactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}
	decodeJSON(t, res, &updated)
	if !updated.Data.Active {
		t.Fatalf("expected item to be active after reactivation: %+v", updated.Data)
	}

	res = getJSON(t, server, priceListItemsURL)
	defer res.Body.Close()
	decodeJSON(t, res, &list)
	if len(list.Data) != 1 || list.Data[0].ID != created.Data.ID || !list.Data[0].Active {
		t.Fatalf("expected reactivated item visible from default list, got %+v", list.Data)
	}
}

func TestListGoldPricesStartsEmpty(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := getJSON(t, server, goldPricesURL)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected list gold prices status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
	var body apiGoldPriceListResponse
	decodeJSON(t, res, &body)
	if len(body.Data) != 0 {
		t.Fatalf("expected empty gold price list, got %+v", body.Data)
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

	res = getJSON(t, server, goldPricesURL)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var errorBody apiErrorResponse
		decodeJSON(t, res, &errorBody)
		t.Fatalf("expected list gold prices status %d, got %d with error %+v", http.StatusOK, res.StatusCode, errorBody.Error)
	}
	var list apiGoldPriceListResponse
	decodeJSON(t, res, &list)
	if len(list.Data) != 2 || list.Data[0].PriceDate != "2026-06-02" || list.Data[1].PriceDate != "2026-06-01" {
		t.Fatalf("expected gold price list ordered by newest date, got %+v", list.Data)
	}
}

func TestCreateGoldPriceForExistingDateSupersedesExistingActivePrice(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	original := createGoldPrice(t, server, validGoldPricePayload(map[string]any{
		"priceDate":  "2026-06-03",
		"brlPerGram": 500.0,
		"notes":      "Original daily rate",
	}))
	replacement := createGoldPrice(t, server, validGoldPricePayload(map[string]any{
		"priceDate":  "2026-06-03",
		"brlPerGram": 525.25,
		"notes":      "Corrected daily rate",
	}))

	if replacement.Data.ID == original.Data.ID {
		t.Fatalf("expected replacement to create a new audit record, got same id %q", replacement.Data.ID)
	}
	if replacement.Data.SupersededGoldPriceID != original.Data.ID {
		t.Fatalf("expected replacement to report superseded id %q, got %q", original.Data.ID, replacement.Data.SupersededGoldPriceID)
	}

	res := getJSON(t, server, goldPricesURL+"latest")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected latest status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var latest apiGoldPriceResponse
	decodeJSON(t, res, &latest)
	if latest.Data.ID != replacement.Data.ID || latest.Data.BRLPerGram != 525.25 || !latest.Data.Active {
		t.Fatalf("expected replacement to be latest active gold price, got %+v", latest.Data)
	}

	res = getJSON(t, server, goldPricesURL)
	defer res.Body.Close()
	var activeList apiGoldPriceListResponse
	decodeJSON(t, res, &activeList)
	if len(activeList.Data) != 1 || activeList.Data[0].ID != replacement.Data.ID || !activeList.Data[0].Active {
		t.Fatalf("expected default list to include only replacement active record, got %+v", activeList.Data)
	}

	res = getJSON(t, server, goldPricesURL+"?includeInactive=true")
	defer res.Body.Close()
	var historyList apiGoldPriceListResponse
	decodeJSON(t, res, &historyList)
	if len(historyList.Data) != 2 {
		t.Fatalf("expected includeInactive list to preserve both audit records, got %+v", historyList.Data)
	}
	if historyList.Data[0].ID != replacement.Data.ID || !historyList.Data[0].Active {
		t.Fatalf("expected replacement to be first active history row, got %+v", historyList.Data)
	}
	if historyList.Data[1].ID != original.Data.ID || historyList.Data[1].Active {
		t.Fatalf("expected original row to be retained inactive, got %+v", historyList.Data)
	}
}

func TestGoldPriceDatabaseAllowsOnlyOneActivePricePerTenantDate(t *testing.T) {
	database, err := dbpkg.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := dbpkg.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	if err := dbpkg.SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	now := time.Now().UTC()
	first := dbpkg.GoldPrice{
		BaseModel:  dbpkg.BaseModel{ID: "gold-price-db-original", CreatedAt: now, UpdatedAt: now},
		TenantID:   dbpkg.DefaultTenantID,
		PriceDate:  "2026-06-04",
		BRLPerGram: 500,
		RecordedBy: "admin-user",
		Active:     true,
	}
	if err := database.Create(&first).Error; err != nil {
		t.Fatalf("create first active gold price: %v", err)
	}

	second := dbpkg.GoldPrice{
		BaseModel:  dbpkg.BaseModel{ID: "gold-price-db-conflict", CreatedAt: now, UpdatedAt: now},
		TenantID:   dbpkg.DefaultTenantID,
		PriceDate:  "2026-06-04",
		BRLPerGram: 525,
		RecordedBy: "admin-user",
		Active:     true,
	}
	if err := database.Create(&second).Error; err == nil {
		t.Fatal("expected database to reject two active gold prices for the same tenant/date")
	}

	if err := database.Model(&dbpkg.GoldPrice{}).
		Where("id = ?", first.ID).
		Update("active", false).Error; err != nil {
		t.Fatalf("deactivate first gold price: %v", err)
	}
	if err := database.Create(&second).Error; err != nil {
		t.Fatalf("expected database to allow inactive history plus one active replacement: %v", err)
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
