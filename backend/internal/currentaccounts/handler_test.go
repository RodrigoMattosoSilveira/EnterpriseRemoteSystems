package currentaccounts_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gofiber/fiber/v3"

	apppkg "enterpriseremotesystems/backend/internal/app"
)

const (
	peopleURL          = "/api/v1/people/"
	collaboratorsURL   = "/api/v1/collaborators/"
	expensesURL        = "/api/v1/expenses/"
	currentAccountsURL = "/api/v1/current-accounts/"
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
		ID             string  `json:"id"`
		CollaboratorID string  `json:"collaboratorId"`
		ValueUnitID    string  `json:"valueUnitId"`
		Amount         float64 `json:"amount"`
		ExpenseDate    string  `json:"expenseDate"`
		Active         bool    `json:"active"`
	} `json:"data"`
}

type apiLedgerEntryListResponse struct {
	Data struct {
		Items []struct {
			ID                string  `json:"id"`
			CollaboratorID    string  `json:"collaboratorId"`
			CollaboratorLabel string  `json:"collaboratorLabel"`
			ValueUnitID       string  `json:"valueUnitId"`
			ValueUnitCode     string  `json:"valueUnitCode"`
			EntryType         string  `json:"entryType"`
			Direction         string  `json:"direction"`
			Amount            float64 `json:"amount"`
			SignedAmount      float64 `json:"signedAmount"`
			EffectiveDate     string  `json:"effectiveDate"`
			SourceType        string  `json:"sourceType"`
			SourceID          string  `json:"sourceId"`
			Active            bool    `json:"active"`
			CorrectionType    string  `json:"correctionType"`
			RelatedEntryID    string  `json:"relatedEntryId"`
			CorrectionReason  string  `json:"correctionReason"`
		} `json:"items"`
		Total    int `json:"total"`
		Page     int `json:"page"`
		PageSize int `json:"pageSize"`
	} `json:"data"`
}

type apiBalancesResponse struct {
	Data []struct {
		CollaboratorID    string  `json:"collaboratorId"`
		CollaboratorLabel string  `json:"collaboratorLabel"`
		ValueUnitID       string  `json:"valueUnitId"`
		ValueUnitCode     string  `json:"valueUnitCode"`
		ValueUnitLabel    string  `json:"valueUnitLabel"`
		Balance           float64 `json:"balance"`
	} `json:"data"`
}

func TestAuthorizedLedgerReverseCreatesOppositeImmutableEntry(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	entries := listLedgerEntries(t, server, collaborator.Data.ID)
	original := entries.Data.Items[0]

	res := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/reverse", map[string]any{
		"reason":        "Correct duplicate expense posting",
		"effectiveDate": "2026-06-07",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected reverse status %d, got %d error=%+v", http.StatusOK, res.StatusCode, body.Error)
	}

	entries = listLedgerEntries(t, server, collaborator.Data.ID)
	if entries.Data.Total != 2 {
		t.Fatalf("expected original and reversal, got %+v", entries.Data.Items)
	}
	var reversalFound bool
	for _, entry := range entries.Data.Items {
		if entry.CorrectionType == "REVERSAL" {
			reversalFound = true
			if entry.RelatedEntryID != original.ID || entry.Direction != "CREDIT" || entry.Amount != original.Amount {
				t.Fatalf("unexpected reversal: %+v", entry)
			}
		}
	}
	if !reversalFound {
		t.Fatalf("expected reversal entry, got %+v", entries.Data.Items)
	}

	balances := listBalances(t, server, collaborator.Data.ID)
	if len(balances.Data) != 0 {
		t.Fatalf("expected zero balance after reversal, got %+v", balances.Data)
	}
}

func TestAuthorizedLedgerReplaceCreatesReversalAndReplacement(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	original := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	res := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/replace", map[string]any{
		"reason":        "Correct expense value",
		"valueUnitId":   "ref-value-unit-brl",
		"entryType":     "EXPENSE_DEDUCTION",
		"direction":     "DEBIT",
		"amount":        50.0,
		"effectiveDate": "2026-06-07",
		"description":   "Corrected canteen expense",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected replace status %d, got %d error=%+v", http.StatusOK, res.StatusCode, body.Error)
	}

	entries := listLedgerEntries(t, server, collaborator.Data.ID)
	if entries.Data.Total != 3 {
		t.Fatalf("expected original, reversal, replacement, got %+v", entries.Data.Items)
	}
	balances := listBalances(t, server, collaborator.Data.ID)
	if len(balances.Data) != 1 || balances.Data[0].Balance != -50.0 {
		t.Fatalf("expected corrected BRL balance -50, got %+v", balances.Data)
	}
}

