package expenses_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"

	apppkg "enterpriseremotesystems/backend/internal/app"
	dbpkg "enterpriseremotesystems/backend/internal/db"
)

const (
	peopleURL         = "/api/v1/people/"
	collaboratorsURL  = "/api/v1/collaborators/"
	expensesURL       = "/api/v1/expenses/"
	priceListItemsURL = "/api/v1/price-list-items/"
	goldPricesURL     = "/api/v1/gold-prices/"
	testDateLayout    = "2006-01-02"
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
		ID                     string   `json:"id"`
		TenantID               string   `json:"tenantId"`
		CollaboratorID         string   `json:"collaboratorId"`
		CollaboratorLabel      string   `json:"collaboratorLabel"`
		ExpenseCategoryID      string   `json:"expenseCategoryId"`
		ExpenseCategoryLabel   string   `json:"expenseCategoryLabel"`
		ValueUnitID            string   `json:"valueUnitId"`
		ValueUnitLabel         string   `json:"valueUnitLabel"`
		Amount                 float64  `json:"amount"`
		ExpenseDate            string   `json:"expenseDate"`
		Description            string   `json:"description"`
		Active                 bool     `json:"active"`
		PriceListItemID        *string  `json:"priceListItemId"`
		PriceListItemCode      string   `json:"priceListItemCode"`
		ItemType               string   `json:"itemType"`
		ItemDescription        string   `json:"itemDescription"`
		Quantity               *float64 `json:"quantity"`
		UnitPriceBRL           *float64 `json:"unitPriceBrl"`
		CurrencyCode           string   `json:"currencyCode"`
		GoldPriceID            *string  `json:"goldPriceId"`
		GoldBRLPerGram         *float64 `json:"goldBrlPerGram"`
		GoldPriceDate          string   `json:"goldPriceDate"`
		UnitPriceAmount        *float64 `json:"unitPriceAmount"`
		TotalAmount            *float64 `json:"totalAmount"`
		CalculationMethod      string   `json:"calculationMethod"`
		CalculationDetailsJSON string   `json:"calculationDetailsJson"`
		FinancialPosting       *struct {
			LedgerEntryID      string  `json:"ledgerEntryId"`
			Direction          string  `json:"direction"`
			EntryType          string  `json:"entryType"`
			Amount             float64 `json:"amount"`
			SignedAmount       float64 `json:"signedAmount"`
			EffectiveDate      string  `json:"effectiveDate"`
			ValueUnitID        string  `json:"valueUnitId"`
			ValueUnitCode      string  `json:"valueUnitCode"`
			ValueUnitLabel     string  `json:"valueUnitLabel"`
			SourceType         string  `json:"sourceType"`
			SourceID           string  `json:"sourceId"`
			CorrectionType     string  `json:"correctionType"`
			ReceiptID          string  `json:"receiptId"`
			ReceiptNumber      string  `json:"receiptNumber"`
			ReceiptStatus      string  `json:"receiptStatus"`
			OutstandingReceipt bool    `json:"outstandingReceipt"`
		} `json:"financialPosting"`
	} `json:"data"`
}

type apiExpenseListItem struct {
	ID                string  `json:"id"`
	CollaboratorID    string  `json:"collaboratorId"`
	ExpenseCategoryID string  `json:"expenseCategoryId"`
	ValueUnitID       string  `json:"valueUnitId"`
	Amount            float64 `json:"amount"`
	ExpenseDate       string  `json:"expenseDate"`
	Active            bool    `json:"active"`
	PriceListItemCode string  `json:"priceListItemCode"`
	CalculationMethod string  `json:"calculationMethod"`
	FinancialPosting  *struct {
		LedgerEntryID      string  `json:"ledgerEntryId"`
		Direction          string  `json:"direction"`
		EntryType          string  `json:"entryType"`
		Amount             float64 `json:"amount"`
		SignedAmount       float64 `json:"signedAmount"`
		EffectiveDate      string  `json:"effectiveDate"`
		ValueUnitID        string  `json:"valueUnitId"`
		ValueUnitCode      string  `json:"valueUnitCode"`
		ValueUnitLabel     string  `json:"valueUnitLabel"`
		SourceType         string  `json:"sourceType"`
		SourceID           string  `json:"sourceId"`
		CorrectionType     string  `json:"correctionType"`
		ReceiptID          string  `json:"receiptId"`
		ReceiptNumber      string  `json:"receiptNumber"`
		ReceiptStatus      string  `json:"receiptStatus"`
		OutstandingReceipt bool    `json:"outstandingReceipt"`
	} `json:"financialPosting"`
}

type apiExpenseListResponse struct {
	Data struct {
		Items    []apiExpenseListItem `json:"items"`
		Total    int                  `json:"total"`
		Page     int                  `json:"page"`
		PageSize int                  `json:"pageSize"`
	} `json:"data"`
}

type apiPriceListItemResponse struct {
	Data struct {
		ID           string  `json:"id"`
		ItemType     string  `json:"itemType"`
		Code         string  `json:"code"`
		Description  string  `json:"description"`
		UnitPriceBRL float64 `json:"unitPriceBrl"`
	} `json:"data"`
}

