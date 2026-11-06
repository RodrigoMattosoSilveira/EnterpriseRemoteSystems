package accruals_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
)

// End-to-end through the LOCAL isolated in-memory HTTP test app. Checks both
// the READY/POSTED accrual rows and the immutable ledger posting read APIs.
func TestByte353WorkAttributionIsRecordedInAccrualAndCurrentAccount(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	period := createWorkPeriod(t, server, nil)
	worker := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{
		"paymentMethodId": "ref-method-daily", "dailyBrlAmount": 150.0, "paymentValue": 150.0,
	}))
	assignment := createAssignment(t, server, period.Data.ID, validAssignmentPayload(worker.Data.ID, nil))
	sectorID := addWorkReference(t, server, "sector", "OVERRIDE_SECTOR", "Work Sector Alpha")
	locationID := addWorkReference(t, server, "location", "OVERRIDE_LOCATION", "Work Location Beta")
	taskID := addWorkReference(t, server, "task", "OVERRIDE_TASK", "Work Task Gamma")
	res := postJSON(t, server, http.MethodPatch, assignmentsURL+assignment.Data.ID+"/outcome", map[string]any{
		"actualStatus": "WORKED", "actualSectorId": sectorID, "actualLocationId": locationID, "actualTaskId": taskID,
	})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("set actual work status: %d", res.StatusCode)
	}
	res.Body.Close()

	run := createAccrualRun(t, server, period.Data.ID, map[string]any{})
	ready := listAccrualItems(t, server, run.Data.ID, "status=READY")
	if ready.Data.Total != 1 {
		t.Fatalf("expected one ready item, got %+v", ready.Data)
	}
	row := ready.Data.Items[0]
	if row.WorkSectorID != sectorID || row.WorkSectorLabel != "Work Sector Alpha" || row.WorkLocationID != locationID || row.WorkLocationLabel != "Work Location Beta" || row.WorkTaskID != taskID || row.WorkTaskLabel != "Work Task Gamma" {
		t.Fatalf("actual-work snapshot missing on READY item: %+v", row)
	}
	if row.BRLAmount == nil || *row.BRLAmount != 150.0 {
		t.Fatalf("actual overrides changed informed compensation: %+v", row)
	}

	postAccrualRun(t, server, run.Data.ID)
	posted := listAccrualItems(t, server, run.Data.ID, "status=POSTED")
	if posted.Data.Total != 1 || posted.Data.Items[0].WorkTaskID != taskID {
		t.Fatalf("posting lost actual work: %+v", posted.Data)
	}
	entries := listLedgerEntries(t, server, worker.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT")
	if entries.Data.Total != 1 {
		t.Fatalf("expected one ledger entry: %+v", entries.Data)
	}
	ledger := entries.Data.Items[0]
	if ledger.WorkSectorID != sectorID || ledger.WorkSectorLabel != "Work Sector Alpha" || ledger.WorkLocationID != locationID || ledger.WorkLocationLabel != "Work Location Beta" || ledger.WorkTaskID != taskID || ledger.WorkTaskLabel != "Work Task Gamma" {
		t.Fatalf("current-account ledger did not store actual work: %+v", ledger)
	}
	if ledger.Amount != 150.0 || ledger.SourceID != assignment.Data.ID {
		t.Fatalf("ledger amount or assignment source changed: %+v", ledger)
	}
	detail := getCurrentAccountDetail(t, server, worker.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT")
	if detail.Data.LedgerEntries.Total != 1 || detail.Data.LedgerEntries.Items[0].WorkTaskLabel != "Work Task Gamma" || detail.Data.LedgerEntries.Items[0].WorkSectorLabel != "Work Sector Alpha" {
		t.Fatalf("Current Account detail omitted performed work: %+v", detail.Data.LedgerEntries)
	}
	// Posting remains idempotent and does not duplicate financial evidence.
	postAccrualRun(t, server, run.Data.ID)
	again := listLedgerEntries(t, server, worker.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT")
	if again.Data.Total != 1 || again.Data.Items[0].WorkLocationLabel != "Work Location Beta" {
		t.Fatalf("repeat post lost or duplicated financial attribution: %+v", again.Data)
	}

	// The exact customer sequence: record actual work, execute Accrual, then
	// create a later same-code period. Its proposed plan must carry performed
	// work forward, without changing the posted financial evidence above.
	next := createWorkPeriod(t, server, map[string]any{
		"workDate": "2026-06-06", "startsAt": "2026-06-06T06:00:00Z", "endsAt": "2026-06-06T18:00:00Z",
	})
	planning := getJSON(t, server, workPeriodsURL+next.Data.ID+"/assignments/planning-template")
	defer planning.Body.Close()
	if planning.StatusCode != http.StatusOK {
		t.Fatalf("planning after accrual: %d", planning.StatusCode)
	}
	var nextPlan struct {
		Data struct {
			SourceWorkPeriodID string `json:"sourceWorkPeriodId"`
			Rows               []struct {
				CollaboratorID string `json:"collaboratorId"`
				SectorID       string `json:"sectorId"`
				LocationID     string `json:"locationId"`
				TaskID         string `json:"taskId"`
			} `json:"rows"`
		} `json:"data"`
	}
	decodeJSON(t, planning, &nextPlan)
	if nextPlan.Data.SourceWorkPeriodID != period.Data.ID {
		t.Fatalf("new plan used unexpected source period %q", nextPlan.Data.SourceWorkPeriodID)
	}
	found := false
	for _, row := range nextPlan.Data.Rows {
		if row.CollaboratorID == worker.Data.ID {
			found = true
			if row.SectorID != sectorID || row.LocationID != locationID || row.TaskID != taskID {
				t.Fatalf("new plan did not carry actual work through accrual posting: %+v", row)
			}
		}
	}
	if !found {
		t.Fatalf("new plan lacks collaborator from prior posted period: %+v", nextPlan.Data.Rows)
	}
}

// The operational location must be visible, but it must not replace the
// informed-location gold production used in the established payout formula.
func TestByte353GoldCommissionKeepsInformedBasisWithActualLocationEvidence(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	period := createWorkPeriod(t, server, nil)
	worker := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", map[string]any{
		"paymentMethodId": "ref-method-commission", "goldCommissionPercent": 5.0, "paymentValue": 5.0,
	}))
	assignment := createAssignment(t, server, period.Data.ID, validAssignmentPayload(worker.Data.ID, nil))
	actualLocationID := addWorkReference(t, server, "location", "OVERRIDE_PIT", "Actual Pit")
	response := postJSON(t, server, http.MethodPatch, assignmentsURL+assignment.Data.ID+"/outcome", map[string]any{
		"actualStatus": "WORKED", "actualLocationId": actualLocationID,
	})
	if response.StatusCode != http.StatusOK {
		t.Fatalf("set actual location status: %d", response.StatusCode)
	}
	response.Body.Close()
	createGoldProductionEntry(t, server, period.Data.ID, map[string]any{
		"locationId": "ref-location-main-mine", "productionDate": "2026-06-05", "goldGramsProduced": 100.0,
	})
	createGoldProductionEntry(t, server, period.Data.ID, map[string]any{
		"locationId": actualLocationID, "productionDate": "2026-06-05", "goldGramsProduced": 500.0,
	})
	run := createAccrualRun(t, server, period.Data.ID, map[string]any{})
	ready := listAccrualItems(t, server, run.Data.ID, "status=READY")
	if ready.Data.Total != 1 || ready.Data.Items[0].GoldGramAmount == nil || *ready.Data.Items[0].GoldGramAmount != 5.0 {
		t.Fatalf("gold commission must use informed location's 100g, got %+v", ready.Data)
	}
	if ready.Data.Items[0].WorkLocationID != actualLocationID || ready.Data.Items[0].WorkLocationLabel != "Actual Pit" {
		t.Fatalf("actual location not represented in accrual item: %+v", ready.Data.Items[0])
	}
	postAccrualRun(t, server, run.Data.ID)
	detail := getCurrentAccountDetail(t, server, worker.Data.ID, "sourceType=WORK_PERIOD_ASSIGNMENT")
	if detail.Data.LedgerEntries.Total != 1 || detail.Data.LedgerEntries.Items[0].Amount != 5.0 || detail.Data.LedgerEntries.Items[0].WorkLocationLabel != "Actual Pit" {
		t.Fatalf("gold ledger must use informed compensation and actual work evidence: %+v", detail.Data.LedgerEntries)
	}
}