func TestLedgerCorrectionRejectsMissingAuthorization(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	original := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	res := postJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/reverse", map[string]any{
		"reason":        "Unauthorized attempt",
		"effectiveDate": "2026-06-07",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected forbidden status %d, got %d", http.StatusForbidden, res.StatusCode)
	}
}

func TestLedgerCorrectionRejectsSecondReversal(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	original := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]
	payload := map[string]any{"reason": "Correction", "effectiveDate": "2026-06-07"}

	first := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/reverse", payload)
	first.Body.Close()
	second := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/reverse", payload)
	defer second.Body.Close()
	if second.StatusCode != http.StatusConflict {
		t.Fatalf("expected conflict status %d, got %d", http.StatusConflict, second.StatusCode)
	}
}

func postAuthorizedJSON(t *testing.T, server *fiber.App, method, url string, payload map[string]any) *http.Response {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(method, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Ledger-Correction-Key", "test-ledger-correction-key")
	req.Header.Set("X-Authorized-By", "ledger-admin@example.com")
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	return res
}

func postSettlementJSON(t *testing.T, server *fiber.App, url string, payload map[string]any) *http.Response {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Ledger-Settlement-Key", "test-ledger-settlement-key")
	req.Header.Set("X-Authorized-By", "settlement-admin@example.com")
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return res
}

func listLedgerEntries(t *testing.T, server *fiber.App, collaboratorID string) apiLedgerEntryListResponse {
	t.Helper()
	res := getJSON(t, server, currentAccountsURL+collaboratorID+"/ledger-entries")
	defer res.Body.Close()
	var body apiLedgerEntryListResponse
	decodeJSON(t, res, &body)
	return body
}

func listBalances(t *testing.T, server *fiber.App, collaboratorID string) apiBalancesResponse {
	t.Helper()
	res := getJSON(t, server, currentAccountsURL+collaboratorID+"/balances")
	defer res.Body.Close()
	var body apiBalancesResponse
	decodeJSON(t, res, &body)
	return body
}

func TestExpenseCreatesDebitLedgerEntryAndNegativeCurrentAccountBalance(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/ledger-entries")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected ledger list status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var entries apiLedgerEntryListResponse
	decodeJSON(t, res, &entries)
	if entries.Data.Total != 1 || len(entries.Data.Items) != 1 {
		t.Fatalf("expected one ledger entry, got %+v", entries.Data)
	}
	entry := entries.Data.Items[0]
	if entry.CollaboratorID != collaborator.Data.ID || entry.CollaboratorLabel != "P1" {
		t.Fatalf("unexpected collaborator fields: %+v", entry)
	}
	if entry.ValueUnitID != "ref-value-unit-brl" || entry.ValueUnitCode != "BRL" {
		t.Fatalf("unexpected value unit fields: %+v", entry)
	}
	if entry.EntryType != "EXPENSE_DEDUCTION" || entry.Direction != "DEBIT" || entry.SourceType != "EXPENSE" || entry.SourceID != expense.Data.ID {
		t.Fatalf("unexpected ledger classification/source: %+v", entry)
	}
	if entry.Amount != 42.5 || entry.SignedAmount != -42.5 || entry.EffectiveDate != "2026-06-03" || !entry.Active {
		t.Fatalf("unexpected ledger amounts/date/active: %+v", entry)
	}

	res = getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/balances")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected balance status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var balances apiBalancesResponse
	decodeJSON(t, res, &balances)
	if len(balances.Data) != 1 {
		t.Fatalf("expected one balance, got %+v", balances.Data)
	}
	balance := balances.Data[0]
	if balance.CollaboratorID != collaborator.Data.ID || balance.CollaboratorLabel != "P1" || balance.ValueUnitCode != "BRL" || balance.Balance != -42.5 {
		t.Fatalf("unexpected balance: %+v", balance)
	}
}

func TestCurrentAccountKeepsSeparateBalancesByValueUnit(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-brl",
		"amount":      10.0,
	}))
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-gold-gram",
		"amount":      2.5,
	}))

	res := getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/balances")
	defer res.Body.Close()
	var balances apiBalancesResponse
	decodeJSON(t, res, &balances)
	if len(balances.Data) != 2 {
		t.Fatalf("expected BRL and GOLD_GRAM balances, got %+v", balances.Data)
	}
	byCode := map[string]float64{}
	for _, balance := range balances.Data {
		byCode[balance.ValueUnitCode] = balance.Balance
	}
	if byCode["BRL"] != -10.0 || byCode["GOLD_GRAM"] != -2.5 {
		t.Fatalf("unexpected balances by code: %+v", byCode)
	}
}

