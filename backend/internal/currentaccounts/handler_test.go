package currentaccounts_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"

	apppkg "enterpriseremotesystems/backend/internal/app"
	"enterpriseremotesystems/backend/internal/authz"
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
			ID                   string  `json:"id"`
			CollaboratorID       string  `json:"collaboratorId"`
			CollaboratorLabel    string  `json:"collaboratorLabel"`
			ValueUnitID          string  `json:"valueUnitId"`
			ValueUnitCode        string  `json:"valueUnitCode"`
			EntryType            string  `json:"entryType"`
			Direction            string  `json:"direction"`
			Amount               float64 `json:"amount"`
			SignedAmount         float64 `json:"signedAmount"`
			EffectiveDate        string  `json:"effectiveDate"`
			SourceType           string  `json:"sourceType"`
			SourceID             string  `json:"sourceId"`
			Active               bool    `json:"active"`
			CorrectionType       string  `json:"correctionType"`
			RelatedEntryID       string  `json:"relatedEntryId"`
			CorrectionReason     string  `json:"correctionReason"`
			CorrectionReasonCode string  `json:"correctionReasonCode"`
			CorrectionReasonText string  `json:"correctionReasonText"`
			SecondApprovedBy     string  `json:"secondApprovedBy"`
			SecondApprovedAt     string  `json:"secondApprovedAt"`
			SecondApprovalNotes  string  `json:"secondApprovalNotes"`
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