func TestByte353InformedFallbackCapturedOnlyForWorkedOutcomes(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	period := createWorkPeriod(t, server, nil)
	worked := createActiveCollaborator(t, server, 1, validCollaboratorPayload("", nil))
	absent := createActiveCollaborator(t, server, 2, validCollaboratorPayload("", nil))
	workedAssignment := createAssignment(t, server, period.Data.ID, validAssignmentPayload(worked.Data.ID, nil))
	absentAssignment := createAssignment(t, server, period.Data.ID, validAssignmentPayload(absent.Data.ID, nil))
	markOutcome(t, server, workedAssignment.Data.ID, "WORKED")
	markOutcome(t, server, absentAssignment.Data.ID, "ABSENT")
	run := createAccrualRun(t, server, period.Data.ID, map[string]any{})
	items := listAccrualItems(t, server, run.Data.ID, "")
	if items.Data.Total != 2 {
		t.Fatalf("expected two items, got %+v", items.Data)
	}
	for _, item := range items.Data.Items {
		switch item.WorkPeriodAssignmentID {
		case workedAssignment.Data.ID:
			if item.WorkSectorID != "ref-sector-mining" || item.WorkSectorLabel != "Mining" || item.WorkLocationID != "ref-location-main-mine" || item.WorkLocationLabel != "Main Mine" || item.WorkTaskID != "ref-task-miner" || item.WorkTaskLabel != "Miner" {
				t.Fatalf("informed fallback was not captured for WORKED: %+v", item)
			}
		case absentAssignment.Data.ID:
			if item.WorkSectorID != "" || item.WorkLocationID != "" || item.WorkTaskID != "" {
				t.Fatalf("ABSENT was incorrectly reported as performed work: %+v", item)
			}
		default:
			t.Fatalf("unexpected assignment: %+v", item)
		}
	}
}

func addWorkReference(t *testing.T, server *fiber.App, kind, code, label string) string {
	t.Helper()
	response := postJSON(t, server, http.MethodPost, "/api/v1/reference-data/"+kind, map[string]any{
		"code": code, "label": label, "description": "Byte 35.3 financial attribution test", "sortOrder": 100,
	})
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("create %s reference: status %d", kind, response.StatusCode)
	}
	var result struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	decodeJSON(t, response, &result)
	if result.Data.ID == "" {
		t.Fatalf("missing new %s reference ID", kind)
	}
	return result.Data.ID
}