type apiGoldPriceResponse struct {
	Data struct {
		ID         string  `json:"id"`
		PriceDate  string  `json:"priceDate"`
		BRLPerGram float64 `json:"brlPerGram"`
	} `json:"data"`
}

func TestCreateExpenseReturnsCreated(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)

	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, nil))
	defer res.Body.Close()

	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}

	var body apiExpenseResponse
	decodeJSON(t, res, &body)

	if body.Data.ID == "" {
		t.Fatal("expected expense id")
	}
	if body.Data.TenantID != "default" {
		t.Fatalf("expected tenantId default, got %q", body.Data.TenantID)
	}
	if body.Data.CollaboratorID != collaborator.Data.ID {
		t.Fatalf("expected collaborator id %q, got %q", collaborator.Data.ID, body.Data.CollaboratorID)
	}
	if body.Data.CollaboratorLabel != "P1" {
		t.Fatalf("expected collaborator label P1, got %q", body.Data.CollaboratorLabel)
	}
	if body.Data.ExpenseCategoryID != "ref-expense-category-canteen" {
		t.Fatalf("expected canteen category, got %q", body.Data.ExpenseCategoryID)
	}
	if body.Data.ExpenseCategoryLabel != "Canteen" {
		t.Fatalf("expected Canteen label, got %q", body.Data.ExpenseCategoryLabel)
	}
	if body.Data.ValueUnitID != "ref-value-unit-brl" {
		t.Fatalf("expected BRL value unit, got %q", body.Data.ValueUnitID)
	}
	if body.Data.ValueUnitLabel != "Brazilian Real" {
		t.Fatalf("expected Brazilian Real label, got %q", body.Data.ValueUnitLabel)
	}
	if body.Data.Amount != 42.5 {
		t.Fatalf("expected amount 42.5, got %f", body.Data.Amount)
	}
	if body.Data.ExpenseDate != "2026-06-03" {
		t.Fatalf("expected expense date 2026-06-03, got %q", body.Data.ExpenseDate)
	}
	if body.Data.Description != "Lunch at canteen" {
		t.Fatalf("expected description, got %q", body.Data.Description)
	}
	if !body.Data.Active {
		t.Fatal("expected created expense to be active")
	}
	if body.Data.CalculationMethod != "LEGACY_DIRECT_ENTRY" {
		t.Fatalf("expected legacy calculation method, got %q", body.Data.CalculationMethod)
	}
	if body.Data.PriceListItemID != nil {
		t.Fatalf("expected legacy expense not to invent a price-list item id, got %#v", body.Data.PriceListItemID)
	}
	if body.Data.PriceListItemCode != "LEGACY_CANTEEN_DIRECT_ENTRY" || body.Data.ItemType != "CANTEEN" {
		t.Fatalf("expected legacy canteen snapshot, got code=%q itemType=%q", body.Data.PriceListItemCode, body.Data.ItemType)
	}
	assertFloatPointer(t, body.Data.Quantity, 1.0, "quantity")
	assertFloatPointer(t, body.Data.UnitPriceBRL, 42.5, "unitPriceBrl")
	assertFloatPointer(t, body.Data.UnitPriceAmount, 42.5, "unitPriceAmount")
	assertFloatPointer(t, body.Data.TotalAmount, 42.5, "totalAmount")
	assertCalculationDetail(t, body.Data.CalculationDetailsJSON, "source", "legacy_direct_entry_api")
	assertCalculationDetail(t, body.Data.CalculationDetailsJSON, "legacyExpenseCategoryCode", "CANTEEN")
}

