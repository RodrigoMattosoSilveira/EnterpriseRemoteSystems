package currentaccounts

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
)

type Handler struct {
	service    Service
	actorStore authz.ActorStore
	auditStore authz.AuditLogStore
}

type HandlerOption func(*Handler)

func WithActorStore(store authz.ActorStore) HandlerOption {
	return func(h *Handler) {
		h.actorStore = store
	}
}

func WithAuthorizationAudit(store authz.AuditLogStore) HandlerOption {
	return func(h *Handler) {
		h.auditStore = store
	}
}

func NewHandler(service Service, opts ...HandlerOption) *Handler {
	h := &Handler{service: service}
	for _, opt := range opts {
		if opt != nil {
			opt(h)
		}
	}
	return h
}

func (h *Handler) ZeroGold(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionJourneySettlementsZeroGold, "current_accounts.zero_gold", "collaborator", c.Params("collaboratorId"))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireCollaboratorTenantScope(c, actor, c.Params("collaboratorId")); err != nil || !ok {
		return err
	}
	var req ZeroGoldRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ZeroGold(c.Context(), c.Params("collaboratorId"), actor.ID, req)
	if err != nil {
		if errors.Is(err, ErrNoPositiveGoldBalance) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "no_positive_gold_balance", Message: err.Error()}})
		}
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) PartialPayout(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionJourneySettlementsPartialPayout, "current_accounts.partial_payout", "collaborator", c.Params("collaboratorId"))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireCollaboratorTenantScope(c, actor, c.Params("collaboratorId")); err != nil || !ok {
		return err
	}
	var req PartialPayoutRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.PartialPayout(c.Context(), c.Params("collaboratorId"), actor.ID, req)
	if err != nil {
		if errors.Is(err, ErrPayoutExceedsAvailableBalance) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "payout_exceeds_available_balance", Message: err.Error()}})
		}
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) CloseJourney(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionJourneySettlementsClose, "current_accounts.close_journey", "collaborator", c.Params("collaboratorId"))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireCollaboratorTenantScope(c, actor, c.Params("collaboratorId")); err != nil || !ok {
		return err
	}
	var req CloseJourneyRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.CloseJourney(c.Context(), c.Params("collaboratorId"), actor.ID, req)
	if err != nil {
		if errors.Is(err, ErrJourneyAlreadyClosed) || errors.Is(err, ErrJourneyCloseBlocked) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "journey_close_conflict", Message: err.Error()}})
		}
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func writeSettlementAuthorizationError(c fiber.Ctx, err error) error {
	if errors.Is(err, ErrLedgerSettlementDisabled) {
		return c.Status(fiber.StatusServiceUnavailable).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "ledger_settlement_disabled", Message: "Ledger settlement authorization is not configured"}})
	}
	return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Ledger settlement authorization failed"}})
}

func (h *Handler) FinancialProjection(c fiber.Ctx) error {
	result, err := h.service.FinancialProjection(c.Context(), c.Params("collaboratorId"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) SettlementPreview(c fiber.Ctx) error {
	result, err := h.service.SettlementPreview(c.Context(), c.Params("collaboratorId"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) GetDetail(c fiber.Ctx) error {
	var filter LedgerEntryListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.GetDetail(c.Context(), c.Params("collaboratorId"), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) ListEntries(c fiber.Ctx) error {
	var filter LedgerEntryListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ListEntries(c.Context(), c.Params("collaboratorId"), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) ListBalances(c fiber.Ctx) error {
	result, err := h.service.ListBalances(c.Context(), c.Params("collaboratorId"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) ReverseEntry(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionLedgerCorrectionsCreate, "ledger_entries.reverse", "ledger_entry", c.Params("entryId"))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireLedgerEntryTenantScope(c, actor, c.Params("entryId")); err != nil || !ok {
		return err
	}
	var req ReverseLedgerEntryRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ReverseEntry(c.Context(), c.Params("entryId"), actor.ID, req)
	if err != nil {
		return writeCorrectionError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) ReplaceEntry(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionLedgerCorrectionsCreate, "ledger_entries.replace", "ledger_entry", c.Params("entryId"))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireLedgerEntryTenantScope(c, actor, c.Params("entryId")); err != nil || !ok {
		return err
	}
	var req ReplaceLedgerEntryRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ReplaceEntry(c.Context(), c.Params("entryId"), actor.ID, req)
	if err != nil {
		return writeCorrectionError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func writeCorrectionAuthorizationError(c fiber.Ctx, err error) error {
	if errors.Is(err, ErrLedgerCorrectionDisabled) {
		return c.Status(fiber.StatusServiceUnavailable).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "ledger_correction_disabled", Message: "Ledger correction authorization is not configured"}})
	}
	return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Ledger correction authorization failed"}})
}

func writeCorrectionError(c fiber.Ctx, err error) error {
	if errors.Is(err, ErrLedgerEntryAlreadyReversed) || errors.Is(err, ErrLedgerEntryNotCorrectable) {
		return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "ledger_correction_conflict", Message: err.Error()}})
	}
	return httpx.WriteError(c, err)
}

func (h *Handler) GetPrintableReceipt(c fiber.Ctx) error {
	result, err := h.service.GetPrintableReceipt(c.Context(), c.Params("entryId"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) PrintReceipt(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionLedgerReceiptsPrint, "ledger_receipts.print", "ledger_entry", c.Params("entryId"), authz.WithLegacyAuthorizedByCompatibility())
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	result, err := h.service.PrintReceipt(c.Context(), c.Params("entryId"), actor.ID)
	if err != nil {
		if errors.Is(err, ErrReceiptCancelled) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "receipt_cancelled", Message: err.Error()}})
		}
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) ReturnReceipt(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionLedgerReceiptsReturn, "ledger_receipts.return", "ledger_entry", c.Params("entryId"), authz.WithLegacyAuthorizedByCompatibility())
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	var req ReturnReceiptRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ReturnReceipt(c.Context(), c.Params("entryId"), actor.ID, req)
	if err != nil {
		if errors.Is(err, ErrReceiptCancelled) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "receipt_cancelled", Message: err.Error()}})
		}
		if errors.Is(err, ErrReceiptAlreadyReturned) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "receipt_already_returned", Message: err.Error()}})
		}
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) requireReceiptPermission(c fiber.Ctx, permission authz.Permission) (*authz.Actor, bool, error) {
	return h.authorizeSensitiveOperation(c, permission, "ledger_receipts.operation", "ledger_receipt", c.Params("entryId"), authz.WithLegacyAuthorizedByCompatibility())
}

