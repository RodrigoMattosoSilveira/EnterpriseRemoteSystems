package currentaccounts

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

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

func (h *Handler) GetSecondPersonApprovalPolicy(c fiber.Ctx) error {
	actor, authorized, err := h.authorizeSensitiveOperation(c, authz.PermissionCurrentAccountsSettingsRead, "current_accounts.second_person_approval_policy.read", "tenant_setting", SecondPersonApprovalPolicyKey)
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	tenantID := tenantIDForPolicyRequest(c, actor)
	if ok, err := h.requireActorTenantScope(c, actor, tenantID); err != nil || !ok {
		return err
	}
	result, err := h.service.GetSecondPersonApprovalPolicy(c.Context(), tenantID)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) UpdateSecondPersonApprovalPolicy(c fiber.Ctx) error {
	var req UpdateSecondPersonApprovalPolicyRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	actor, authorized, err := h.authorizeSensitiveOperationWithMetadata(c, authz.PermissionCurrentAccountsSettingsUpdate, "current_accounts.second_person_approval_policy.update", "tenant_setting", SecondPersonApprovalPolicyKey, secondPersonApprovalPolicyAuditMetadata(req))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	tenantID := tenantIDForPolicyRequest(c, actor)
	if ok, err := h.requireActorTenantScope(c, actor, tenantID); err != nil || !ok {
		return err
	}
	result, err := h.service.UpdateSecondPersonApprovalPolicy(c.Context(), tenantID, actor.ID, req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) ZeroGold(c fiber.Ctx) error {
	var req ZeroGoldRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	actor, authorized, err := h.authorizeRecentlyReauthenticatedSensitiveOperationWithMetadata(c, authz.PermissionJourneySettlementsZeroGold, "current_accounts.zero_gold", "collaborator", c.Params("collaboratorId"), correctionReasonAuditMetadata(req.CorrectionReasonRequest))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireCollaboratorTenantScope(c, actor, c.Params("collaboratorId")); err != nil || !ok {
		return err
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
	var req PartialPayoutRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	actor, authorized, err := h.authorizeRecentlyReauthenticatedSensitiveOperationWithMetadata(c, authz.PermissionJourneySettlementsPartialPayout, "current_accounts.partial_payout", "collaborator", c.Params("collaboratorId"), correctionReasonAuditMetadata(req.CorrectionReasonRequest))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireCollaboratorTenantScope(c, actor, c.Params("collaboratorId")); err != nil || !ok {
		return err
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
	var req CloseJourneyRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	actor, authorized, err := h.authorizeRecentlyReauthenticatedSensitiveOperationWithMetadata(c, authz.PermissionJourneySettlementsClose, "current_accounts.close_journey", "collaborator", c.Params("collaboratorId"), correctionReasonAuditMetadata(req.CorrectionReasonRequest))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireCollaboratorTenantScope(c, actor, c.Params("collaboratorId")); err != nil || !ok {
		return err
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
	var req ReverseLedgerEntryRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	actor, authorized, err := h.authorizeRecentlyReauthenticatedSensitiveOperationWithMetadata(c, authz.PermissionLedgerCorrectionsCreate, "ledger_entries.reverse", "ledger_entry", c.Params("entryId"), correctionReasonAuditMetadata(req.CorrectionReasonRequest))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireLedgerEntryTenantScope(c, actor, c.Params("entryId")); err != nil || !ok {
		return err
	}
	result, err := h.service.ReverseEntry(c.Context(), c.Params("entryId"), actor.ID, req)
	if err != nil {
		return writeCorrectionError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) ReplaceEntry(c fiber.Ctx) error {
	var req ReplaceLedgerEntryRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	actor, authorized, err := h.authorizeRecentlyReauthenticatedSensitiveOperationWithMetadata(c, authz.PermissionLedgerCorrectionsCreate, "ledger_entries.replace", "ledger_entry", c.Params("entryId"), correctionReasonAuditMetadata(req.CorrectionReasonRequest))
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	if ok, err := h.requireLedgerEntryTenantScope(c, actor, c.Params("entryId")); err != nil || !ok {
		return err
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
	return h.authorizeSensitiveOperationWithMetadata(c, permission, operation, targetType, targetID, "", opts...)
}

func (h *Handler) authorizeSensitiveOperationWithMetadata(c fiber.Ctx, permission authz.Permission, operation, targetType, targetID string, metadataJSON string, opts ...authz.RequireOption) (*authz.Actor, bool, error) {
	return h.authorizeSensitiveOperationInternal(c, permission, operation, targetType, targetID, metadataJSON, false, opts...)
}

func (h *Handler) authorizeRecentlyReauthenticatedSensitiveOperationWithMetadata(c fiber.Ctx, permission authz.Permission, operation, targetType, targetID string, metadataJSON string, opts ...authz.RequireOption) (*authz.Actor, bool, error) {
	return h.authorizeSensitiveOperationInternal(c, permission, operation, targetType, targetID, metadataJSON, true, opts...)
}

func (h *Handler) authorizeSensitiveOperationInternal(c fiber.Ctx, permission authz.Permission, operation, targetType, targetID string, metadataJSON string, requireRecentReauth bool, opts ...authz.RequireOption) (*authz.Actor, bool, error) {
	fallbackActorID := c.Get(authz.HeaderActorID)
	if strings.TrimSpace(fallbackActorID) == "" {
		fallbackActorID = c.Get(authz.HeaderAuthorizedBy)
	}
	tenantID := c.Get(authz.HeaderTenantID)
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil {
		h.recordAuthorizationAudit(c, nil, fallbackActorID, tenantID, permission, operation, targetType, targetID, authz.AuditDecisionDenied, err.Error(), metadataJSON)
		return nil, false, writeAuthorizationError(c, err)
	}
	if err := authz.RequirePermission(actor, permission, opts...); err != nil {
		h.recordAuthorizationAudit(c, actor, fallbackActorID, tenantID, permission, operation, targetType, targetID, authz.AuditDecisionDenied, err.Error(), metadataJSON)
		return nil, false, writeAuthorizationError(c, err)
	}
	if requireRecentReauth {
		reauth, err := authz.RequireRecentReauthentication(func(name string) string { return c.Get(name) }, time.Now().UTC())
		if err != nil {
			h.recordAuthorizationAudit(c, actor, fallbackActorID, tenantID, permission, operation, targetType, targetID, authz.AuditDecisionDenied, err.Error(), metadataJSON)
			return nil, false, writeRecentReauthenticationError(c, err)
		}
		metadataJSON = mergeRecentReauthenticationAuditMetadata(metadataJSON, reauth)
	}
	h.recordAuthorizationAudit(c, actor, fallbackActorID, tenantID, permission, operation, targetType, targetID, authz.AuditDecisionAuthorized, "", metadataJSON)
	return actor, true, nil
}

func (h *Handler) recordAuthorizationAudit(c fiber.Ctx, actor *authz.Actor, fallbackActorID string, tenantID string, permission authz.Permission, operation, targetType, targetID string, decision string, reason string, metadataJSON string) {
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
		MetadataJSON:    metadataJSON,
		RequestMethod:   c.Method(),
		RequestPath:     c.Path(),
	})
}

func writeRecentReauthenticationError(c fiber.Ctx, err error) error {
	if errors.Is(err, authz.ErrRecentReauthenticationRequired) || errors.Is(err, authz.ErrRecentReauthenticationInvalid) || errors.Is(err, authz.ErrRecentReauthenticationStale) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "recent_reauthentication_required", Message: "Recent reauthentication is required for this sensitive operation"}})
	}
	return httpx.WriteError(c, err)
}

