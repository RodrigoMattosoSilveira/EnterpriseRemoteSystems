package accruals_test

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
	peopleURL          = "/api/v1/people/"
	collaboratorsURL   = "/api/v1/collaborators/"
	workPeriodsURL     = "/api/v1/work-periods/"
	assignmentsURL     = "/api/v1/work-period-assignments/"
	accrualRunsURL     = "/api/v1/accrual-runs/"
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
type apiWorkPeriodResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}
type apiAssignmentResponse struct {
	Data struct {
		ID string `json:"id"`
	} `json:"data"`
}

type apiAccrualRunResponse struct {
	Data struct {
		ID           string `json:"id"`
		WorkPeriodID string `json:"workPeriodId"`
		Status       string `json:"status"`
		AccrualDate  string `json:"accrualDate"`
		Summary      struct {
			TotalItems   int `json:"totalItems"`
			ReadyItems   int `json:"readyItems"`
			PendingItems int `json:"pendingItems"`
			SkippedItems int `json:"skippedItems"`
			PostedItems  int `json:"postedItems"`
		} `json:"summary"`
	} `json:"data"`
}
type apiAccrualItemListResponse struct {
	Data struct {
		Items []struct {
			ID                     string   `json:"id"`
			WorkPeriodAssignmentID string   `json:"workPeriodAssignmentId"`
			CollaboratorID         string   `json:"collaboratorId"`
			CalculationType        string   `json:"calculationType"`
			Direction              string   `json:"direction"`
			BRLAmount              *float64 `json:"brlAmount"`
			GoldGramAmount         *float64 `json:"goldGramAmount"`
			Status                 string   `json:"status"`
			PendingReason          string   `json:"pendingReason"`
		} `json:"items"`
		Total int `json:"total"`
	} `json:"data"`
}

type apiLedgerEntryListResponse struct {
	Data struct {
		Items []struct {
			ID                   string  `json:"id"`
			ValueUnitCode        string  `json:"valueUnitCode"`
			EntryType            string  `json:"entryType"`
			Direction            string  `json:"direction"`
			Amount               float64 `json:"amount"`
			SignedAmount         float64 `json:"signedAmount"`
			SourceType           string  `json:"sourceType"`
			SourceID             string  `json:"sourceId"`
			SourceLabel          string  `json:"sourceLabel"`
			SourceWorkPeriodID   string  `json:"sourceWorkPeriodId"`
			SourceWorkDate       string  `json:"sourceWorkDate"`
			SourceWorkPeriodName string  `json:"sourceWorkPeriodName"`
			EffectiveDate        string  `json:"effectiveDate"`
		} `json:"items"`
		Total int `json:"total"`
	} `json:"data"`
}

type apiCurrentAccountDetailResponse struct {
	Data struct {
		CollaboratorID string `json:"collaboratorId"`
		Balances       []struct {
			ValueUnitCode string  `json:"valueUnitCode"`
			Balance       float64 `json:"balance"`
		} `json:"balances"`
		LedgerEntries struct {
			Items []struct {
				ValueUnitCode        string  `json:"valueUnitCode"`
				EntryType            string  `json:"entryType"`
				Direction            string  `json:"direction"`
				Amount               float64 `json:"amount"`
				SourceType           string  `json:"sourceType"`
				SourceID             string  `json:"sourceId"`
				SourceLabel          string  `json:"sourceLabel"`
				SourceWorkPeriodID   string  `json:"sourceWorkPeriodId"`
				SourceWorkDate       string  `json:"sourceWorkDate"`
				SourceWorkPeriodName string  `json:"sourceWorkPeriodName"`
			} `json:"items"`
			Total int `json:"total"`
		} `json:"ledgerEntries"`
	} `json:"data"`
}

func TestCreateAccrualRunCreatesReadyDailyBRLItem(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "dailyBrlAmount": 150.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")

	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	if run.Data.Status != "READY_TO_POST" {
		t.Fatalf("expected READY_TO_POST, got %q", run.Data.Status)
	}
	if run.Data.Summary.ReadyItems != 1 || run.Data.Summary.TotalItems != 1 {
		t.Fatalf("expected one ready item, got %+v", run.Data.Summary)
	}

	items := listAccrualItems(t, server, run.Data.ID, "")
	if items.Data.Total != 1 {
		t.Fatalf("expected one item, got %d", items.Data.Total)
	}
	item := items.Data.Items[0]
	if item.CalculationType != "DAILY_BRL" || item.Status != "READY" || item.BRLAmount == nil || *item.BRLAmount != 150.0 {
		t.Fatalf("expected ready daily BRL item, got %+v", item)
	}
}