func TestExpenseUpdateAndDeactivateUseImmutableLedgerCorrections(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := postJSON(t, server, http.MethodPatch, expensesURL+expense.Data.ID, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-gold-gram",
		"amount":      3.75,
		"expenseDate": "2026-06-04",
	}))
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected update status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/ledger-entries?valueUnitId=ref-value-unit-gold-gram")
	defer res.Body.Close()
	var entries apiLedgerEntryListResponse
	decodeJSON(t, res, &entries)
	if entries.Data.Total != 1 || len(entries.Data.Items) != 1 {
		t.Fatalf("expected one replacement gold ledger entry, got %+v", entries.Data)
	}
	entry := entries.Data.Items[0]
	if entry.ValueUnitCode != "GOLD_GRAM" || entry.Amount != 3.75 || entry.SignedAmount != -3.75 || entry.EffectiveDate != "2026-06-04" || entry.CorrectionType != "REPLACEMENT" {
		t.Fatalf("unexpected replacement ledger entry: %+v", entry)
	}

	res = postJSON(t, server, http.MethodPatch, expensesURL+expense.Data.ID+"/deactivate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/balances")
	defer res.Body.Close()
	var balances apiBalancesResponse
	decodeJSON(t, res, &balances)
	if len(balances.Data) != 0 {
		t.Fatalf("expected no non-zero balances after deactivation, got %+v", balances.Data)
	}

	res = getJSON(t, server, currentAccountsURL+collaborator.Data.ID+"/ledger-entries")
	defer res.Body.Close()
	decodeJSON(t, res, &entries)
	if entries.Data.Total != 4 || len(entries.Data.Items) != 4 {
		t.Fatalf("expected original, reversal, replacement, and final reversal entries, got %+v", entries.Data)
	}
	byCorrection := map[string]int{}
	for _, item := range entries.Data.Items {
		if !item.Active {
			t.Fatalf("immutable correction entries should remain active, got %+v", item)
		}
		byCorrection[item.CorrectionType]++
	}
	if byCorrection["ORIGINAL"] != 1 || byCorrection["REVERSAL"] != 2 || byCorrection["REPLACEMENT"] != 1 {
		t.Fatalf("unexpected correction type counts: %+v entries=%+v", byCorrection, entries.Data.Items)
	}
}

func TestCollaboratorCurrentAccountDetailIncludesBalancesAndLedgerEntries(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-brl",
		"amount":      12.25,
	}))

	res := getJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/current-account")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected current account detail status %d, got %d", http.StatusOK, res.StatusCode)
	}

	var body struct {
		Data struct {
			CollaboratorID    string `json:"collaboratorId"`
			CollaboratorLabel string `json:"collaboratorLabel"`
			Balances          []struct {
				ValueUnitCode string  `json:"valueUnitCode"`
				Balance       float64 `json:"balance"`
			} `json:"balances"`
			LedgerEntries struct {
				Items []struct {
					EntryType      string  `json:"entryType"`
					Direction      string  `json:"direction"`
					ValueUnitCode  string  `json:"valueUnitCode"`
					Amount         float64 `json:"amount"`
					SignedAmount   float64 `json:"signedAmount"`
					CorrectionType string  `json:"correctionType"`
				} `json:"items"`
				Total int `json:"total"`
			} `json:"ledgerEntries"`
		} `json:"data"`
	}
	decodeJSON(t, res, &body)

	if body.Data.CollaboratorID != collaborator.Data.ID || body.Data.CollaboratorLabel != "P1" {
		t.Fatalf("unexpected collaborator detail: %+v", body.Data)
	}
	if len(body.Data.Balances) != 1 || body.Data.Balances[0].ValueUnitCode != "BRL" || body.Data.Balances[0].Balance != -12.25 {
		t.Fatalf("unexpected balances: %+v", body.Data.Balances)
	}
	if body.Data.LedgerEntries.Total != 1 || len(body.Data.LedgerEntries.Items) != 1 {
		t.Fatalf("unexpected ledger entries: %+v", body.Data.LedgerEntries)
	}
	entry := body.Data.LedgerEntries.Items[0]
	if entry.EntryType != "EXPENSE_DEDUCTION" || entry.Direction != "DEBIT" || entry.ValueUnitCode != "BRL" || entry.Amount != 12.25 || entry.SignedAmount != -12.25 || entry.CorrectionType != "ORIGINAL" {
		t.Fatalf("unexpected ledger entry: %+v", entry)
	}
}