func mergeRecentReauthenticationAuditMetadata(metadataJSON string, reauth *authz.RecentReauthentication) string {
	payload := map[string]any{}
	if strings.TrimSpace(metadataJSON) != "" {
		_ = json.Unmarshal([]byte(metadataJSON), &payload)
	}
	if reauth != nil {
		payload["recentReauthentication"] = map[string]string{
			"authenticatedAt": reauth.AuthenticatedAt.UTC().Format(time.RFC3339),
			"method":          reauth.Method,
		}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return metadataJSON
	}
	return string(encoded)
}

func tenantIDForPolicyRequest(c fiber.Ctx, actor *authz.Actor) string {
	if actor != nil && actor.Scope == authz.ActorScopeTenant && strings.TrimSpace(actor.TenantID) != "" {
		return strings.TrimSpace(actor.TenantID)
	}
	if tenantID := strings.TrimSpace(c.Get(authz.HeaderTenantID)); tenantID != "" {
		return tenantID
	}
	return defaultTenantID
}

func secondPersonApprovalPolicyAuditMetadata(req UpdateSecondPersonApprovalPolicyRequest) string {
	encoded, err := json.Marshal(map[string]any{"required": req.Required})
	if err != nil {
		return ""
	}
	return string(encoded)
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
	if errors.Is(err, authz.ErrAuthenticationRequired) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "authentication_required", Message: "An authenticated session is required"}})
	}
	if errors.Is(err, authz.ErrTenantSelectionRequired) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "tenant_selection_required", Message: "A specific tenant must be selected for this operation"}})
	}
	if errors.Is(err, authz.ErrMissingActor) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "missing_actor", Message: "Authorization actor is required"}})
	}
	if errors.Is(err, authz.ErrForbidden) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Actor is not permitted to perform this operation"}})
	}
	return httpx.WriteError(c, err)
}

func correctionReasonAuditMetadata(req CorrectionReasonRequest) string {
	payload := map[string]any{}
	code, text := normalizedCorrectionReason(req)
	if code != "" || text != "" {
		payload["reasonCode"] = code
		payload["reasonText"] = text
	}
	approvedBy, notes := normalizedSecondApproval(req)
	if approvedBy != "" || notes != "" {
		payload["secondApproval"] = map[string]string{
			"approvedBy": approvedBy,
			"notes":      notes,
		}
	}
	if len(payload) == 0 {
		return ""
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	return string(encoded)
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
	var req ReceiptBackfillRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	actor, authorized, err := h.authorizeRecentlyReauthenticatedSensitiveOperationWithMetadata(c, authz.PermissionLedgerReceiptsBackfill, "ledger_receipts.backfill_debit_entries", "ledger_receipts", "debit-ledger-entries", correctionReasonAuditMetadata(req.CorrectionReasonRequest), authz.WithLegacyAuthorizedByCompatibility())
	if err != nil {
		return err
	}
	if !authorized {
		return nil
	}
	dryRun := strings.EqualFold(strings.TrimSpace(c.Query("dryRun")), "true")
	result, err := h.service.BackfillDebitLedgerReceipts(c.Context(), actor.ID, dryRun, req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}