func (h *Handler) requireCurrentAccountPermission(c fiber.Ctx, permission authz.Permission, opts ...authz.RequireOption) (*authz.Actor, bool, error) {
	return h.authorizeSensitiveOperation(c, permission, "current_accounts.operation", "", "", opts...)
}

func (h *Handler) authorizeSensitiveOperation(c fiber.Ctx, permission authz.Permission, operation, targetType, targetID string, opts ...authz.RequireOption) (*authz.Actor, bool, error) {
	fallbackActorID := c.Get(authz.HeaderActorID)
	if strings.TrimSpace(fallbackActorID) == "" {
		fallbackActorID = c.Get(authz.HeaderAuthorizedBy)
	}
	tenantID := c.Get(authz.HeaderTenantID)
	actor, err := authz.ResolveActor(c.Context(), h.actorStore, func(name string) string { return c.Get(name) })
	if err != nil {
		h.recordAuthorizationAudit(c, nil, fallbackActorID, tenantID, permission, operation, targetType, targetID, authz.AuditDecisionDenied, err.Error())
		return nil, false, writeAuthorizationError(c, err)
	}
	if err := authz.RequirePermission(actor, permission, opts...); err != nil {
		h.recordAuthorizationAudit(c, actor, fallbackActorID, tenantID, permission, operation, targetType, targetID, authz.AuditDecisionDenied, err.Error())
		return nil, false, writeAuthorizationError(c, err)
	}
	h.recordAuthorizationAudit(c, actor, fallbackActorID, tenantID, permission, operation, targetType, targetID, authz.AuditDecisionAuthorized, "")
	return actor, true, nil
}

func (h *Handler) recordAuthorizationAudit(c fiber.Ctx, actor *authz.Actor, fallbackActorID string, tenantID string, permission authz.Permission, operation, targetType, targetID string, decision string, reason string) {
	if h.auditStore == nil {
		return
	}
	_ = h.auditStore.RecordAuthorizationAudit(c.Context(), authz.AuthorizationAuditEntry{
		Actor:           actor,
		FallbackActorID: fallbackActorID,
		TenantID:        tenantID,
		Permission:      permission,
		Operation:       operation,
		TargetType:      targetType,
		TargetID:        targetID,
		Decision:        decision,
		Reason:          reason,
		RequestMethod:   c.Method(),
		RequestPath:     c.Path(),
	})
}

func (h *Handler) requireCollaboratorTenantScope(c fiber.Ctx, actor *authz.Actor, collaboratorID string) (bool, error) {
	tenantID, err := h.service.CollaboratorTenantID(c.Context(), collaboratorID)
	if err != nil {
		return false, httpx.WriteError(c, err)
	}
	return h.requireActorTenantScope(c, actor, tenantID)
}

func (h *Handler) requireLedgerEntryTenantScope(c fiber.Ctx, actor *authz.Actor, entryID string) (bool, error) {
	tenantID, err := h.service.LedgerEntryTenantID(c.Context(), entryID)
	if err != nil {
		return false, httpx.WriteError(c, err)
	}
	return h.requireActorTenantScope(c, actor, tenantID)
}

func (h *Handler) requireActorTenantScope(c fiber.Ctx, actor *authz.Actor, tenantID string) (bool, error) {
	if err := authz.RequireTenantScope(actor, tenantID); err != nil {
		return false, writeAuthorizationError(c, err)
	}
	return true, nil
}

func writeAuthorizationError(c fiber.Ctx, err error) error {
	if errors.Is(err, authz.ErrMissingActor) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "missing_actor", Message: "Authorization actor is required"}})
	}
	if errors.Is(err, authz.ErrForbidden) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Actor is not permitted to perform this operation"}})
	}
	return httpx.WriteError(c, err)
}

func (h *Handler) ListOutstandingReceipts(c fiber.Ctx) error {
	var filter ReceiptListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ListOutstandingReceipts(c.Context(), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}
func (h *Handler) BackfillDebitLedgerReceipts(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionLedgerReceiptsBackfill, "ledger_receipts.backfill_debit_entries", "ledger_receipts", "debit-ledger-entries", authz.WithLegacyAuthorizedByCompatibility())
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	dryRun := strings.EqualFold(strings.TrimSpace(c.Query("dryRun")), "true")
	result, err := h.service.BackfillDebitLedgerReceipts(c.Context(), actor.ID, dryRun)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}