func TestCreatePriceListExpenseInBRLCalculatesAndStoresAuditFields(t *testing.T) {
	server, database, cleanup := newTestServerWithDatabase(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	item := createPriceListItem(t, server, validPriceListItemPayload(map[string]any{
		"itemType":     "CANTEEN",
		"code":         "LUNCH",
		"description":  "Lunch plate",
		"unitPriceBrl": 25.0,
	}))

	expense := createExpense(t, server, map[string]any{
		"collaboratorId":  collaborator.Data.ID,
		"priceListItemId": item.Data.ID,
		"currencyCode":    "BRL",
		"quantity":        3.0,
		"expenseDate":     "2026-06-03",
	})

	if expense.Data.ExpenseCategoryID != "ref-expense-category-canteen" {
		t.Fatalf("expected canteen category, got %q", expense.Data.ExpenseCategoryID)
	}
	if expense.Data.ValueUnitID != "ref-value-unit-brl" || expense.Data.CurrencyCode != "BRL" {
		t.Fatalf("expected BRL value unit/currency, got valueUnit=%q currency=%q", expense.Data.ValueUnitID, expense.Data.CurrencyCode)
	}
	if expense.Data.PriceListItemID == nil || *expense.Data.PriceListItemID != item.Data.ID {
		t.Fatalf("expected price list item id %q, got %#v", item.Data.ID, expense.Data.PriceListItemID)
	}
	if expense.Data.PriceListItemCode != "LUNCH" || expense.Data.ItemType != "CANTEEN" || expense.Data.ItemDescription != "Lunch plate" {
		t.Fatalf("expected item snapshot, got code=%q type=%q description=%q", expense.Data.PriceListItemCode, expense.Data.ItemType, expense.Data.ItemDescription)
	}
	if expense.Data.CalculationMethod != "BRL_PRICE_LIST" {
		t.Fatalf("expected BRL calculation method, got %q", expense.Data.CalculationMethod)
	}
	assertFloatPointer(t, expense.Data.Quantity, 3.0, "quantity")
	assertFloatPointer(t, expense.Data.UnitPriceBRL, 25.0, "unitPriceBrl")
	assertFloatPointer(t, expense.Data.UnitPriceAmount, 25.0, "unitPriceAmount")
	assertFloatPointer(t, expense.Data.TotalAmount, 75.0, "totalAmount")
	if expense.Data.Amount != 75.0 {
		t.Fatalf("expected ledger amount 75.0, got %f", expense.Data.Amount)
	}
	assertCalculationDetail(t, expense.Data.CalculationDetailsJSON, "itemCode", "LUNCH")
	assertCalculationDetail(t, expense.Data.CalculationDetailsJSON, "calculationMethod", "BRL_PRICE_LIST")
	assertExpenseLedgerPosting(t, database, expense.Data.ID, collaborator.Data.ID, "ref-value-unit-brl", 75.0, "2026-06-03")
	assertExpenseFinancialPosting(t, expense, collaborator.Data.ID, "ref-value-unit-brl", "BRL", 75.0, "2026-06-03")
}

func TestCreatePriceListExpenseInGoldUsesLatestGoldPrice(t *testing.T) {
	server, database, cleanup := newTestServerWithDatabase(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	item := createPriceListItem(t, server, validPriceListItemPayload(map[string]any{
		"itemType":     "ADMINISTRATIVE",
		"code":         "BOOTS",
		"description":  "Work boots",
		"unitPriceBrl": 100.0,
	}))
	createGoldPrice(t, server, validGoldPricePayload(map[string]any{"priceDate": "2026-06-01", "brlPerGram": 400.0}))
	gold := createGoldPrice(t, server, validGoldPricePayload(map[string]any{"priceDate": "2026-06-02", "brlPerGram": 500.0}))

	expense := createExpense(t, server, map[string]any{
		"collaboratorId":  collaborator.Data.ID,
		"priceListItemId": item.Data.ID,
		"currencyCode":    "GOLD_GRAM",
		"quantity":        2.0,
		"expenseDate":     "2026-06-03",
	})

	if expense.Data.ExpenseCategoryID != "ref-expense-category-administrative" {
		t.Fatalf("expected administrative category, got %q", expense.Data.ExpenseCategoryID)
	}
	if expense.Data.ValueUnitID != "ref-value-unit-gold-gram" || expense.Data.CurrencyCode != "GOLD_GRAM" {
		t.Fatalf("expected gold value unit/currency, got valueUnit=%q currency=%q", expense.Data.ValueUnitID, expense.Data.CurrencyCode)
	}
	if expense.Data.GoldPriceID == nil || *expense.Data.GoldPriceID != gold.Data.ID {
		t.Fatalf("expected latest gold price id %q, got %#v", gold.Data.ID, expense.Data.GoldPriceID)
	}
	assertFloatPointer(t, expense.Data.GoldBRLPerGram, 500.0, "goldBrlPerGram")
	if expense.Data.GoldPriceDate != "2026-06-02" {
		t.Fatalf("expected gold price date snapshot 2026-06-02, got %q", expense.Data.GoldPriceDate)
	}
	if expense.Data.CalculationMethod != "BRL_TO_GOLD_GRAM_LATEST_PRICE" {
		t.Fatalf("expected gold calculation method, got %q", expense.Data.CalculationMethod)
	}
	assertFloatPointer(t, expense.Data.UnitPriceAmount, 0.2, "unitPriceAmount")
	assertFloatPointer(t, expense.Data.TotalAmount, 0.4, "totalAmount")
	if expense.Data.Amount != 0.4 {
		t.Fatalf("expected ledger amount 0.4 grams, got %f", expense.Data.Amount)
	}
	assertCalculationDetail(t, expense.Data.CalculationDetailsJSON, "goldPriceDate", "2026-06-02")
	assertCalculationDetail(t, expense.Data.CalculationDetailsJSON, "calculationMethod", "BRL_TO_GOLD_GRAM_LATEST_PRICE")
	assertExpenseLedgerPosting(t, database, expense.Data.ID, collaborator.Data.ID, "ref-value-unit-gold-gram", 0.4, "2026-06-03")
}

func TestCreatePriceListExpenseRejectsDerivedLegacyFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	item := createPriceListItem(t, server, validPriceListItemPayload(nil))

	res := postJSON(t, server, http.MethodPost, expensesURL, map[string]any{
		"collaboratorId":    collaborator.Data.ID,
		"priceListItemId":   item.Data.ID,
		"currencyCode":      "BRL",
		"quantity":          1.0,
		"expenseDate":       "2026-06-03",
		"expenseCategoryId": "ref-expense-category-canteen",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            42.5,
	})
	defer res.Body.Close()

	assertValidationError(t, res, "expenseCategoryId", "Expense category is derived from the price list item")
}

func TestCreatePriceListGoldExpenseRequiresGoldPrice(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	item := createPriceListItem(t, server, validPriceListItemPayload(nil))

	res := postJSON(t, server, http.MethodPost, expensesURL, map[string]any{
		"collaboratorId":  collaborator.Data.ID,
		"priceListItemId": item.Data.ID,
		"currencyCode":    "GOLD_GRAM",
		"quantity":        1.0,
		"expenseDate":     "2026-06-03",
	})
	defer res.Body.Close()

	assertValidationError(t, res, "currencyCode", "A current gold price is required for GOLD_GRAM expenses")
}

func TestListAndGetExpenseReturnCreatedExpense(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := getJSON(t, server, expensesURL)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected list status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var listBody apiExpenseListResponse
	decodeJSON(t, res, &listBody)
	if listBody.Data.Total != 1 || len(listBody.Data.Items) != 1 {
		t.Fatalf("expected one expense, got total=%d len=%d", listBody.Data.Total, len(listBody.Data.Items))
	}
	if listBody.Data.Items[0].ID != expense.Data.ID {
		t.Fatalf("expected listed expense id %q, got %q", expense.Data.ID, listBody.Data.Items[0].ID)
	}
	if listBody.Data.Items[0].FinancialPosting == nil || listBody.Data.Items[0].FinancialPosting.ReceiptStatus != "PENDING_ISSUE" {
		t.Fatalf("expected list expense to include pending receipt posting, got %+v", listBody.Data.Items[0].FinancialPosting)
	}

	res = getJSON(t, server, expensesURL+expense.Data.ID)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected get status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var getBody apiExpenseResponse
	decodeJSON(t, res, &getBody)
	if getBody.Data.ID != expense.Data.ID {
		t.Fatalf("expected expense id %q, got %q", expense.Data.ID, getBody.Data.ID)
	}
	if getBody.Data.FinancialPosting == nil || getBody.Data.FinancialPosting.ReceiptStatus != "PENDING_ISSUE" {
		t.Fatalf("expected get expense to include pending receipt posting, got %+v", getBody.Data.FinancialPosting)
	}
}

func TestListExpenseFiltersAndPagination(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaboratorOne := createActiveCollaborator(t, server, 1)
	collaboratorTwo := createActiveCollaborator(t, server, 2)

	first := createExpense(t, server, validExpensePayload(collaboratorOne.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-canteen",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            10.0,
		"expenseDate":       "2026-06-01",
	}))
	second := createExpense(t, server, validExpensePayload(collaboratorTwo.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-flight",
		"valueUnitId":       "ref-value-unit-gold-gram",
		"amount":            2.5,
		"expenseDate":       "2026-06-02",
	}))
	createExpense(t, server, validExpensePayload(collaboratorOne.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-cargo",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            30.0,
		"expenseDate":       "2026-06-10",
	}))

	res := getJSON(t, server, expensesURL+"?collaboratorId="+collaboratorOne.Data.ID+"&dateFrom=2026-06-01&dateTo=2026-06-02")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected list filter status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var filtered apiExpenseListResponse
	decodeJSON(t, res, &filtered)
	if filtered.Data.Total != 1 || len(filtered.Data.Items) != 1 || filtered.Data.Items[0].ID != first.Data.ID {
		t.Fatalf("expected only first expense after collaborator/date filter, got total=%d items=%+v", filtered.Data.Total, filtered.Data.Items)
	}

	res = getJSON(t, server, expensesURL+"?expenseCategoryId=ref-expense-category-flight&valueUnitId=ref-value-unit-gold-gram")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected category/value-unit filter status %d, got %d", http.StatusOK, res.StatusCode)
	}
	decodeJSON(t, res, &filtered)
	if filtered.Data.Total != 1 || len(filtered.Data.Items) != 1 || filtered.Data.Items[0].ID != second.Data.ID {
		t.Fatalf("expected only second expense after category/value-unit filter, got total=%d items=%+v", filtered.Data.Total, filtered.Data.Items)
	}

	res = getJSON(t, server, expensesURL+"?page=2&pageSize=1")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected paginated list status %d, got %d", http.StatusOK, res.StatusCode)
	}
	decodeJSON(t, res, &filtered)
	if filtered.Data.Total != 3 || filtered.Data.Page != 2 || filtered.Data.PageSize != 1 || len(filtered.Data.Items) != 1 {
		t.Fatalf("expected page 2 with one item over total 3, got %+v", filtered.Data)
	}
}

