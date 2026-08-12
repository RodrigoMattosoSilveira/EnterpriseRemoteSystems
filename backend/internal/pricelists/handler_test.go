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
	"enterpriseremotesystems/backend/internal/authz"
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
		ID                        string  `json:"id"`
		TenantID                  string  `json:"tenantId"`
		ItemType                  string  `json:"itemType"`
		Code                      string  `json:"code"`
		Description               string  `json:"description"`
		UnitPriceBRL              float64 `json:"unitPriceBrl"`
		Active                    bool    `json:"active"`
		SortOrder                 int     `json:"sortOrder"`
		SupersededPriceListItemID string  `json:"supersededPriceListItemId"`
	} `json:"data"`
}

type apiPriceListItemListResponse struct {
	Data []struct {
		ID                        string  `json:"id"`
		TenantID                  string  `json:"tenantId"`
		ItemType                  string  `json:"itemType"`
		Code                      string  `json:"code"`
		Description               string  `json:"description"`
		UnitPriceBRL              float64 `json:"unitPriceBrl"`
		Active                    bool    `json:"active"`
		SortOrder                 int     `json:"sortOrder"`
		SupersededPriceListItemID string  `json:"supersededPriceListItemId"`
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

type apiTenantResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

type apiGoldPriceListResponse struct {
	Data []struct {
		ID         string  `json:"id"`
		TenantID   string  `json:"tenantId"`
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
	if updated.Data.ID == created.Data.ID {
		t.Fatalf("expected update to create a replacement audit record, got same id %q", updated.Data.ID)
	}
	if updated.Data.SupersededPriceListItemID != created.Data.ID {
		t.Fatalf("expected update to report superseded id %q, got %q", created.Data.ID, updated.Data.SupersededPriceListItemID)
	}
	if updated.Data.Description != "Dinner" || updated.Data.UnitPriceBRL != 55.0 || updated.Data.SortOrder != 20 || !updated.Data.Active {
		t.Fatalf("unexpected updated item: %+v", updated.Data)
	}

	res = postJSON(t, server, http.MethodPatch, priceListItemsURL+updated.Data.ID+"/deactivate", map[string]any{})
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
	if len(list.Data) != 2 {
		t.Fatalf("expected superseded and inactive replacement history visible when requested, got %+v", list.Data)
	}

	res = postJSON(t, server, http.MethodPatch, priceListItemsURL+updated.Data.ID+"/reactivate", map[string]any{})
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
	if len(list.Data) != 1 || list.Data[0].ID != updated.Data.ID || !list.Data[0].Active {
		t.Fatalf("expected reactivated item visible from default list, got %+v", list.Data)
	}
}

func TestUpdatePriceListItemSupersedesOriginalAndKeepsExpenseSnapshotsStable(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	original := createPriceListItem(t, server, validPriceListItemPayload(map[string]any{
		"code":         "canteen_history",
		"description":  "Original snack",
		"unitPriceBrl": 10.0,
	}))
	replacement := updatePriceListItem(t, server, original.Data.ID, validPriceListItemPayload(map[string]any{
		"code":         "canteen_history",
		"description":  "Updated snack",
		"unitPriceBrl": 12.5,
	}))

	if replacement.Data.ID == original.Data.ID {
		t.Fatalf("expected replacement row, got original id %q", replacement.Data.ID)
	}
	if replacement.Data.SupersededPriceListItemID != original.Data.ID {
		t.Fatalf("expected superseded id %q, got %q", original.Data.ID, replacement.Data.SupersededPriceListItemID)
	}

	res := getJSON(t, server, priceListItemsURL)
	defer res.Body.Close()
	var activeList apiPriceListItemListResponse
	decodeJSON(t, res, &activeList)
	if len(activeList.Data) != 1 || activeList.Data[0].ID != replacement.Data.ID || !activeList.Data[0].Active {
		t.Fatalf("expected default list to include only active replacement, got %+v", activeList.Data)
	}

	res = getJSON(t, server, priceListItemsURL+"?includeInactive=true")
	defer res.Body.Close()
	var historyList apiPriceListItemListResponse
	decodeJSON(t, res, &historyList)
	if len(historyList.Data) != 2 {
		t.Fatalf("expected includeInactive list to preserve both audit records, got %+v", historyList.Data)
	}
	if !containsPriceListItem(historyList.Data, replacement.Data.ID, true) || !containsPriceListItem(historyList.Data, original.Data.ID, false) {
		t.Fatalf("expected replacement active and original inactive, got %+v", historyList.Data)
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

func TestPriceListItemsAndGoldPricesAreScopedBySelectedTenant(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	tenantResponse := requestJSONWithTenant(t, server, http.MethodPost, "/api/v1/tenants", "", map[string]any{
		"code":        "PRICE-GOLD-SECONDARY",
		"name":        "Price and Gold Secondary Tenant",
		"description": "Tenant-isolation test fixture",
		"active":      true,
	})
	defer tenantResponse.Body.Close()
	if tenantResponse.StatusCode != http.StatusCreated {
		t.Fatalf("expected secondary tenant create status %d, got %d", http.StatusCreated, tenantResponse.StatusCode)
	}
	var tenantBody apiTenantResponse
	decodeJSON(t, tenantResponse, &tenantBody)
	secondaryTenantID := tenantBody.Data.ID
	if secondaryTenantID == "" {
		t.Fatal("expected secondary tenant id")
	}

	defaultItem := createPriceListItem(t, server, validPriceListItemPayload(map[string]any{
		"code":        "TENANT_SCOPE_ITEM",
		"description": "Default tenant item",
	}))
	secondaryItemResponse := requestJSONWithTenant(t, server, http.MethodPost, priceListItemsURL, secondaryTenantID, validPriceListItemPayload(map[string]any{
		"code":        "TENANT_SCOPE_ITEM",
		"description": "Secondary tenant item",
	}))
	defer secondaryItemResponse.Body.Close()
	if secondaryItemResponse.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, secondaryItemResponse, &body)
		t.Fatalf("expected same item code to be allowed in another tenant, got %d with error %+v", secondaryItemResponse.StatusCode, body.Error)
	}
	var secondaryItem apiPriceListItemResponse
	decodeJSON(t, secondaryItemResponse, &secondaryItem)
	if secondaryItem.Data.TenantID != secondaryTenantID {
		t.Fatalf("expected secondary item tenant %q, got %q", secondaryTenantID, secondaryItem.Data.TenantID)
	}

	secondaryItemsResponse := requestJSONWithTenant(t, server, http.MethodGet, priceListItemsURL+"?includeInactive=true", secondaryTenantID, nil)
	defer secondaryItemsResponse.Body.Close()
	if secondaryItemsResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected secondary item list status %d, got %d", http.StatusOK, secondaryItemsResponse.StatusCode)
	}
	var secondaryItems apiPriceListItemListResponse
	decodeJSON(t, secondaryItemsResponse, &secondaryItems)
	if !containsPriceListItem(secondaryItems.Data, secondaryItem.Data.ID, true) {
		t.Fatalf("expected secondary item in selected tenant list, got %+v", secondaryItems.Data)
	}
	for _, row := range secondaryItems.Data {
		if row.TenantID != secondaryTenantID {
			t.Fatalf("expected only secondary-tenant price-list items, got %+v", row)
		}
		if row.ID == defaultItem.Data.ID {
			t.Fatalf("default-tenant price-list item leaked into secondary tenant: %+v", row)
		}
	}

	crossTenantUpdate := requestJSONWithTenant(t, server, http.MethodPatch, priceListItemsURL+defaultItem.Data.ID, secondaryTenantID, validPriceListItemPayload(map[string]any{
		"code":        "TENANT_SCOPE_ITEM",
		"description": "Cross-tenant update must fail",
	}))
	defer crossTenantUpdate.Body.Close()
	if crossTenantUpdate.StatusCode != http.StatusNotFound {
		t.Fatalf("expected cross-tenant item update status %d, got %d", http.StatusNotFound, crossTenantUpdate.StatusCode)
	}

	const sharedPriceDate = "2099-12-31"
	defaultGoldPrice := createGoldPrice(t, server, validGoldPricePayload(map[string]any{
		"priceDate":  sharedPriceDate,
		"brlPerGram": 777.11,
		"notes":      "Default tenant gold price",
	}))
	secondaryGoldResponse := requestJSONWithTenant(t, server, http.MethodPost, goldPricesURL, secondaryTenantID, validGoldPricePayload(map[string]any{
		"priceDate":  sharedPriceDate,
		"brlPerGram": 888.22,
		"notes":      "Secondary tenant gold price",
	}))
	defer secondaryGoldResponse.Body.Close()
	if secondaryGoldResponse.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, secondaryGoldResponse, &body)
		t.Fatalf("expected same gold-price date to be allowed in another tenant, got %d with error %+v", secondaryGoldResponse.StatusCode, body.Error)
	}
	var secondaryGold apiGoldPriceResponse
	decodeJSON(t, secondaryGoldResponse, &secondaryGold)
	if secondaryGold.Data.TenantID != secondaryTenantID {
		t.Fatalf("expected secondary gold-price tenant %q, got %q", secondaryTenantID, secondaryGold.Data.TenantID)
	}

	secondaryGoldListResponse := requestJSONWithTenant(t, server, http.MethodGet, goldPricesURL+"?includeInactive=true", secondaryTenantID, nil)
	defer secondaryGoldListResponse.Body.Close()
	if secondaryGoldListResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected secondary gold-price list status %d, got %d", http.StatusOK, secondaryGoldListResponse.StatusCode)
	}
	var secondaryGoldList apiGoldPriceListResponse
	decodeJSON(t, secondaryGoldListResponse, &secondaryGoldList)
	if len(secondaryGoldList.Data) != 1 || secondaryGoldList.Data[0].ID != secondaryGold.Data.ID {
		t.Fatalf("expected only secondary gold price, got %+v", secondaryGoldList.Data)
	}
	for _, row := range secondaryGoldList.Data {
		if row.TenantID != secondaryTenantID {
			t.Fatalf("expected only secondary-tenant gold prices, got %+v", row)
		}
		if row.ID == defaultGoldPrice.Data.ID {
			t.Fatalf("default-tenant gold price leaked into secondary tenant: %+v", row)
		}
	}

	latestSecondaryResponse := requestJSONWithTenant(t, server, http.MethodGet, goldPricesURL+"latest", secondaryTenantID, nil)
	defer latestSecondaryResponse.Body.Close()
	if latestSecondaryResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected latest secondary gold-price status %d, got %d", http.StatusOK, latestSecondaryResponse.StatusCode)
	}
	var latestSecondary apiGoldPriceResponse
	decodeJSON(t, latestSecondaryResponse, &latestSecondary)
	if latestSecondary.Data.ID != secondaryGold.Data.ID || latestSecondary.Data.TenantID != secondaryTenantID {
		t.Fatalf("expected latest gold price from selected tenant, got %+v", latestSecondary.Data)
	}

	crossTenantDeactivate := requestJSONWithTenant(t, server, http.MethodPatch, goldPricesURL+defaultGoldPrice.Data.ID+"/deactivate", secondaryTenantID, map[string]any{})
	defer crossTenantDeactivate.Body.Close()
	if crossTenantDeactivate.StatusCode != http.StatusNotFound {
		t.Fatalf("expected cross-tenant gold-price deactivate status %d, got %d", http.StatusNotFound, crossTenantDeactivate.StatusCode)
	}
}