func TestCollaboratorLedgerEntriesAliasSupportsFilters(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-brl",
		"amount":      10.0,
	}))
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"valueUnitId": "ref-value-unit-gold-gram",
		"amount":      1.5,
	}))

	res := getJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/ledger-entries?valueUnitId=ref-value-unit-gold-gram")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected ledger entries alias status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var entries apiLedgerEntryListResponse
	decodeJSON(t, res, &entries)
	if entries.Data.Total != 1 || len(entries.Data.Items) != 1 || entries.Data.Items[0].ValueUnitCode != "GOLD_GRAM" {
		t.Fatalf("expected one GOLD_GRAM entry through collaborator alias, got %+v", entries.Data)
	}
}

func TestSettlementPreviewAllowsCloseWithoutBlockers(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := getJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/settlement-preview")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected settlement preview status %d, got %d", http.StatusOK, res.StatusCode)
	}

	var body struct {
		Data struct {
			CollaboratorID      string   `json:"collaboratorId"`
			BRLBalance          float64  `json:"brlBalance"`
			GoldGramBalance     float64  `json:"goldGramBalance"`
			PendingAccrualItems int64    `json:"pendingAccrualItems"`
			CanClose            bool     `json:"canClose"`
			BlockingReasons     []string `json:"blockingReasons"`
		} `json:"data"`
	}
	decodeJSON(t, res, &body)

	if body.Data.CollaboratorID != collaborator.Data.ID || body.Data.BRLBalance != 0 || body.Data.GoldGramBalance != 0 || body.Data.PendingAccrualItems != 0 || !body.Data.CanClose || len(body.Data.BlockingReasons) != 0 {
		t.Fatalf("unexpected settlement preview: %+v", body.Data)
	}
}

func TestSettlementPreviewBlocksNegativeBalance(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))

	res := getJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/settlement-preview")
	defer res.Body.Close()
	var body struct {
		Data struct {
			BRLBalance      float64  `json:"brlBalance"`
			CanClose        bool     `json:"canClose"`
			BlockingReasons []string `json:"blockingReasons"`
		} `json:"data"`
	}
	decodeJSON(t, res, &body)

	if body.Data.BRLBalance != -42.5 || body.Data.CanClose || len(body.Data.BlockingReasons) != 1 || body.Data.BlockingReasons[0] != "NEGATIVE_BALANCE" {
		t.Fatalf("unexpected blocked settlement preview: %+v", body.Data)
	}
}