func TestListExpenseFiltersByCollaboratorNameOrNickname(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	mineiroPerson := createPerson(t, server, validCompletePersonPayload(21, map[string]any{
		"firstName": "Bruno",
		"lastName":  "Costa",
		"nickname":  "Mineiro",
	}))
	serraPerson := createPerson(t, server, validCompletePersonPayload(22, map[string]any{
		"firstName": "Carla",
		"lastName":  "Serra",
		"nickname":  "CSerra",
	}))
	mineiroCollaborator := createCollaborator(t, server, validCollaboratorPayload(mineiroPerson.Data.ID, nil))
	serraCollaborator := createCollaborator(t, server, validCollaboratorPayload(serraPerson.Data.ID, nil))

	mineiroExpense := createExpense(t, server, validExpensePayload(mineiroCollaborator.Data.ID, map[string]any{
		"expenseDate": "2026-06-11",
		"description": "Mineiro collaborator search expense",
	}))
	serraExpense := createExpense(t, server, validExpensePayload(serraCollaborator.Data.ID, map[string]any{
		"expenseDate": "2026-06-12",
		"description": "Serra collaborator search expense",
	}))

	res := getJSON(t, server, expensesURL+"?collaboratorSearch="+url.QueryEscape("mineiro"))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected nickname filter status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var filtered apiExpenseListResponse
	decodeJSON(t, res, &filtered)
	if filtered.Data.Total != 1 || len(filtered.Data.Items) != 1 || filtered.Data.Items[0].ID != mineiroExpense.Data.ID {
		t.Fatalf("expected nickname search to return only Mineiro expense, got total=%d items=%+v", filtered.Data.Total, filtered.Data.Items)
	}

	res = getJSON(t, server, expensesURL+"?collaboratorSearch="+url.QueryEscape("Carla Serra"))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected legal-name filter status %d, got %d", http.StatusOK, res.StatusCode)
	}
	decodeJSON(t, res, &filtered)
	if filtered.Data.Total != 1 || len(filtered.Data.Items) != 1 || filtered.Data.Items[0].ID != serraExpense.Data.ID {
		t.Fatalf("expected legal-name search to return only Serra expense, got total=%d items=%+v", filtered.Data.Total, filtered.Data.Items)
	}

	res = getJSON(t, server, expensesURL+"?collaboratorSearch="+url.QueryEscape("ser"))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected last-name prefix filter status %d, got %d", http.StatusOK, res.StatusCode)
	}
	decodeJSON(t, res, &filtered)
	if filtered.Data.Total != 1 || len(filtered.Data.Items) != 1 || filtered.Data.Items[0].ID != serraExpense.Data.ID {
		t.Fatalf("expected last-name prefix search to return only Serra expense, got total=%d items=%+v", filtered.Data.Total, filtered.Data.Items)
	}

	res = getJSON(t, server, expensesURL+"?collaboratorSearch="+url.QueryEscape("ineiro"))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected non-prefix search status %d, got %d", http.StatusOK, res.StatusCode)
	}
	decodeJSON(t, res, &filtered)
	if filtered.Data.Total != 0 || len(filtered.Data.Items) != 0 {
		t.Fatalf("expected non-prefix search not to match Mineiro expense, got total=%d items=%+v", filtered.Data.Total, filtered.Data.Items)
	}
}