func TestGoldCommissionAccrualItemPendingWhenProductionMissing(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 5.0, "goldCommissionPercent": 5.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")

	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	if run.Data.Status != "PENDING_INPUT" {
		t.Fatalf("expected PENDING_INPUT, got %q", run.Data.Status)
	}
	items := listAccrualItems(t, server, run.Data.ID, "status=PENDING")
	if items.Data.Total != 1 || items.Data.Items[0].PendingReason != "GOLD_PRODUCTION_MISSING" {
		t.Fatalf("expected pending production item, got %+v", items.Data.Items)
	}
}

func TestRecalculateAccrualRunUsesGoldProduction(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 5.0, "goldCommissionPercent": 5.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")
	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	createGoldProductionEntry(t, server, workPeriod.Data.ID, map[string]any{"locationId": "ref-location-main-mine", "productionDate": "2026-06-05", "goldGramsProduced": 100.0})

	res := postJSON(t, server, http.MethodPost, accrualRunsURL+run.Data.ID+"/recalculate", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("expected recalculate status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
	var recalculated apiAccrualRunResponse
	decodeJSON(t, res, &recalculated)
	if recalculated.Data.Status != "READY_TO_POST" {
		t.Fatalf("expected READY_TO_POST, got %q", recalculated.Data.Status)
	}
	items := listAccrualItems(t, server, run.Data.ID, "status=READY")
	if items.Data.Total != 1 || items.Data.Items[0].GoldGramAmount == nil || *items.Data.Items[0].GoldGramAmount != 5.0 {
		t.Fatalf("expected 5g ready item, got %+v", items.Data.Items)
	}
}

func TestPostAccrualRunCreatesAssignmentSourcedBRLLedgerCreditAndMarksItemPosted(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "dailyBrlAmount": 150.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")
	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})

	posted := postAccrualRun(t, server, run.Data.ID)
	if posted.Data.Status != "POSTED" || posted.Data.Summary.PostedItems != 1 {
		t.Fatalf("expected posted run with one posted item, got %+v", posted.Data)
	}
	items := listAccrualItems(t, server, run.Data.ID, "status=POSTED")
	if items.Data.Total != 1 {
		t.Fatalf("expected one posted item, got %d", items.Data.Total)
	}
	if items.Data.Items[0].WorkPeriodAssignmentID != assignment.Data.ID {
		t.Fatalf("expected posted item to retain assignment ID %q, got %+v", assignment.Data.ID, items.Data.Items[0])
	}
	entries := listLedgerEntries(t, server, collaborator.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT")
	if entries.Data.Total != 1 {
		t.Fatalf("expected one assignment-sourced ledger entry, got %d", entries.Data.Total)
	}
	entry := entries.Data.Items[0]
	if entry.EntryType != "EARNING_CREDIT" || entry.Direction != "CREDIT" || entry.ValueUnitCode != "BRL" || entry.Amount != 150.0 || entry.SourceID != assignment.Data.ID {
		t.Fatalf("unexpected assignment-sourced BRL ledger entry: %+v", entry)
	}
	if entry.SourceWorkPeriodID != workPeriod.Data.ID || entry.SourceWorkDate != "2026-06-05" || entry.SourceWorkPeriodName != "06:00-18:00" || entry.SourceLabel != "Work Period 2026-06-05 · 06:00-18:00" {
		t.Fatalf("expected assignment source details for BRL earning credit, got %+v", entry)
	}
}

func TestPostGoldCommissionAccrualRunCreatesGoldLedgerCreditVisibleInCurrentAccount(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 5.0, "goldCommissionPercent": 5.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")
	createGoldProductionEntry(t, server, workPeriod.Data.ID, map[string]any{"locationId": "ref-location-main-mine", "productionDate": "2026-06-05", "goldGramsProduced": 100.0})
	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})

	posted := postAccrualRun(t, server, run.Data.ID)
	if posted.Data.Status != "POSTED" || posted.Data.Summary.PostedItems != 1 {
		t.Fatalf("expected posted gold run with one posted item, got %+v", posted.Data)
	}

	detail := getCurrentAccountDetail(t, server, collaborator.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT")
	if detail.Data.LedgerEntries.Total != 1 {
		t.Fatalf("expected one assignment-sourced current-account entry, got %+v", detail.Data.LedgerEntries)
	}
	entry := detail.Data.LedgerEntries.Items[0]
	if entry.EntryType != "EARNING_CREDIT" || entry.Direction != "CREDIT" || entry.ValueUnitCode != "GOLD_GRAM" || entry.Amount != 5.0 || entry.SourceID != assignment.Data.ID {
		t.Fatalf("unexpected assignment-sourced gold ledger entry: %+v", entry)
	}
	if entry.SourceWorkPeriodID != workPeriod.Data.ID || entry.SourceWorkDate != "2026-06-05" || entry.SourceLabel != "Work Period 2026-06-05 · 06:00-18:00" {
		t.Fatalf("expected assignment source details in current-account detail, got %+v", entry)
	}
	assertCurrentAccountBalance(t, detail, "GOLD_GRAM", 5.0)
}