type apiPrintableReceiptResponse struct {
	Data struct {
		ID                string `json:"id"`
		ReceiptNumber     string `json:"receiptNumber"`
		Status            string `json:"status"`
		IssuedAt          string `json:"issuedAt"`
		IssuedBy          string `json:"issuedBy"`
		PrintedAt         string `json:"printedAt"`
		SignedAt          string `json:"signedAt"`
		ReturnedAt        string `json:"returnedAt"`
		ReceivedBy        string `json:"receivedBy"`
		SignedDocumentRef string `json:"signedDocumentRef"`
		Notes             string `json:"notes"`
		LedgerEntryID     string `json:"ledgerEntryId"`
		CollaboratorID    string `json:"collaboratorId"`
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
		"reasonCode":    "DUPLICATE_POSTING",
		"reasonText":    "Correct duplicate expense posting",
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
			if entry.CorrectionReasonCode != "DUPLICATE_POSTING" || entry.CorrectionReasonText != "Correct duplicate expense posting" || entry.CorrectionReason != "Correct duplicate expense posting" {
				t.Fatalf("expected structured correction reason on reversal, got %+v", entry)
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
		"reasonCode":    "AMOUNT_CORRECTION",
		"reasonText":    "Correct expense value",
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

func TestLedgerCorrectionRejectsMissingReason(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	original := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	res := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/reverse", map[string]any{
		"effectiveDate": "2026-06-07",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected bad request status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if body.Error == nil || body.Error.Fields["reasonCode"] == "" || body.Error.Fields["reasonText"] == "" {
		t.Fatalf("expected reason validation fields, got %+v", body.Error)
	}
}

func TestLedgerCorrectionRejectsBlankReasonText(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	original := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	res := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/reverse", map[string]any{
		"reasonCode":    "DUPLICATE_POSTING",
		"reasonText":    "   ",
		"effectiveDate": "2026-06-07",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected bad request status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if body.Error == nil || body.Error.Fields["reasonText"] == "" {
		t.Fatalf("expected reasonText validation field, got %+v", body.Error)
	}
}

func TestLedgerCorrectionPersistsOptionalSecondApproval(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	original := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	res := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/reverse", map[string]any{
		"reasonCode":    "DUPLICATE_POSTING",
		"reasonText":    "Correct duplicate expense posting",
		"effectiveDate": "2026-06-07",
		"secondApproval": map[string]any{
			"approvedBy": "tenant-admin@example.com",
			"notes":      "Reviewed original receipt and approved reversal",
		},
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected reverse status %d, got %d error=%+v", http.StatusOK, res.StatusCode, body.Error)
	}

	entries := listLedgerEntries(t, server, collaborator.Data.ID)
	for _, entry := range entries.Data.Items {
		if entry.CorrectionType == "REVERSAL" {
			if entry.SecondApprovedBy != "tenant-admin@example.com" || entry.SecondApprovedAt == "" || entry.SecondApprovalNotes != "Reviewed original receipt and approved reversal" {
				t.Fatalf("expected optional second approval metadata on reversal, got %+v", entry)
			}
			return
		}
	}
	t.Fatalf("expected reversal entry, got %+v", entries.Data.Items)
}

func TestLedgerCorrectionRejectsSecondApprovalBySameActor(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	original := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	res := postAuthorizedJSON(t, server, http.MethodPost, "/api/v1/ledger-entries/"+original.ID+"/reverse", map[string]any{
		"reasonCode":    "DUPLICATE_POSTING",
		"reasonText":    "Correct duplicate expense posting",
		"effectiveDate": "2026-06-07",
		"secondApproval": map[string]any{
			"approvedBy": "ledger-admin@example.com",
		},
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected bad request status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if body.Error == nil || body.Error.Fields["secondApproval.approvedBy"] == "" {
		t.Fatalf("expected secondApproval.approvedBy validation field, got %+v", body.Error)
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
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized status %d, got %d", http.StatusUnauthorized, res.StatusCode)
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
	req.Header.Set(authz.HeaderActorID, "ledger-admin@example.com")
	req.Header.Set(authz.HeaderTenantID, "default")
	req.Header.Set(authz.HeaderActorPermissions, string(authz.PermissionLedgerCorrectionsCreate))
	req.Header.Set(authz.HeaderReauthenticatedAt, time.Now().UTC().Format(time.RFC3339))
	req.Header.Set(authz.HeaderReauthenticationMethod, "password")
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
	req.Header.Set(authz.HeaderActorID, "settlement-admin@example.com")
	req.Header.Set(authz.HeaderTenantID, "default")
	req.Header.Set(authz.HeaderActorPermissions, strings.Join([]string{
		string(authz.PermissionJourneySettlementsZeroGold),
		string(authz.PermissionJourneySettlementsPartialPayout),
		string(authz.PermissionJourneySettlementsClose),
	}, ","))
	req.Header.Set(authz.HeaderReauthenticatedAt, time.Now().UTC().Format(time.RFC3339))
	req.Header.Set(authz.HeaderReauthenticationMethod, "password")
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return res
}

func postReceiptJSON(t *testing.T, server *fiber.App, url, authorizedBy string, payload map[string]any) *http.Response {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Authorized-By", authorizedBy)
	req.Header.Set(authz.HeaderReauthenticatedAt, time.Now().UTC().Format(time.RFC3339))
	req.Header.Set(authz.HeaderReauthenticationMethod, "password")
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return res
}

func postReceiptActorJSON(t *testing.T, server *fiber.App, url, actorID, permissions string, payload map[string]any) *http.Response {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(authz.HeaderActorID, actorID)
	req.Header.Set(authz.HeaderActorPermissions, permissions)
	req.Header.Set(authz.HeaderReauthenticatedAt, time.Now().UTC().Format(time.RFC3339))
	req.Header.Set(authz.HeaderReauthenticationMethod, "password")
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

type apiOutstandingReceiptListResponse struct {
	Data struct {
		Items []struct {
			ID                string  `json:"id"`
			ReceiptNumber     string  `json:"receiptNumber"`
			Status            string  `json:"status"`
			LedgerEntryID     string  `json:"ledgerEntryId"`
			CollaboratorID    string  `json:"collaboratorId"`
			CollaboratorLabel string  `json:"collaboratorLabel"`
			EntryType         string  `json:"entryType"`
			ValueUnitCode     string  `json:"valueUnitCode"`
			Amount            float64 `json:"amount"`
		} `json:"items"`
		Total    int `json:"total"`
		Page     int `json:"page"`
		PageSize int `json:"pageSize"`
		Summary  struct {
			PendingIssue int `json:"pendingIssue"`
			Issued       int `json:"issued"`
			Printed      int `json:"printed"`
			Signed       int `json:"signed"`
			Total        int `json:"total"`
		} `json:"summary"`
	} `json:"data"`
}

func TestReceiptPrintAuthorization(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	entry := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]
	url := "/api/v1/ledger-entries/" + entry.ID + "/receipt/print"

	missing := postJSON(t, server, http.MethodPost, url, map[string]any{})
	missing.Body.Close()
	if missing.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected missing actor status %d, got %d", http.StatusUnauthorized, missing.StatusCode)
	}

	forbidden := postReceiptActorJSON(t, server, url, "receipt-viewer@example.com", "ledger.receipts.return", map[string]any{})
	forbidden.Body.Close()
	if forbidden.StatusCode != http.StatusForbidden {
		t.Fatalf("expected forbidden status %d, got %d", http.StatusForbidden, forbidden.StatusCode)
	}

	permitted := postReceiptActorJSON(t, server, url, "receipt-printer@example.com", string(authz.PermissionLedgerReceiptsPrint), map[string]any{})
	defer permitted.Body.Close()
	if permitted.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, permitted, &body)
		t.Fatalf("expected permitted print status %d, got %d error=%+v", http.StatusOK, permitted.StatusCode, body.Error)
	}
	var body apiPrintableReceiptResponse
	decodeJSON(t, permitted, &body)
	if body.Data.Status != "PRINTED" || body.Data.IssuedBy != "receipt-printer@example.com" {
		t.Fatalf("unexpected printed receipt: %+v", body.Data)
	}
}

func TestReceiptReturnAuthorization(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	entry := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]
	url := "/api/v1/ledger-entries/" + entry.ID + "/receipt/return"

	missing := postJSON(t, server, http.MethodPost, url, map[string]any{})
	missing.Body.Close()
	if missing.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected missing actor status %d, got %d", http.StatusUnauthorized, missing.StatusCode)
	}

	forbidden := postReceiptActorJSON(t, server, url, "receipt-viewer@example.com", "ledger.receipts.print", map[string]any{})
	forbidden.Body.Close()
	if forbidden.StatusCode != http.StatusForbidden {
		t.Fatalf("expected forbidden status %d, got %d", http.StatusForbidden, forbidden.StatusCode)
	}

	permitted := postReceiptActorJSON(t, server, url, "receipt-returner@example.com", string(authz.PermissionLedgerReceiptsReturn), map[string]any{
		"signedDocumentRef": "receipt-scans/authorized-return.pdf",
	})
	defer permitted.Body.Close()
	if permitted.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, permitted, &body)
		t.Fatalf("expected permitted return status %d, got %d error=%+v", http.StatusOK, permitted.StatusCode, body.Error)
	}
	var body apiPrintableReceiptResponse
	decodeJSON(t, permitted, &body)
	if body.Data.Status != "RETURNED" || body.Data.ReceivedBy != "receipt-returner@example.com" {
		t.Fatalf("unexpected returned receipt: %+v", body.Data)
	}
}