func TestListExpenseFiltersByItemTypeIncludesPriceListAndLegacyCanteenRows(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	legacyCanteen := createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-canteen",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            12.0,
		"expenseDate":       "2026-06-01",
		"description":       "Legacy canteen row",
	}))
	legacyFlight := createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-flight",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            99.0,
		"expenseDate":       "2026-06-01",
		"description":       "Legacy flight row",
	}))

	canteenItem := createPriceListItem(t, server, validPriceListItemPayload(map[string]any{
		"itemType":     "CANTEEN",
		"code":         "FILTER_CANTEEN",
		"description":  "Filter canteen item",
		"unitPriceBrl": 10.0,
	}))
	priceListCanteen := createExpense(t, server, map[string]any{
		"collaboratorId":  collaborator.Data.ID,
		"priceListItemId": canteenItem.Data.ID,
		"currencyCode":    "BRL",
		"quantity":        1.0,
		"expenseDate":     "2026-06-02",
		"description":     "Price-list canteen row",
	})

	adminItem := createPriceListItem(t, server, validPriceListItemPayload(map[string]any{
		"itemType":     "ADMINISTRATIVE",
		"code":         "FILTER_ADMIN",
		"description":  "Filter administrative item",
		"unitPriceBrl": 25.0,
	}))
	priceListAdmin := createExpense(t, server, map[string]any{
		"collaboratorId":  collaborator.Data.ID,
		"priceListItemId": adminItem.Data.ID,
		"currencyCode":    "BRL",
		"quantity":        1.0,
		"expenseDate":     "2026-06-03",
		"description":     "Price-list administrative row",
	})

	res := getJSON(t, server, expensesURL+"?itemType=CANTEEN&pageSize=50")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected item-type filter status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var filtered apiExpenseListResponse
	decodeJSON(t, res, &filtered)

	if filtered.Data.Total != 2 || len(filtered.Data.Items) != 2 {
		t.Fatalf("expected two CANTEEN expenses, got total=%d items=%+v", filtered.Data.Total, filtered.Data.Items)
	}
	ids := expenseIDs(filtered.Data.Items)
	if !ids[legacyCanteen.Data.ID] || !ids[priceListCanteen.Data.ID] {
		t.Fatalf("expected CANTEEN filter to include legacy category and price-list rows, got ids=%v", ids)
	}
	if ids[legacyFlight.Data.ID] || ids[priceListAdmin.Data.ID] {
		t.Fatalf("expected CANTEEN filter to exclude non-canteen rows, got ids=%v", ids)
	}
}

