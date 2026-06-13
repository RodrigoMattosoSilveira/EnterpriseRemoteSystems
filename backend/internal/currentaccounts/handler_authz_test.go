package currentaccounts

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

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

type recordingReceiptService struct {
	printedBy string
}

func (s *recordingReceiptService) PrintReceipt(_ context.Context, _ string, printedBy string) (*PrintableReceiptDTO, error) {
	s.printedBy = printedBy
	return &PrintableReceiptDTO{ID: "receipt-1", Status: "PRINTED", LedgerEntryID: "entry-1", IssuedBy: printedBy}, nil
}

func TestReceiptHandlerResolvesPersistedActorFromRequestHeaders(t *testing.T) {
	service := &recordingReceiptService{}
	store := fakeActorStore{actor: &authz.Actor{
		ID:          "expense-operator@example.com",
		TenantID:    "tenant-a",
		Source:      authz.ActorSourcePersisted,
		Scope:       authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{authz.PermissionLedgerReceiptsPrint: {}},
	}}

	app := fiber.New()
	app.Post("/ledger-entries/:entryId/receipt/print", NewHandler(service, WithActorStore(store)).PrintReceipt)

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
	service := &recordingReceiptService{}
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

func (s *recordingReceiptService) BackfillDebitLedgerReceipts(context.Context, string, bool) (*ReceiptBackfillResult, error) {
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
func (s *recordingReceiptService) ZeroGold(context.Context, string, string, ZeroGoldRequest) (*ZeroGoldResult, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) PartialPayout(context.Context, string, string, PartialPayoutRequest) (*PartialPayoutResult, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) CloseJourney(context.Context, string, string, CloseJourneyRequest) (*CloseJourneyResult, error) {
	return nil, errors.New("not implemented")
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
func (s *recordingReceiptService) ReverseEntry(context.Context, string, string, ReverseLedgerEntryRequest) (*LedgerCorrectionResult, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) ReplaceEntry(context.Context, string, string, ReplaceLedgerEntryRequest) (*LedgerCorrectionResult, error) {
	return nil, errors.New("not implemented")
}
func (s *recordingReceiptService) AuthorizeCorrection(string) error { return nil }