func TestReceiptBackfillAuthorization(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	url := "/api/v1/receipts/backfill-debit-ledger-entries?dryRun=true"

	missing := postJSON(t, server, http.MethodPost, url, map[string]any{})
	missing.Body.Close()
	if missing.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected missing actor status %d, got %d", http.StatusUnauthorized, missing.StatusCode)
	}

	forbidden := postReceiptActorJSON(t, server, url, "receipt-viewer@example.com", "ledger.receipts.print", map[string]any{})
	forbidden.Body.Close()
	if forbidden.StatusCode != http.StatusForbidden {
		t.Fatalf("expected forbidden status %d, got %d", http.StatusForbidden, forbidden.StatusCode)
	}

	permitted := postReceiptActorJSON(t, server, url, "receipt-backfiller@example.com", string(authz.PermissionLedgerReceiptsBackfill), map[string]any{
		"reasonCode": "RECEIPT_BACKFILL",
		"reasonText": "Backfill historical debit ledger receipts",
	})
	defer permitted.Body.Close()
	if permitted.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, permitted, &body)
		t.Fatalf("expected permitted backfill status %d, got %d error=%+v", http.StatusOK, permitted.StatusCode, body.Error)
	}
	var body struct {
		Data struct {
			DryRun      bool   `json:"dryRun"`
			RequestedBy string `json:"requestedBy"`
		} `json:"data"`
	}
	decodeJSON(t, permitted, &body)
	if !body.Data.DryRun || body.Data.RequestedBy != "receipt-backfiller@example.com" {
		t.Fatalf("unexpected backfill result: %+v", body.Data)
	}
}