func TestPostAccrualRunIsIdempotent(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	collaborator := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "dailyBrlAmount": 150.0}))
	assignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(collaborator.Data.ID, nil))
	markOutcome(t, server, assignment.Data.ID, "WORKED")
	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})

	postAccrualRun(t, server, run.Data.ID)
	postAccrualRun(t, server, run.Data.ID)
	entries := listLedgerEntries(t, server, collaborator.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT")
	if entries.Data.Total != 1 {
		t.Fatalf("expected idempotent single assignment-sourced ledger entry, got %d", entries.Data.Total)
	}
	if entries.Data.Items[0].SourceID != assignment.Data.ID {
		t.Fatalf("expected ledger source to be assignment %q, got %+v", assignment.Data.ID, entries.Data.Items[0])
	}
}

func TestPostAccrualRunLeavesPendingItemsOutstanding(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	daily := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "dailyBrlAmount": 150.0}))
	commission := createActiveCollaborator(t, server, 2, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 5.0, "goldCommissionPercent": 5.0}))
	dailyAssignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(daily.Data.ID, nil))
	commissionAssignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(commission.Data.ID, nil))
	markOutcome(t, server, dailyAssignment.Data.ID, "WORKED")
	markOutcome(t, server, commissionAssignment.Data.ID, "WORKED")
	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})

	posted := postAccrualRun(t, server, run.Data.ID)
	if posted.Data.Status != "POSTED" || posted.Data.Summary.PostedItems != 1 || posted.Data.Summary.PendingItems != 1 {
		t.Fatalf("expected one posted and one pending item, got %+v", posted.Data.Summary)
	}
	pending := listAccrualItems(t, server, run.Data.ID, "status=PENDING")
	if pending.Data.Total != 1 || pending.Data.Items[0].PendingReason != "GOLD_PRODUCTION_MISSING" {
		t.Fatalf("expected pending gold production item, got %+v", pending.Data.Items)
	}
}