func TestListExpenseFiltersByItemTypeIncludesBackfilledLegacyAdministrativeRows(t *testing.T) {
	server, database, cleanup := newTestServerWithDatabase(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	legacyFlight := createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-flight",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            199.0,
		"expenseDate":       "2026-06-05",
		"description":       "Backfilled flight row",
	}))
	legacyCargo := createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-cargo",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            35.0,
		"expenseDate":       "2026-06-06",
		"description":       "Backfilled cargo row",
	}))
	legacyCanteen := createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-canteen",
		"valueUnitId":       "ref-value-unit-brl",
		"amount":            12.0,
		"expenseDate":       "2026-06-07",
		"description":       "Backfilled canteen row",
	}))

	if err := dbpkg.BackfillLegacyExpenseAuditSnapshots(database); err != nil {
		t.Fatalf("backfill legacy expense snapshots: %v", err)
	}

	res := getJSON(t, server, expensesURL+"?itemType=ADMINISTRATIVE&pageSize=50")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected item-type filter status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var filtered apiExpenseListResponse
	decodeJSON(t, res, &filtered)

	ids := expenseIDs(filtered.Data.Items)
	if filtered.Data.Total != 2 || !ids[legacyFlight.Data.ID] || !ids[legacyCargo.Data.ID] {
		t.Fatalf("expected administrative filter to include backfilled flight/cargo rows, got total=%d ids=%v", filtered.Data.Total, ids)
	}
	if ids[legacyCanteen.Data.ID] {
		t.Fatalf("expected administrative filter to exclude canteen row, got ids=%v", ids)
	}
}

func TestUpdateExpenseReturnsUpdatedExpense(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := postJSON(t, server, http.MethodPatch, expensesURL+expense.Data.ID, validExpensePayload(collaborator.Data.ID, map[string]any{
		"expenseCategoryId": "ref-expense-category-flight",
		"valueUnitId":       "ref-value-unit-gold-gram",
		"amount":            3.75,
		"expenseDate":       "2026-06-04",
		"description":       "Updated flight expense",
	}))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected update status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
	var body apiExpenseResponse
	decodeJSON(t, res, &body)
	if body.Data.ExpenseCategoryID != "ref-expense-category-flight" || body.Data.ValueUnitID != "ref-value-unit-gold-gram" || body.Data.Amount != 3.75 || body.Data.ExpenseDate != "2026-06-04" {
		t.Fatalf("unexpected updated expense: %+v", body.Data)
	}
}

func TestDeactivateAndDeleteExpenseHideItFromDefaultList(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := postJSON(t, server, http.MethodPatch, expensesURL+expense.Data.ID+"/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var deactivated apiExpenseResponse
	decodeJSON(t, res, &deactivated)
	if deactivated.Data.Active {
		t.Fatal("expected deactivated expense to be inactive")
	}

	res = getJSON(t, server, expensesURL)
	defer res.Body.Close()
	var list apiExpenseListResponse
	decodeJSON(t, res, &list)
	if list.Data.Total != 0 || len(list.Data.Items) != 0 {
		t.Fatalf("expected inactive expense hidden from default list, got %+v", list.Data)
	}

	res = getJSON(t, server, expensesURL+"?includeInactive=true")
	defer res.Body.Close()
	decodeJSON(t, res, &list)
	if list.Data.Total != 1 || len(list.Data.Items) != 1 || list.Data.Items[0].Active {
		t.Fatalf("expected inactive expense shown only when requested, got %+v", list.Data)
	}

	res = postJSON(t, server, http.MethodDelete, expensesURL+expense.Data.ID, map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("expected delete status %d, got %d", http.StatusNoContent, res.StatusCode)
	}
}

func TestUpdateExpenseRejectsInactiveExpense(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	res := postJSON(t, server, http.MethodPatch, expensesURL+expense.Data.ID+"/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = postJSON(t, server, http.MethodPatch, expensesURL+expense.Data.ID, validExpensePayload(collaborator.Data.ID, nil))
	defer res.Body.Close()
	assertValidationError(t, res, "id", "Inactive expenses cannot be updated")
}

func TestExpensesAreScopedToDefaultTenant(t *testing.T) {
	server, database, cleanup := newTestServerWithDatabase(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	createOtherTenantExpense(t, database, expense.Data.ID)

	res := getJSON(t, server, expensesURL+"other-tenant-expense")
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("expected other-tenant expense get status %d, got %d", http.StatusNotFound, res.StatusCode)
	}

	res = getJSON(t, server, expensesURL+"?includeInactive=true")
	defer res.Body.Close()
	var list apiExpenseListResponse
	decodeJSON(t, res, &list)
	if list.Data.Total != 1 || len(list.Data.Items) != 1 || list.Data.Items[0].ID != expense.Data.ID {
		t.Fatalf("expected only default-tenant expense in list, got %+v", list.Data)
	}
}

func TestCreateExpenseRejectsClosedCollaborator(t *testing.T) {
	server, database, cleanup := newTestServerWithDatabase(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	now := time.Now().UTC()
	if err := database.Model(&dbpkg.CollaboratorJourney{}).Where("id = ?", collaborator.Data.ID).Update("closed_at", now).Error; err != nil {
		t.Fatalf("close collaborator: %v", err)
	}

	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, nil))
	defer res.Body.Close()
	assertValidationError(t, res, "collaboratorId", "Collaborator must be active and open")
}

func TestCreateExpenseRejectsMissingRequiredFields(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postJSON(t, server, http.MethodPost, expensesURL, map[string]any{})
	defer res.Body.Close()

	assertValidationError(t, res, "collaboratorId", "Required")
}

func TestCreateExpenseRejectsInvalidAmount(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, map[string]any{"amount": 0}))
	defer res.Body.Close()

	assertValidationError(t, res, "amount", "Amount must be greater than zero")
}