func TestPriceListItemDatabaseAllowsHistoryButOnlyOneActiveItemPerCode(t *testing.T) {
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
	first := dbpkg.ExpensePriceListItem{
		BaseModel:    dbpkg.BaseModel{ID: "price-item-db-original", CreatedAt: now, UpdatedAt: now},
		TenantID:     dbpkg.DefaultTenantID,
		ItemType:     "CANTEEN",
		Code:         "DB_HISTORY_SNACK",
		Description:  "Original snack",
		UnitPriceBRL: 10,
		Active:       true,
		SortOrder:    10,
	}
	if err := database.Create(&first).Error; err != nil {
		t.Fatalf("create first price-list item: %v", err)
	}

	conflict := dbpkg.ExpensePriceListItem{
		BaseModel:    dbpkg.BaseModel{ID: "price-item-db-conflict", CreatedAt: now.Add(time.Second), UpdatedAt: now.Add(time.Second)},
		TenantID:     dbpkg.DefaultTenantID,
		ItemType:     "CANTEEN",
		Code:         "DB_HISTORY_SNACK",
		Description:  "Conflicting active snack",
		UnitPriceBRL: 11,
		Active:       true,
		SortOrder:    20,
	}
	if err := database.Create(&conflict).Error; err == nil {
		t.Fatal("expected database to reject two active price-list items for the same tenant/type/code")
	}

	supersededID := first.ID
	replacement := dbpkg.ExpensePriceListItem{
		BaseModel:                 dbpkg.BaseModel{ID: "price-item-db-replacement", CreatedAt: now.Add(2 * time.Second), UpdatedAt: now.Add(2 * time.Second)},
		TenantID:                  dbpkg.DefaultTenantID,
		ItemType:                  "CANTEEN",
		Code:                      "DB_HISTORY_SNACK",
		Description:               "Replacement snack",
		UnitPriceBRL:              12,
		Active:                    true,
		SortOrder:                 10,
		SupersededPriceListItemID: &supersededID,
	}
	if err := database.Model(&dbpkg.ExpensePriceListItem{}).
		Where("id = ?", first.ID).
		Update("active", false).Error; err != nil {
		t.Fatalf("deactivate first price-list item: %v", err)
	}
	if err := database.Create(&replacement).Error; err != nil {
		t.Fatalf("expected database to allow inactive history plus one active replacement: %v", err)
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

func updatePriceListItem(t *testing.T, server *fiber.App, id string, payload map[string]any) apiPriceListItemResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPatch, priceListItemsURL+id, payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected update item status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
	var body apiPriceListItemResponse
	decodeJSON(t, res, &body)
	return body
}

func containsPriceListItem(rows []struct {
	ID                        string  `json:"id"`
	TenantID                  string  `json:"tenantId"`
	ItemType                  string  `json:"itemType"`
	Code                      string  `json:"code"`
	Description               string  `json:"description"`
	UnitPriceBRL              float64 `json:"unitPriceBrl"`
	Active                    bool    `json:"active"`
	SortOrder                 int     `json:"sortOrder"`
	SupersededPriceListItemID string  `json:"supersededPriceListItemId"`
}, id string, active bool) bool {
	for _, row := range rows {
		if row.ID == id && row.Active == active {
			return true
		}
	}
	return false
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

func requestJSONWithTenant(t *testing.T, server *fiber.App, method string, url string, tenantID string, payload map[string]any) *http.Response {
	t.Helper()
	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(encoded)
	}
	req := httptest.NewRequest(method, url, body)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if tenantID != "" {
		req.Header.Set(authz.HeaderTenantID, tenantID)
	}
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