func TestReceiptBackfillAllowsLegacyAuthorizedByCompatibility(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	res := postReceiptJSON(t, server, "/api/v1/receipts/backfill-debit-ledger-entries?dryRun=true", "legacy-backfill@example.com", map[string]any{
		"reasonCode": "RECEIPT_BACKFILL",
		"reasonText": "Legacy backfill dry run",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected legacy authorized backfill status %d, got %d error=%+v", http.StatusOK, res.StatusCode, body.Error)
	}
}

func TestReceiptReturnRecordsSignedReturnedMetadata(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	entry := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	printRes := postReceiptJSON(t, server, "/api/v1/ledger-entries/"+entry.ID+"/receipt/print", "office-admin@example.com", map[string]any{})
	printRes.Body.Close()
	if printRes.StatusCode != http.StatusOK {
		t.Fatalf("expected print status %d, got %d", http.StatusOK, printRes.StatusCode)
	}

	returnRes := postReceiptJSON(t, server, "/api/v1/ledger-entries/"+entry.ID+"/receipt/return", "receiver@example.com", map[string]any{
		"signedDocumentRef": "receipt-scans/RCP-001.pdf",
		"notes":             "Returned by collaborator after signature.",
	})
	defer returnRes.Body.Close()
	if returnRes.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, returnRes, &body)
		t.Fatalf("expected return status %d, got %d error=%+v", http.StatusOK, returnRes.StatusCode, body.Error)
	}
	var body apiPrintableReceiptResponse
	decodeJSON(t, returnRes, &body)
	if body.Data.Status != "RETURNED" || body.Data.ReceivedBy != "receiver@example.com" || body.Data.SignedDocumentRef != "receipt-scans/RCP-001.pdf" {
		t.Fatalf("unexpected returned receipt: %+v", body.Data)
	}
	if body.Data.SignedAt == "" || body.Data.ReturnedAt == "" || body.Data.PrintedAt == "" {
		t.Fatalf("expected signed, returned, and printed timestamps, got %+v", body.Data)
	}
	if body.Data.Notes != "Returned by collaborator after signature." {
		t.Fatalf("unexpected receipt notes: %+v", body.Data)
	}
}