func TestCreateExpenseRejectsMissingCollaborator(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload("missing-collaborator", nil))
	defer res.Body.Close()

	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, res.StatusCode)
	}
}

func TestCreateExpenseRejectsInactiveCollaborator(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createFinishedCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, nil))
	defer res.Body.Close()

	assertValidationError(t, res, "collaboratorId", "Collaborator must be active and open")
}

func TestCreateExpenseRejectsInvalidExpenseCategory(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, map[string]any{"expenseCategoryId": "ref-not-real"}))
	defer res.Body.Close()

	assertValidationError(t, res, "expenseCategoryId", "Expense category must be active reference data of type expense_category")
}

func TestCreateExpenseRejectsInactiveExpenseCategory(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPatch, "/api/v1/reference-data/expense_category/ref-expense-category-canteen/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate category status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, nil))
	defer res.Body.Close()

	assertValidationError(t, res, "expenseCategoryId", "Expense category must be active reference data of type expense_category")
}

func TestCreateExpenseRejectsInvalidValueUnit(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postJSON(t, server, http.MethodPost, expensesURL, validExpensePayload(collaborator.Data.ID, map[string]any{"valueUnitId": "ref-not-real"}))
	defer res.Body.Close()

	assertValidationError(t, res, "valueUnitId", "Value unit must be active reference data of type value_unit")
}

func newTestServer(t *testing.T) (*fiber.App, func()) {
	t.Helper()
	server, _, cleanup := newTestServerWithDatabase(t)
	return server, cleanup
}

func newTestServerWithDatabase(t *testing.T) (*fiber.App, *gorm.DB, func()) {
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

	database, err := dbpkg.Open(dbPath)
	if err != nil {
		cleanup()
		t.Fatalf("open test database for assertions: %v", err)
	}

	wrappedCleanup := func() {
		sqlDB, err := database.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
		cleanup()
	}

	return server, database, wrappedCleanup
}

func assertExpenseLedgerPosting(t *testing.T, database *gorm.DB, expenseID string, collaboratorID string, valueUnitID string, amount float64, effectiveDate string) {
	t.Helper()

	var entries []dbpkg.LedgerEntry
	if err := database.
		Preload("ValueUnit").
		Where("tenant_id = ? AND source_type = ? AND source_id = ?", "default", "EXPENSE", expenseID).
		Find(&entries).Error; err != nil {
		t.Fatalf("find expense ledger postings: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected exactly one expense ledger posting, got %d: %+v", len(entries), entries)
	}
	entry := entries[0]
	if entry.ID != "ledger-expense-"+expenseID {
		t.Fatalf("expected deterministic ledger id for idempotent posting, got %q", entry.ID)
	}
	if entry.CollaboratorID != collaboratorID || entry.ValueUnitID != valueUnitID {
		t.Fatalf("unexpected ledger collaborator/value unit: %+v", entry)
	}
	if entry.EntryType != "EXPENSE_DEDUCTION" || entry.Direction != "DEBIT" || entry.CorrectionType != "ORIGINAL" {
		t.Fatalf("unexpected ledger classification: %+v", entry)
	}
	if entry.Amount != amount || entry.EffectiveDate.Format(testDateLayout) != effectiveDate || !entry.Active {
		t.Fatalf("unexpected ledger amount/date/active: %+v", entry)
	}

	var receipt dbpkg.LedgerReceipt
	if err := database.First(&receipt, "ledger_entry_id = ?", entry.ID).Error; err != nil {
		t.Fatalf("find generated receipt obligation: %v", err)
	}
	if receipt.CollaboratorID != collaboratorID || receipt.Status != "PENDING_ISSUE" || receipt.ReceiptType != "LEDGER_DEBIT" {
		t.Fatalf("unexpected generated receipt obligation: %+v", receipt)
	}
}