func TestAuthorizedZeroGoldPostsFullGoldBalanceAndIsIdempotent(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	expense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	entries := listLedgerEntries(t, server, collaborator.Data.ID)
	if len(entries.Data.Items) != 1 {
		t.Fatalf("expected one expense ledger entry, got %+v", entries.Data.Items)
	}
	original := entries.Data.Items[0]

	replace := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/replace", map[string]any{
		"reason":        "Seed positive gold for zero-gold test",
		"valueUnitId":   "ref-value-unit-gold-gram",
		"entryType":     "EARNING_CREDIT",
		"direction":     "CREDIT",
		"amount":        3.75,
		"effectiveDate": "2026-06-07",
		"description":   expense.Data.ID,
	})
	replace.Body.Close()
	if replace.StatusCode != http.StatusOK {
		t.Fatalf("expected replace status %d, got %d", http.StatusOK, replace.StatusCode)
	}

	payload := map[string]any{
		"requestId":     "zero-gold-test-001",
		"effectiveDate": "2026-06-08",
		"notes":         "Gold payout",
	}
	first := postSettlementJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/zero-gold", payload)
	defer first.Body.Close()
	if first.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, first, &body)
		t.Fatalf("expected zero-gold status %d, got %d error=%+v", http.StatusOK, first.StatusCode, body.Error)
	}
	var firstBody struct {
		Data struct {
			Settlement struct {
				ID             string  `json:"id"`
				GoldGramAmount float64 `json:"goldGramAmount"`
			} `json:"settlement"`
			LedgerEntry struct {
				ID            string  `json:"id"`
				Direction     string  `json:"direction"`
				Amount        float64 `json:"amount"`
				ValueUnitCode string  `json:"valueUnitCode"`
				EntryType     string  `json:"entryType"`
			} `json:"ledgerEntry"`
		} `json:"data"`
	}
	decodeJSON(t, first, &firstBody)
	if firstBody.Data.Settlement.GoldGramAmount != 3.75 || firstBody.Data.LedgerEntry.Direction != "DEBIT" || firstBody.Data.LedgerEntry.Amount != 3.75 || firstBody.Data.LedgerEntry.ValueUnitCode != "GOLD_GRAM" || firstBody.Data.LedgerEntry.EntryType != "PAYOUT" {
		t.Fatalf("unexpected zero-gold result: %+v", firstBody.Data)
	}

	balances := listBalances(t, server, collaborator.Data.ID)
	if len(balances.Data) != 0 {
		t.Fatalf("expected zero balance after zero-gold, got %+v", balances.Data)
	}

	second := postSettlementJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/zero-gold", payload)
	defer second.Body.Close()
	if second.StatusCode != http.StatusOK {
		t.Fatalf("expected idempotent zero-gold status %d, got %d", http.StatusOK, second.StatusCode)
	}
	var secondBody struct {
		Data struct {
			Settlement struct {
				ID string `json:"id"`
			} `json:"settlement"`
			LedgerEntry struct {
				ID string `json:"id"`
			} `json:"ledgerEntry"`
		} `json:"data"`
	}
	decodeJSON(t, second, &secondBody)
	if secondBody.Data.Settlement.ID != firstBody.Data.Settlement.ID || secondBody.Data.LedgerEntry.ID != firstBody.Data.LedgerEntry.ID {
		t.Fatalf("expected idempotent result, first=%+v second=%+v", firstBody.Data, secondBody.Data)
	}
}

func TestZeroGoldRejectsMissingPositiveBalance(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postSettlementJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/zero-gold", map[string]any{
		"requestId":     "zero-gold-empty-001",
		"effectiveDate": "2026-06-08",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("expected no-positive-gold conflict %d, got %d", http.StatusConflict, res.StatusCode)
	}
}