func TestReceiptReturnRejectsBlankSignedDocumentRef(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	entry := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	res := postReceiptJSON(t, server, "/api/v1/ledger-entries/"+entry.ID+"/receipt/return", "receiver@example.com", map[string]any{
		"signedDocumentRef": "   ",
		"notes":             "Missing signed scan should be rejected.",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected bad request status %d, got %d error=%+v", http.StatusBadRequest, res.StatusCode, body.Error)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if body.Error == nil || body.Error.Fields["signedDocumentRef"] == "" {
		t.Fatalf("expected signedDocumentRef validation field, got %+v", body.Error)
	}
}

func TestReceiptReturnRejectsSecondReturn(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, nil))
	entry := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items[0]

	first := postReceiptJSON(t, server, "/api/v1/ledger-entries/"+entry.ID+"/receipt/return", "receiver@example.com", map[string]any{
		"signedDocumentRef": "receipt-scans/first-return.pdf",
	})
	first.Body.Close()
	if first.StatusCode != http.StatusOK {
		t.Fatalf("expected first return status %d, got %d", http.StatusOK, first.StatusCode)
	}

	second := postReceiptJSON(t, server, "/api/v1/ledger-entries/"+entry.ID+"/receipt/return", "receiver@example.com", map[string]any{
		"signedDocumentRef": "receipt-scans/second-return.pdf",
	})
	defer second.Body.Close()
	if second.StatusCode != http.StatusConflict {
		t.Fatalf("expected second return conflict status %d, got %d", http.StatusConflict, second.StatusCode)
	}
}

func TestOutstandingReceiptsListsOnlyUnreturnedActionItems(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()

	collaborator := createActiveCollaborator(t, server, 1)
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"description": "First receipt remains outstanding",
		"amount":      10.0,
	}))
	createExpense(t, server, validExpensePayload(collaborator.Data.ID, map[string]any{
		"description": "Second receipt is returned",
		"amount":      20.0,
	}))
	entries := listLedgerEntries(t, server, collaborator.Data.ID).Data.Items
	if len(entries) != 2 {
		t.Fatalf("expected two ledger entries, got %+v", entries)
	}

	returnRes := postReceiptJSON(t, server, "/api/v1/ledger-entries/"+entries[0].ID+"/receipt/return", "receiver@example.com", map[string]any{
		"signedDocumentRef": "returned.pdf",
	})
	returnRes.Body.Close()
	if returnRes.StatusCode != http.StatusOK {
		t.Fatalf("expected return status %d, got %d", http.StatusOK, returnRes.StatusCode)
	}

	res := getJSON(t, server, "/api/v1/receipts/outstanding")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected outstanding receipt status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var body apiOutstandingReceiptListResponse
	decodeJSON(t, res, &body)
	if body.Data.Total != 1 || len(body.Data.Items) != 1 {
		t.Fatalf("expected one outstanding receipt, got %+v", body.Data)
	}
	item := body.Data.Items[0]
	if item.Status != "PENDING_ISSUE" || item.LedgerEntryID == entries[0].ID || item.CollaboratorID != collaborator.Data.ID || item.ValueUnitCode != "BRL" || item.Amount != 10.0 {
		t.Fatalf("unexpected outstanding receipt: %+v", item)
	}
	if body.Data.Summary.PendingIssue != 1 || body.Data.Summary.Total != 1 {
		t.Fatalf("unexpected outstanding summary: %+v", body.Data.Summary)
	}

	printedRes := getJSON(t, server, "/api/v1/receipts/outstanding?status=PRINTED")
	defer printedRes.Body.Close()
	if printedRes.StatusCode != http.StatusOK {
		t.Fatalf("expected printed filter status %d, got %d", http.StatusOK, printedRes.StatusCode)
	}
	var printedBody apiOutstandingReceiptListResponse
	decodeJSON(t, printedRes, &printedBody)
	if printedBody.Data.Total != 0 || len(printedBody.Data.Items) != 0 {
		t.Fatalf("expected no printed receipts, got %+v", printedBody.Data)
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
		"reasonCode":    "GOLD_ZEROING_CORRECTION",
		"reasonText":    "Zero out paid gold balance",
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
		"reasonCode":    "GOLD_ZEROING_CORRECTION",
		"reasonText":    "Attempt zero gold balance",
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
		"reasonCode":     "PAYOUT_CORRECTION",
		"reasonText":     "Pay selected balances",
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
		"reasonCode":    "PAYOUT_CORRECTION",
		"reasonText":    "Attempt oversized payout",
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