func TestSickDayOffGoldCommissionCreatesReplacementTransferItems(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	original := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 5.0, "goldCommissionPercent": 5.0, "sickDayOffReplacementGoldGrams": 1.25}))
	replacement := createActiveCollaborator(t, server, 2, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "dailyBrlAmount": 150.0}))
	originalAssignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(original.Data.ID, nil))
	replacementAssignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(replacement.Data.ID, map[string]any{"replacementForAssignmentId": originalAssignment.Data.ID}))
	markOutcome(t, server, originalAssignment.Data.ID, "SICK_DAY_OFF")
	markOutcome(t, server, replacementAssignment.Data.ID, "WORKED")
	createGoldProductionEntry(t, server, workPeriod.Data.ID, map[string]any{"locationId": "ref-location-main-mine", "productionDate": "2026-06-05", "goldGramsProduced": 100.0})

	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	if run.Data.Status != "READY_TO_POST" || run.Data.Summary.ReadyItems != 4 {
		t.Fatalf("expected four ready items, got status %q summary %+v", run.Data.Status, run.Data.Summary)
	}
	items := listAccrualItems(t, server, run.Data.ID, "status=READY&pageSize=20")
	assertAccrualItem(t, items, original.Data.ID, "GOLD_COMMISSION", "CREDIT", nil, floatPtr(5.0))
	assertAccrualItem(t, items, original.Data.ID, "SICK_DAY_OFF_REPLACEMENT_GOLD_DEBIT", "DEBIT", nil, floatPtr(1.25))
	assertAccrualItem(t, items, replacement.Data.ID, "DAILY_BRL", "CREDIT", floatPtr(150.0), nil)
	assertAccrualItem(t, items, replacement.Data.ID, "SICK_DAY_OFF_REPLACEMENT_GOLD_CREDIT", "CREDIT", nil, floatPtr(1.25))

	postAccrualRun(t, server, run.Data.ID)
	originalEarnings := listLedgerEntries(t, server, original.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT&pageSize=20")
	assertLedgerEntry(t, originalEarnings, "EARNING_CREDIT", "CREDIT", "GOLD_GRAM", 5.0)
	originalTransfers := listLedgerEntries(t, server, original.Data.ID, "sourceType=ACCRUAL_ITEM&pageSize=20")
	assertLedgerEntry(t, originalTransfers, "REPLACEMENT_TRANSFER", "DEBIT", "GOLD_GRAM", 1.25)
	replacementEarnings := listLedgerEntries(t, server, replacement.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT&pageSize=20")
	assertLedgerEntry(t, replacementEarnings, "EARNING_CREDIT", "CREDIT", "BRL", 150.0)
	replacementTransfers := listLedgerEntries(t, server, replacement.Data.ID, "sourceType=ACCRUAL_ITEM&pageSize=20")
	assertLedgerEntry(t, replacementTransfers, "REPLACEMENT_TRANSFER", "CREDIT", "GOLD_GRAM", 1.25)
}

func TestTimeOffGoldCommissionCreatesConfigurableSplitItems(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	original := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 10.0, "goldCommissionPercent": 10.0, "timeOffGoldSplitPercent": 40.0}))
	replacement := createActiveCollaborator(t, server, 2, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "dailyBrlAmount": 150.0}))
	originalAssignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(original.Data.ID, nil))
	replacementAssignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(replacement.Data.ID, map[string]any{"replacementForAssignmentId": originalAssignment.Data.ID}))
	markOutcome(t, server, originalAssignment.Data.ID, "TIME_OFF")
	markOutcome(t, server, replacementAssignment.Data.ID, "WORKED")
	createGoldProductionEntry(t, server, workPeriod.Data.ID, map[string]any{"locationId": "ref-location-main-mine", "productionDate": "2026-06-05", "goldGramsProduced": 100.0})

	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	if run.Data.Status != "READY_TO_POST" || run.Data.Summary.ReadyItems != 2 {
		t.Fatalf("expected two ready items, got status %q summary %+v", run.Data.Status, run.Data.Summary)
	}
	items := listAccrualItems(t, server, run.Data.ID, "status=READY&pageSize=20")
	if items.Data.Total != 2 {
		t.Fatalf("expected two ready items and no replacement daily BRL item, got %+v", items.Data.Items)
	}
	assertAccrualItem(t, items, original.Data.ID, "TIME_OFF_GOLD_COMMISSION_RETAINED", "CREDIT", nil, floatPtr(6.0))
	assertAccrualItem(t, items, replacement.Data.ID, "TIME_OFF_REPLACEMENT_GOLD_CREDIT", "CREDIT", nil, floatPtr(4.0))
}