func assertExpenseFinancialPosting(t *testing.T, expense apiExpenseResponse, collaboratorID string, valueUnitID string, valueUnitCode string, amount float64, effectiveDate string) {
	t.Helper()
	posting := expense.Data.FinancialPosting
	if posting == nil {
		t.Fatal("expected financial posting in expense response")
	}
	if posting.LedgerEntryID != "ledger-expense-"+expense.Data.ID {
		t.Fatalf("expected deterministic ledger entry id, got %+v", posting)
	}
	if posting.Direction != "DEBIT" || posting.EntryType != "EXPENSE_DEDUCTION" || posting.CorrectionType != "ORIGINAL" {
		t.Fatalf("unexpected financial posting classification: %+v", posting)
	}
	if posting.Amount != amount || posting.SignedAmount != -amount || posting.EffectiveDate != effectiveDate {
		t.Fatalf("unexpected financial posting amount/date: %+v", posting)
	}
	if posting.ValueUnitID != valueUnitID || posting.ValueUnitCode != valueUnitCode {
		t.Fatalf("unexpected financial posting value unit: %+v", posting)
	}
	if posting.SourceType != "EXPENSE" || posting.SourceID != expense.Data.ID {
		t.Fatalf("unexpected financial posting source: %+v", posting)
	}
	if posting.ReceiptID == "" || posting.ReceiptNumber == "" || posting.ReceiptStatus != "PENDING_ISSUE" || !posting.OutstandingReceipt {
		t.Fatalf("expected pending outstanding receipt obligation, got %+v", posting)
	}
	if collaboratorID != "" && expense.Data.CollaboratorID != collaboratorID {
		t.Fatalf("unexpected expense collaborator id: %+v", expense.Data)
	}
}

func expenseIDs(items []apiExpenseListItem) map[string]bool {
	out := make(map[string]bool, len(items))
	for _, item := range items {
		out[item.ID] = true
	}
	return out
}

func createActiveCollaborator(t *testing.T, server *fiber.App, seq int) apiCollaboratorResponse {
	t.Helper()
	person := createPerson(t, server, validCompletePersonPayload(seq, nil))
	return createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, nil))
}

func createFinishedCollaborator(t *testing.T, server *fiber.App, seq int) apiCollaboratorResponse {
	t.Helper()
	person := createPerson(t, server, validCompletePersonPayload(seq, nil))
	return createCollaborator(t, server, validCollaboratorPayload(person.Data.ID, map[string]any{"statusId": "ref-collaborator-status-finished"}))
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

func createPriceListItem(t *testing.T, server *fiber.App, payload map[string]any) apiPriceListItemResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, priceListItemsURL, payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected create price list item status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
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

func validPriceListItemPayload(overrides map[string]any) map[string]any {
	payload := map[string]any{
		"itemType":     "CANTEEN",
		"code":         "LUNCH",
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
		"rg":                fmt.Sprintf("RG-%06d", seq),
		"cellular":          cellularForSeq(seq),
		"email":             fmt.Sprintf("person%d@example.com", seq),
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
		"pixKey":            fmt.Sprintf("person%d-pix@example.com", seq),
		"emergencyName":     "Emergency Contact",
		"emergencyCellular": "11912345678",
		"emergencyEmail":    fmt.Sprintf("emergency%d@example.com", seq),
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

func createOtherTenantExpense(t *testing.T, database *gorm.DB, sourceExpenseID string) {
	t.Helper()
	now := time.Now().UTC()

	otherTenant := dbpkg.Tenant{
		BaseModel:   dbpkg.BaseModel{ID: "other-tenant", CreatedAt: now, UpdatedAt: now},
		Code:        "OTHER",
		Name:        "Other Tenant",
		Description: "Other tenant for tenant-scope tests",
		Active:      true,
	}
	if err := database.Create(&otherTenant).Error; err != nil {
		t.Fatalf("create other tenant: %v", err)
	}

	var source dbpkg.Expense
	if err := database.First(&source, "id = ?", sourceExpenseID).Error; err != nil {
		t.Fatalf("load source expense: %v", err)
	}

	otherExpense := source
	otherExpense.ID = "other-tenant-expense"
	otherExpense.TenantID = otherTenant.ID
	otherExpense.CreatedAt = now
	otherExpense.UpdatedAt = now
	if err := database.Create(&otherExpense).Error; err != nil {
		t.Fatalf("create other-tenant expense: %v", err)
	}
}

func assertCalculationDetail(t *testing.T, raw string, key string, expected string) {
	t.Helper()
	if raw == "" {
		t.Fatal("expected calculation details JSON")
	}
	var details map[string]any
	if err := json.Unmarshal([]byte(raw), &details); err != nil {
		t.Fatalf("unmarshal calculation details: %v", err)
	}
	actual, ok := details[key]
	if !ok {
		t.Fatalf("expected calculation details key %q in %+v", key, details)
	}
	if actual != expected {
		t.Fatalf("expected calculation detail %q to be %q, got %#v", key, expected, actual)
	}
}

func assertFloatPointer(t *testing.T, actual *float64, expected float64, field string) {
	t.Helper()
	if actual == nil {
		t.Fatalf("expected %s to be set", field)
	}
	if *actual != expected {
		t.Fatalf("expected %s %f, got %f", field, expected, *actual)
	}
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