func TestAuthorizedPartialPayoutPostsSelectedBalancesAndIsIdempotent(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	firstExpense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	secondExpense := createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"description": "Second seed expense",
	}))
	entries := listLedgerEntries(t, server, collaborator.Data.ID)
	if len(entries.Data.Items) != 2 {
		t.Fatalf("expected two seed ledger entries, got %+v", entries.Data.Items)
	}

	seedByDescription := map[string]struct {
		ID string
	}{}
	for _, item := range entries.Data.Items {
		seedByDescription[item.SourceID] = struct{ ID string }{ID: item.ID}
	}
	brlSeed, ok := seedByDescription[firstExpense.Data.ID]
	if !ok {
		t.Fatalf("missing first expense ledger entry: %+v", entries.Data.Items)
	}
	goldSeed, ok := seedByDescription[secondExpense.Data.ID]
	if !ok {
		t.Fatalf("missing second expense ledger entry: %+v", entries.Data.Items)
	}

	res := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+brlSeed.ID+"/replace", map[string]any{
		"reason":        "Seed positive BRL for partial payout",
		"valueUnitId":   "ref-value-unit-brl",
		"entryType":     "EARNING_CREDIT",
		"direction":     "CREDIT",
		"amount":        100.0,
		"effectiveDate": "2026-06-07",
		"description":   "Positive BRL balance",
	})
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected BRL seed replace status %d, got %d", http.StatusOK, res.StatusCode)
	}

	res = postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+goldSeed.ID+"/replace", map[string]any{
		"reason":        "Seed positive gold for partial payout",
		"valueUnitId":   "ref-value-unit-gold-gram",
		"entryType":     "EARNING_CREDIT",
		"direction":     "CREDIT",
		"amount":        5.0,
		"effectiveDate": "2026-06-07",
		"description":   "Positive gold balance",
	})
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected gold seed replace status %d, got %d", http.StatusOK, res.StatusCode)
	}

	payload := map[string]any{
		"requestId":      "partial-payout-test-001",
		"effectiveDate":  "2026-06-08",
		"brlAmount":      40.0,
		"goldGramAmount": 1.25,
		"notes":          "Partial collaborator payout",
	}
	first := postSettlementJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/payout", payload)
	defer first.Body.Close()
	if first.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, first, &body)
		t.Fatalf("expected payout status %d, got %d error=%+v", http.StatusOK, first.StatusCode, body.Error)
	}
	var firstBody struct {
		Data struct {
			Settlement struct {
				ID             string  `json:"id"`
				BRLAmount      float64 `json:"brlAmount"`
				GoldGramAmount float64 `json:"goldGramAmount"`
			} `json:"settlement"`
			LedgerEntries []struct {
				ID            string  `json:"id"`
				Direction     string  `json:"direction"`
				Amount        float64 `json:"amount"`
				ValueUnitCode string  `json:"valueUnitCode"`
				EntryType     string  `json:"entryType"`
			} `json:"ledgerEntries"`
		} `json:"data"`
	}
	decodeJSON(t, first, &firstBody)
	if firstBody.Data.Settlement.BRLAmount != 40 || firstBody.Data.Settlement.GoldGramAmount != 1.25 || len(firstBody.Data.LedgerEntries) != 2 {
		t.Fatalf("unexpected payout result: %+v", firstBody.Data)
	}
	byUnit := map[string]float64{}
	for _, entry := range firstBody.Data.LedgerEntries {
		if entry.Direction != "DEBIT" || entry.EntryType != "PAYOUT" {
			t.Fatalf("unexpected payout ledger entry: %+v", entry)
		}
		byUnit[entry.ValueUnitCode] = entry.Amount
	}
	if byUnit["BRL"] != 40 || byUnit["GOLD_GRAM"] != 1.25 {
		t.Fatalf("unexpected payout entries by unit: %+v", byUnit)
	}

	balances := listBalances(t, server, collaborator.Data.ID)
	byBalance := map[string]float64{}
	for _, balance := range balances.Data {
		byBalance[balance.ValueUnitCode] = balance.Balance
	}
	if byBalance["BRL"] != 60 || byBalance["GOLD_GRAM"] != 3.75 {
		t.Fatalf("unexpected balances after partial payout: %+v", byBalance)
	}

	second := postSettlementJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/payout", payload)
	defer second.Body.Close()
	if second.StatusCode != http.StatusOK {
		t.Fatalf("expected idempotent payout status %d, got %d", http.StatusOK, second.StatusCode)
	}
	var secondBody struct {
		Data struct {
			Settlement struct {
				ID string `json:"id"`
			} `json:"settlement"`
			LedgerEntries []struct {
				ID string `json:"id"`
			} `json:"ledgerEntries"`
		} `json:"data"`
	}
	decodeJSON(t, second, &secondBody)
	if secondBody.Data.Settlement.ID != firstBody.Data.Settlement.ID || len(secondBody.Data.LedgerEntries) != 2 {
		t.Fatalf("expected idempotent payout result, first=%+v second=%+v", firstBody.Data, secondBody.Data)
	}
}

func TestPartialPayoutRejectsAmountAboveAvailableBalance(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	res := postSettlementJSON(t, server, "/api/v1/collaborators/"+collaborator.Data.ID+"/payout", map[string]any{
		"requestId":     "partial-payout-too-large-001",
		"effectiveDate": "2026-06-08",
		"brlAmount":     1.0,
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("expected payout conflict status %d, got %d", http.StatusConflict, res.StatusCode)
	}
}

func TestCurrentAccountRejectsMissingCollaborator(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := getJSON(t, server, currentAccountsURL+"missing-collaborator/balances")
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, res.StatusCode)
	}
}

func newTestServer(t *testing.T) (*fiber.App, func()) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := apppkg.Bootstrap(apppkg.Config{
		Env:                 "test",
		HTTPAddr:            ":0",
		DBPath:              dbPath,
		JWTSecret:           "test-secret",
		LedgerCorrectionKey: "test-ledger-correction-key",
		LedgerSettlementKey: "test-ledger-settlement-key",
	})
	if err != nil {
		t.Fatalf("bootstrap test server: %v", err)
	}
	return server, cleanup
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
		"rg":                fmt.Sprintf("RG-CA-%06d", seq),
		"cellular":          cellularForSeq(seq),
		"email":             fmt.Sprintf("ca-person%d@example.com", seq),
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
		"pixKey":            fmt.Sprintf("ca-person%d-pix@example.com", seq),
		"emergencyName":     "Emergency Contact",
		"emergencyCellular": "11912345678",
		"emergencyEmail":    fmt.Sprintf("ca-emergency%d@example.com", seq),
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

func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}
