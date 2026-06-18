package currentaccounts

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

type fakeActorStore struct {
	actor *authz.Actor
	err   error
}

func (s fakeActorStore) FindActor(context.Context, authz.ActorLookup) (*authz.Actor, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.actor, nil
}

type recordingAuditStore struct {
	entries []authz.AuthorizationAuditEntry
}

func (s *recordingAuditStore) RecordAuthorizationAudit(_ context.Context, entry authz.AuthorizationAuditEntry) error {
	s.entries = append(s.entries, entry)
	return nil
}

type recordingReceiptService struct {
	printedBy            string
	zeroGoldBy           string
	partialPayoutBy      string
	closeJourneyBy       string
	reverseEntryBy       string
	replaceEntryBy       string
	collaboratorTenantID string
	ledgerEntryTenantID  string
}

func newRecordingReceiptService() *recordingReceiptService {
	return &recordingReceiptService{collaboratorTenantID: "tenant-a", ledgerEntryTenantID: "tenant-a"}
}

func (s *recordingReceiptService) PrintReceipt(_ context.Context, _ string, printedBy string) (*PrintableReceiptDTO, error) {
	s.printedBy = printedBy
	return &PrintableReceiptDTO{ID: "receipt-1", Status: "PRINTED", LedgerEntryID: "entry-1", IssuedBy: printedBy}, nil
}