func TestReplacementGoldItemsWaitForProduction(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	workPeriod := createWorkPeriod(t, server, nil)
	original := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-commission", "paymentValue": 5.0, "goldCommissionPercent": 5.0}))
	replacement := createActiveCollaborator(t, server, 2, validCollaboratorPayload("", map[string]any{"paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "dailyBrlAmount": 150.0}))
	originalAssignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(original.Data.ID, nil))
	replacementAssignment := createAssignment(t, server, workPeriod.Data.ID, validAssignmentPayload(replacement.Data.ID, map[string]any{"replacementForAssignmentId": originalAssignment.Data.ID}))
	markOutcome(t, server, originalAssignment.Data.ID, "SICK_DAY_OFF")
	markOutcome(t, server, replacementAssignment.Data.ID, "WORKED")

	run := createAccrualRun(t, server, workPeriod.Data.ID, map[string]any{})
	if run.Data.Status != "PENDING_INPUT" || run.Data.Summary.PendingItems != 3 || run.Data.Summary.ReadyItems != 1 {
		t.Fatalf("expected pending production items and ready daily item, got status %q summary %+v", run.Data.Status, run.Data.Summary)
	}
	pending := listAccrualItems(t, server, run.Data.ID, "status=PENDING&pageSize=20")
	if pending.Data.Total != 3 {
		t.Fatalf("expected three pending items, got %d", pending.Data.Total)
	}
	for _, item := range pending.Data.Items {
		if item.PendingReason != "GOLD_PRODUCTION_MISSING" {
			t.Fatalf("expected GOLD_PRODUCTION_MISSING, got %+v", item)
		}
	}
}

func newTestServer(t *testing.T) (*fiber.App, func()) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "app.db")
	server, cleanup, err := apppkg.Bootstrap(apppkg.Config{Env: "test", HTTPAddr: ":0", DBPath: dbPath, JWTSecret: "test-secret"})
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
func createActiveCollaborator(t *testing.T, server *fiber.App, seq int, payload map[string]any) apiCollaboratorResponse {
	t.Helper()
	person := createPerson(t, server, validCompletePersonPayload(seq, nil))
	payload["personId"] = person.Data.ID
	return createCollaborator(t, server, payload)
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
func markOutcome(t *testing.T, server *fiber.App, assignmentID string, status string) {
	t.Helper()
	res := postJSON(t, server, http.MethodPatch, assignmentsURL+assignmentID+"/outcome", map[string]any{"actualStatus": status})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("mark outcome: expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
}
func createAccrualRun(t *testing.T, server *fiber.App, workPeriodID string, payload map[string]any) apiAccrualRunResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriodID+"/accrual-runs", payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("create accrual run: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
	var body apiAccrualRunResponse
	decodeJSON(t, res, &body)
	return body
}
func postAccrualRun(t *testing.T, server *fiber.App, runID string) apiAccrualRunResponse {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, accrualRunsURL+runID+"/post", map[string]any{})
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("post accrual run: expected status %d, got %d with error %+v", http.StatusOK, res.StatusCode, body.Error)
	}
	var body apiAccrualRunResponse
	decodeJSON(t, res, &body)
	return body
}

func listAccrualItems(t *testing.T, server *fiber.App, runID string, query string) apiAccrualItemListResponse {
	t.Helper()
	url := accrualRunsURL + runID + "/items"
	if query != "" {
		url += "?" + query
	}
	res := getJSON(t, server, url)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected list items status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var body apiAccrualItemListResponse
	decodeJSON(t, res, &body)
	return body
}
func getCurrentAccountDetail(t *testing.T, server *fiber.App, collaboratorID string, query string) apiCurrentAccountDetailResponse {
	t.Helper()
	url := collaboratorsURL + collaboratorID + "/current-account"
	if query != "" {
		url += "?" + query
	}
	res := getJSON(t, server, url)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected current-account detail status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var body apiCurrentAccountDetailResponse
	decodeJSON(t, res, &body)
	return body
}

func listLedgerEntries(t *testing.T, server *fiber.App, collaboratorID string, query string) apiLedgerEntryListResponse {
	t.Helper()
	url := currentAccountsURL + collaboratorID + "/ledger-entries"
	if query != "" {
		url += "?" + query
	}
	res := getJSON(t, server, url)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected list ledger entries status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var body apiLedgerEntryListResponse
	decodeJSON(t, res, &body)
	return body
}

func createGoldProductionEntry(t *testing.T, server *fiber.App, workPeriodID string, payload map[string]any) {
	t.Helper()
	res := postJSON(t, server, http.MethodPost, workPeriodsURL+workPeriodID+"/gold-production-entries", payload)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var body apiErrorResponse
		decodeJSON(t, res, &body)
		t.Fatalf("create gold production: expected status %d, got %d with error %+v", http.StatusCreated, res.StatusCode, body.Error)
	}
}