func TestReceiptHandlerResolvesPersistedActorFromRequestHeaders(t *testing.T) {
	service := newRecordingReceiptService()
	audit := &recordingAuditStore{}
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "expense-operator@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{authz.PermissionLedgerReceiptsPrint: {}},
	}}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/receipt/print", NewHandler(service, WithActorStore(store), WithAuthorizationAudit(audit)).PrintReceipt)

	req := httptest.NewRequest(http.MethodPost, "/ledger-entries/entry-1/receipt/print", nil)
	req.Header.Set(authz.HeaderActorID, "expense-operator@example.com")
	req.Header.Set(authz.HeaderTenantID, "tenant-a")
	res, err := app.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.StatusCode)
	}
	if service.printedBy != "expense-operator@example.com" {
		t.Fatalf("expected persisted actor id passed to service, got %q", service.printedBy)
	}
	if len(audit.entries) != 1 {
		t.Fatalf("expected 1 audit entry, got %#v", audit.entries)
	}
	if got := audit.entries[0]; got.Operation != "ledger_receipts.print" || got.Decision != authz.AuditDecisionAuthorized || got.Permission != authz.PermissionLedgerReceiptsPrint || got.TargetID != "entry-1" {
		t.Fatalf("unexpected audit entry: %#v", got)
	}

	var body struct {
		Data PrintableReceiptDTO `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Data.IssuedBy != "expense-operator@example.com" {
		t.Fatalf("unexpected response: %+v", body.Data)
	}
}

func TestReceiptHandlerRejectsMissingPersistedActor(t *testing.T) {
	service := newRecordingReceiptService()
	store := fakeActorStore{err: authz.ErrMissingActor}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/receipt/print", NewHandler(service, WithActorStore(store)).PrintReceipt)

	req := httptest.NewRequest(http.MethodPost, "/ledger-entries/entry-1/receipt/print", nil)
	req.Header.Set(authz.HeaderActorID, "missing@example.com")
	req.Header.Set(authz.HeaderTenantID, "tenant-a")
	res, err := app.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.StatusCode)
	}
	if service.printedBy != "" {
		t.Fatalf("service must not be called when persisted actor is missing")
	}
}

func TestReceiptHandlerAuditsDeniedAuthorization(t *testing.T) {
	service := newRecordingReceiptService()
	audit := &recordingAuditStore{}
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "read-only@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{},
	}}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/receipt/print", NewHandler(service, WithActorStore(store), WithAuthorizationAudit(audit)).PrintReceipt)

	req := httptest.NewRequest(http.MethodPost, "/ledger-entries/entry-1/receipt/print", nil)
	req.Header.Set(authz.HeaderActorID, "read-only@example.com")
	req.Header.Set(authz.HeaderTenantID, "tenant-a")
	res, err := app.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, res.StatusCode)
	}
	if len(audit.entries) != 1 {
		t.Fatalf("expected 1 audit entry, got %#v", audit.entries)
	}
	if got := audit.entries[0]; got.Operation != "ledger_receipts.print" || got.Decision != authz.AuditDecisionDenied || got.Permission != authz.PermissionLedgerReceiptsPrint {
		t.Fatalf("unexpected denied audit entry: %#v", got)
	}
}

func TestCurrentAccountHandlerProtectsLedgerCorrectionOperations(t *testing.T) {
	cases := []struct {
		name       string
		path       string
		permission authz.Permission
		wantCalled func(*recordingReceiptService) string
	}{
		{
			name:       "reverse entry",
			path:       "/ledger-entries/entry-1/reverse",
			permission: authz.PermissionLedgerCorrectionsCreate,
			wantCalled: func(s *recordingReceiptService) string { return s.reverseEntryBy },
		},
		{
			name:       "replace entry",
			path:       "/ledger-entries/entry-1/replace",
			permission: authz.PermissionLedgerCorrectionsCreate,
			wantCalled: func(s *recordingReceiptService) string { return s.replaceEntryBy },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name+" permits persisted actor", func(t *testing.T) {
			service := newRecordingReceiptService()
			store := fakeActorStore{actor: &authz.Actor{
				ID:          "correction-operator@example.com",
				TenantID:    "tenant-a",
				Source:      authz.ActorSourcePersisted,
				Scope:       authz.ActorScopeTenant,
				Permissions: map[authz.Permission]struct{}{tc.permission: {}},
			}}

			app := fiber.New()
			app.Post("/ledger-entries/:entryId/reverse", NewHandler(service, WithActorStore(store)).ReverseEntry)
			app.Post("/ledger-entries/:entryId/replace", NewHandler(service, WithActorStore(store)).ReplaceEntry)

			res := postAuthzJSON(t, app, tc.path, map[string]any{
				"reason":        "authorized correction",
				"effectiveDate": "2026-06-15",
				"valueUnitId":   "unit-brl",
				"entryType":     "ADJUSTMENT",
				"direction":     "CREDIT",
				"amount":        10,
				"description":   "replacement entry",
			}, "correction-operator@example.com", "tenant-a")
			defer res.Body.Close()

			if res.StatusCode != http.StatusOK {
				t.Fatalf("expected status %d, got %d", http.StatusOK, res.StatusCode)
			}
			if got := tc.wantCalled(service); got != "correction-operator@example.com" {
				t.Fatalf("expected service authorizedBy to use persisted actor id, got %q", got)
			}
		})

		t.Run(tc.name+" rejects missing actor", func(t *testing.T) {
			service := newRecordingReceiptService()
			store := fakeActorStore{err: authz.ErrMissingActor}

			app := fiber.New()
			app.Post("/ledger-entries/:entryId/reverse", NewHandler(service, WithActorStore(store)).ReverseEntry)
			app.Post("/ledger-entries/:entryId/replace", NewHandler(service, WithActorStore(store)).ReplaceEntry)

			res := postAuthzJSON(t, app, tc.path, map[string]any{"reason": "authorized correction"}, "missing@example.com", "tenant-a")
			defer res.Body.Close()

			if res.StatusCode != http.StatusUnauthorized {
				t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.StatusCode)
			}
			if got := tc.wantCalled(service); got != "" {
				t.Fatalf("service must not be called when actor is missing, got %q", got)
			}
		})

		t.Run(tc.name+" rejects actor without permission", func(t *testing.T) {
			service := newRecordingReceiptService()
			store := fakeActorStore{actor: &authz.Actor{
				ID:          "read-only@example.com",
				TenantID:    "tenant-a",
				Source:      authz.ActorSourcePersisted,
				Scope:       authz.ActorScopeTenant,
				Permissions: map[authz.Permission]struct{}{},
			}}

			app := fiber.New()
			app.Post("/ledger-entries/:entryId/reverse", NewHandler(service, WithActorStore(store)).ReverseEntry)
			app.Post("/ledger-entries/:entryId/replace", NewHandler(service, WithActorStore(store)).ReplaceEntry)

			res := postAuthzJSON(t, app, tc.path, map[string]any{"reason": "authorized correction"}, "read-only@example.com", "tenant-a")
			defer res.Body.Close()

			if res.StatusCode != http.StatusForbidden {
				t.Fatalf("expected status %d, got %d", http.StatusForbidden, res.StatusCode)
			}
			if got := tc.wantCalled(service); got != "" {
				t.Fatalf("service must not be called when actor is forbidden, got %q", got)
			}
		})
	}
}

func TestCurrentAccountHandlerProtectsSettlementOperations(t *testing.T) {
	cases := []struct {
		name       string
		path       string
		permission authz.Permission
		wantCalled func(*recordingReceiptService) string
	}{
		{
			name:       "zero gold",
			path:       "/collaborators/collab-1/zero-gold",
			permission: authz.PermissionJourneySettlementsZeroGold,
			wantCalled: func(s *recordingReceiptService) string { return s.zeroGoldBy },
		},
		{
			name:       "partial payout",
			path:       "/collaborators/collab-1/payout",
			permission: authz.PermissionJourneySettlementsPartialPayout,
			wantCalled: func(s *recordingReceiptService) string { return s.partialPayoutBy },
		},
		{
			name:       "close journey",
			path:       "/collaborators/collab-1/close",
			permission: authz.PermissionJourneySettlementsClose,
			wantCalled: func(s *recordingReceiptService) string { return s.closeJourneyBy },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name+" permits only specific persisted permission", func(t *testing.T) {
			service := newRecordingReceiptService()
			store := fakeActorStore{actor: &authz.Actor{
				ID:          "settlement-operator@example.com",
				TenantID:    "tenant-a",
				Source:      authz.ActorSourcePersisted,
				Scope:       authz.ActorScopeTenant,
				Permissions: map[authz.Permission]struct{}{tc.permission: {}},
			}}

			app := fiber.New()
			app.Post("/collaborators/:collaboratorId/zero-gold", NewHandler(service, WithActorStore(store)).ZeroGold)
			app.Post("/collaborators/:collaboratorId/payout", NewHandler(service, WithActorStore(store)).PartialPayout)
			app.Post("/collaborators/:collaboratorId/close", NewHandler(service, WithActorStore(store)).CloseJourney)

			res := postAuthzJSON(t, app, tc.path, map[string]any{
				"requestId":      "request-1",
				"effectiveDate":  "2026-06-15",
				"notes":          "authorized settlement",
				"brlAmount":      10,
				"goldGramAmount": 1,
				"confirm":        true,
			}, "settlement-operator@example.com", "tenant-a")
			defer res.Body.Close()

			if res.StatusCode != http.StatusOK {
				t.Fatalf("expected status %d, got %d", http.StatusOK, res.StatusCode)
			}
			if got := tc.wantCalled(service); got != "settlement-operator@example.com" {
				t.Fatalf("expected service authorizedBy to use persisted actor id, got %q", got)
			}
		})

		t.Run(tc.name+" rejects actor without permission", func(t *testing.T) {
			service := newRecordingReceiptService()
			store := fakeActorStore{actor: &authz.Actor{
				ID:          "read-only@example.com",
				TenantID:    "tenant-a",
				Source:      authz.ActorSourcePersisted,
				Scope:       authz.ActorScopeTenant,
				Permissions: map[authz.Permission]struct{}{},
			}}

			app := fiber.New()
			app.Post("/collaborators/:collaboratorId/zero-gold", NewHandler(service, WithActorStore(store)).ZeroGold)
			app.Post("/collaborators/:collaboratorId/payout", NewHandler(service, WithActorStore(store)).PartialPayout)
			app.Post("/collaborators/:collaboratorId/close", NewHandler(service, WithActorStore(store)).CloseJourney)

			res := postAuthzJSON(t, app, tc.path, map[string]any{"requestId": "request-1"}, "read-only@example.com", "tenant-a")
			defer res.Body.Close()

			if res.StatusCode != http.StatusForbidden {
				t.Fatalf("expected status %d, got %d", http.StatusForbidden, res.StatusCode)
			}
			if got := tc.wantCalled(service); got != "" {
				t.Fatalf("service must not be called when actor is forbidden, got %q", got)
			}
		})
	}
}

func TestCurrentAccountHandlerAuditsCorrectionReasonMetadata(t *testing.T) {
	service := newRecordingReceiptService()
	audit := &recordingAuditStore{}
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "correction-operator@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{authz.PermissionLedgerCorrectionsCreate: {}},
	}}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/reverse", NewHandler(service, WithActorStore(store), WithAuthorizationAudit(audit)).ReverseEntry)

	res := postAuthzJSON(t, app, "/ledger-entries/entry-1/reverse", map[string]any{
		"reasonCode":    "DUPLICATE_POSTING",
		"reasonText":    "Correct duplicate expense posting",
		"effectiveDate": "2026-06-15",
	}, "correction-operator@example.com", "tenant-a")
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.StatusCode)
	}
	if len(audit.entries) != 1 {
		t.Fatalf("expected 1 audit entry, got %#v", audit.entries)
	}
	got := audit.entries[0]
	if got.Operation != "ledger_entries.reverse" || got.Decision != authz.AuditDecisionAuthorized || got.MetadataJSON == "" {
		t.Fatalf("unexpected audit entry: %#v", got)
	}
	var metadata map[string]any
	if err := json.Unmarshal([]byte(got.MetadataJSON), &metadata); err != nil {
		t.Fatalf("decode audit metadata: %v", err)
	}
	if metadata["reasonCode"] != "DUPLICATE_POSTING" || metadata["reasonText"] != "Correct duplicate expense posting" {
		t.Fatalf("unexpected audit metadata: %+v", metadata)
	}
}

func TestCurrentAccountHandlerRequiresRecentReauthenticationForLedgerCorrection(t *testing.T) {
	service := newRecordingReceiptService()
	audit := &recordingAuditStore{}
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "correction-operator@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{authz.PermissionLedgerCorrectionsCreate: {}},
	}}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/reverse", NewHandler(service, WithActorStore(store), WithAuthorizationAudit(audit)).ReverseEntry)

	payload, err := json.Marshal(map[string]any{
		"reasonCode":    "DUPLICATE_POSTING",
		"reasonText":    "Correct duplicate posting",
		"effectiveDate": "2026-06-15",
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/ledger-entries/entry-1/reverse", strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(authz.HeaderActorID, "correction-operator@example.com")
	req.Header.Set(authz.HeaderTenantID, "tenant-a")

	res, err := app.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.StatusCode)
	}
	if service.reverseEntryBy != "" {
		t.Fatalf("service must not be called without recent reauthentication, got %q", service.reverseEntryBy)
	}
	if len(audit.entries) != 1 || audit.entries[0].Decision != authz.AuditDecisionDenied || !strings.Contains(audit.entries[0].Reason, "recent reauthentication") {
		t.Fatalf("expected denied reauthentication audit event, got %#v", audit.entries)
	}
}

func TestCurrentAccountHandlerRejectsStaleRecentReauthentication(t *testing.T) {
	service := newRecordingReceiptService()
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "correction-operator@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{authz.PermissionLedgerCorrectionsCreate: {}},
	}}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/reverse", NewHandler(service, WithActorStore(store)).ReverseEntry)

	payload, err := json.Marshal(map[string]any{
		"reasonCode":    "DUPLICATE_POSTING",
		"reasonText":    "Correct duplicate posting",
		"effectiveDate": "2026-06-15",
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/ledger-entries/entry-1/reverse", strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(authz.HeaderActorID, "correction-operator@example.com")
	req.Header.Set(authz.HeaderTenantID, "tenant-a")
	req.Header.Set(authz.HeaderReauthenticatedAt, time.Now().UTC().Add(-authz.RecentReauthenticationWindow-time.Minute).Format(time.RFC3339))

	res, err := app.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, res.StatusCode)
	}
	if service.reverseEntryBy != "" {
		t.Fatalf("service must not be called with stale reauthentication, got %q", service.reverseEntryBy)
	}
}

func TestCurrentAccountHandlerAuditsOptionalSecondApprovalMetadata(t *testing.T) {
	service := newRecordingReceiptService()
	audit := &recordingAuditStore{}
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "correction-operator@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{authz.PermissionLedgerCorrectionsCreate: {}},
	}}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/reverse", NewHandler(service, WithActorStore(store), WithAuthorizationAudit(audit)).ReverseEntry)

	res := postAuthzJSON(t, app, "/ledger-entries/entry-1/reverse", map[string]any{
		"reasonCode":    "DUPLICATE_POSTING",
		"reasonText":    "Correct duplicate expense posting",
		"effectiveDate": "2026-06-15",
		"secondApproval": map[string]any{
			"approvedBy": "tenant-admin@example.com",
			"notes":      "Reviewed and approved",
		},
	}, "correction-operator@example.com", "tenant-a")
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, res.StatusCode)
	}
	if len(audit.entries) != 1 {
		t.Fatalf("expected 1 audit entry, got %#v", audit.entries)
	}
	var metadata struct {
		ReasonCode     string `json:"reasonCode"`
		ReasonText     string `json:"reasonText"`
		SecondApproval struct {
			ApprovedBy string `json:"approvedBy"`
			Notes      string `json:"notes"`
		} `json:"secondApproval"`
	}
	if err := json.Unmarshal([]byte(audit.entries[0].MetadataJSON), &metadata); err != nil {
		t.Fatalf("decode audit metadata: %v", err)
	}
	if metadata.SecondApproval.ApprovedBy != "tenant-admin@example.com" || metadata.SecondApproval.Notes != "Reviewed and approved" {
		t.Fatalf("unexpected second approval audit metadata: %+v", metadata)
	}
}

func TestCurrentAccountHandlerEnforcesLedgerCorrectionTenantOwnership(t *testing.T) {
	service := newRecordingReceiptService()
	service.ledgerEntryTenantID = "tenant-b"
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "correction-operator@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{authz.PermissionLedgerCorrectionsCreate: {}},
	}}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/reverse", NewHandler(service, WithActorStore(store)).ReverseEntry)

	res := postAuthzJSON(t, app, "/ledger-entries/entry-1/reverse", map[string]any{
		"reason":        "cross tenant correction",
		"effectiveDate": "2026-06-15",
	}, "correction-operator@example.com", "tenant-a")
	defer res.Body.Close()

	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, res.StatusCode)
	}
	if service.reverseEntryBy != "" {
		t.Fatalf("service must not be called for cross-tenant ledger correction, got %q", service.reverseEntryBy)
	}
}

func TestCurrentAccountHandlerEnforcesSettlementTenantOwnership(t *testing.T) {
	service := newRecordingReceiptService()
	service.collaboratorTenantID = "tenant-b"
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "settlement-operator@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{authz.PermissionJourneySettlementsZeroGold: {}},
	}}

	app := fiber.New()
	app.Post("/collaborators/:collaboratorId/zero-gold", NewHandler(service, WithActorStore(store)).ZeroGold)

	res := postAuthzJSON(t, app, "/collaborators/collab-1/zero-gold", map[string]any{
		"requestId":     "request-1",
		"effectiveDate": "2026-06-15",
	}, "settlement-operator@example.com", "tenant-a")
	defer res.Body.Close()

	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d", http.StatusForbidden, res.StatusCode)
	}
	if service.zeroGoldBy != "" {
		t.Fatalf("service must not be called for cross-tenant settlement, got %q", service.zeroGoldBy)
	}
}

func (s *recordingReceiptService) GetSecondPersonApprovalPolicy(context.Context, string) (*SecondPersonApprovalPolicyDTO, error) {
	return &SecondPersonApprovalPolicyDTO{TenantID: "tenant-a", Required: false}, nil
}
func (s *recordingReceiptService) UpdateSecondPersonApprovalPolicy(context.Context, string, string, UpdateSecondPersonApprovalPolicyRequest) (*SecondPersonApprovalPolicyDTO, error) {
	return &SecondPersonApprovalPolicyDTO{TenantID: "tenant-a", Required: true}, nil
}
func (s *recordingReceiptService) BackfillDebitLedgerReceipts(context.Context, string, bool, ReceiptBackfillRequest) (*ReceiptBackfillResult, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) ListOutstandingReceipts(context.Context, ReceiptListFilter) (*OutstandingReceiptListResult, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) GetPrintableReceipt(context.Context, string) (*PrintableReceiptDTO, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) ReturnReceipt(context.Context, string, string, ReturnReceiptRequest) (*PrintableReceiptDTO, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) FinancialProjection(context.Context, string) (*FinancialProjectionDTO, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) SettlementPreview(context.Context, string) (*SettlementPreviewDTO, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) ZeroGold(_ context.Context, _ string, authorizedBy string, _ ZeroGoldRequest) (*ZeroGoldResult, error) {
	s.zeroGoldBy = authorizedBy
	return &ZeroGoldResult{Settlement: JourneySettlementDTO{ID: "settlement-1", AuthorizedBy: authorizedBy}}, nil
}
func (s *recordingReceiptService) PartialPayout(_ context.Context, _ string, authorizedBy string, _ PartialPayoutRequest) (*PartialPayoutResult, error) {
	s.partialPayoutBy = authorizedBy
	return &PartialPayoutResult{Settlement: JourneySettlementDTO{ID: "settlement-1", AuthorizedBy: authorizedBy}}, nil
}
func (s *recordingReceiptService) CloseJourney(_ context.Context, _ string, authorizedBy string, _ CloseJourneyRequest) (*CloseJourneyResult, error) {
	s.closeJourneyBy = authorizedBy
	return &CloseJourneyResult{Settlement: JourneySettlementDTO{ID: "settlement-1", AuthorizedBy: authorizedBy}}, nil
}
func (s *recordingReceiptService) CollaboratorTenantID(context.Context, string) (string, error) {
	return s.collaboratorTenantID, nil
}
func (s *recordingReceiptService) LedgerEntryTenantID(context.Context, string) (string, error) {
	return s.ledgerEntryTenantID, nil
}
func (s *recordingReceiptService) AuthorizeSettlement(string) error { return nil }
func (s *recordingReceiptService) GetDetail(context.Context, string, LedgerEntryListFilter) (*CurrentAccountDetailDTO, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) ListEntries(context.Context, string, LedgerEntryListFilter) (*LedgerEntryListResult, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) ListBalances(context.Context, string) ([]CurrentAccountBalanceDTO, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) ReverseEntry(_ context.Context, _ string, authorizedBy string, _ ReverseLedgerEntryRequest) (*LedgerCorrectionResult, error) {
	s.reverseEntryBy = authorizedBy
	return &LedgerCorrectionResult{Reversal: LedgerEntryDTO{ID: "reversal-1", AuthorizedBy: authorizedBy}}, nil
}
func (s *recordingReceiptService) ReplaceEntry(_ context.Context, _ string, authorizedBy string, _ ReplaceLedgerEntryRequest) (*LedgerCorrectionResult, error) {
	s.replaceEntryBy = authorizedBy
	return &LedgerCorrectionResult{Reversal: LedgerEntryDTO{ID: "reversal-1", AuthorizedBy: authorizedBy}, Replacement: &LedgerEntryDTO{ID: "replacement-1", AuthorizedBy: authorizedBy}}, nil
}
func (s *recordingReceiptService) AuthorizeCorrection(string) error { return nil }

func postAuthzJSON(t *testing.T, app *fiber.App, path string, body map[string]any, actorID, tenantID string) *http.Response {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(authz.HeaderActorID, actorID)
	req.Header.Set(authz.HeaderTenantID, tenantID)
	req.Header.Set(authz.HeaderReauthenticatedAt, time.Now().UTC().Format(time.RFC3339))
	req.Header.Set(authz.HeaderReauthenticationMethod, "password")
	res, err := app.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	return res
}