func validWorkPeriodPayload(overrides map[string]any) map[string]any {
	payload := map[string]any{"workDate": "2026-06-05", "periodCode": "DAY", "name": "06:00-18:00", "startsAt": "2026-06-05T06:00:00Z", "endsAt": "2026-06-05T18:00:00Z"}
	for k, v := range overrides {
		payload[k] = v
	}
	return payload
}
func validAssignmentPayload(collaboratorID string, overrides map[string]any) map[string]any {
	payload := map[string]any{"collaboratorId": collaboratorID, "plannedStatus": "INCLUDED", "sectorId": "ref-sector-mining", "locationId": "ref-location-main-mine", "taskId": "ref-task-miner"}
	for k, v := range overrides {
		payload[k] = v
	}
	return payload
}
func validCollaboratorPayload(personID string, overrides map[string]any) map[string]any {
	payload := map[string]any{"personId": personID, "journeyStartDate": "2026-06-01", "paymentMethodId": "ref-method-daily", "paymentValue": 150.0, "sectorId": "ref-sector-mining", "locationId": "ref-location-main-mine", "taskId": "ref-task-miner", "statusId": "ref-collaborator-status-active", "notes": "Accrual collaborator"}
	for k, v := range overrides {
		payload[k] = v
	}
	return payload
}
func validCompletePersonPayload(seq int, overrides map[string]any) map[string]any {
	payload := map[string]any{"firstName": fmt.Sprintf("Accrual%d", seq), "lastName": "Silva", "nickname": fmt.Sprintf("A%d", seq), "cpf": cpfForSeq(seq), "rg": fmt.Sprintf("AC-%06d", seq), "cellular": cellularForSeq(seq), "email": fmt.Sprintf("accrual%d@example.com", seq), "street1": "Rua Completa 123", "city": "Sao Paulo", "state": "SP", "cep": "01001000", "country": "Brasil", "bankName": "Banco Teste", "bankNumber": "001", "checkingAccount": "12345-6", "pixKey": fmt.Sprintf("accrual%d-pix@example.com", seq), "emergencyName": "Emergency Contact", "emergencyCellular": "11912345678", "emergencyEmail": fmt.Sprintf("accrual-emergency%d@example.com", seq), "statusId": "ref-person-status-active"}
	for k, v := range overrides {
		payload[k] = v
	}
	return payload
}
func cpfForSeq(seq int) string {
	cpfs := []string{"39053344705", "93541134780", "35711002844", "12345678909"}
	return cpfs[(seq-1)%len(cpfs)]
}
func cellularForSeq(seq int) string { return fmt.Sprintf("11%d%08d", 9, 98865000+seq) }
func assertCurrentAccountBalance(t *testing.T, detail apiCurrentAccountDetailResponse, valueUnitCode string, balance float64) {
	t.Helper()
	for _, item := range detail.Data.Balances {
		if item.ValueUnitCode == valueUnitCode && item.Balance == balance {
			return
		}
	}
	t.Fatalf("expected current account balance unit=%s balance=%v in %+v", valueUnitCode, balance, detail.Data.Balances)
}

func assertAccrualItem(t *testing.T, list apiAccrualItemListResponse, collaboratorID string, calculationType string, direction string, brlAmount *float64, goldAmount *float64) {
	t.Helper()
	for _, item := range list.Data.Items {
		if item.CollaboratorID != collaboratorID || item.CalculationType != calculationType || item.Direction != direction {
			continue
		}
		if !optionalFloatEqual(item.BRLAmount, brlAmount) || !optionalFloatEqual(item.GoldGramAmount, goldAmount) {
			t.Fatalf("found item %s/%s but amounts were unexpected: %+v", calculationType, direction, item)
		}
		return
	}
	t.Fatalf("expected accrual item collaborator=%s calculationType=%s direction=%s in %+v", collaboratorID, calculationType, direction, list.Data.Items)
}

func assertLedgerEntry(t *testing.T, list apiLedgerEntryListResponse, entryType string, direction string, valueUnitCode string, amount float64) {
	t.Helper()
	for _, item := range list.Data.Items {
		if item.EntryType == entryType && item.Direction == direction && item.ValueUnitCode == valueUnitCode && item.Amount == amount {
			return
		}
	}
	t.Fatalf("expected ledger entry type=%s direction=%s unit=%s amount=%v in %+v", entryType, direction, valueUnitCode, amount, list.Data.Items)
}

func optionalFloatEqual(got *float64, want *float64) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

func floatPtr(value float64) *float64 { return &value }

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
func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
}
