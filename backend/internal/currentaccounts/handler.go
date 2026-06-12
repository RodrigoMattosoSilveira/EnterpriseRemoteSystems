package currentaccounts

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) ZeroGold(c fiber.Ctx) error {
	if err := h.service.AuthorizeSettlement(c.Get("X-Ledger-Settlement-Key")); err != nil {
		return writeSettlementAuthorizationError(c, err)
	}
	var req ZeroGoldRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ZeroGold(c.Context(), c.Params("collaboratorId"), c.Get("X-Authorized-By"), req)
	if err != nil {
		if errors.Is(err, ErrNoPositiveGoldBalance) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "no_positive_gold_balance", Message: err.Error()}})
		}
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) PartialPayout(c fiber.Ctx) error {
	if err := h.service.AuthorizeSettlement(c.Get("X-Ledger-Settlement-Key")); err != nil {
		return writeSettlementAuthorizationError(c, err)
	}
	var req PartialPayoutRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.PartialPayout(c.Context(), c.Params("collaboratorId"), c.Get("X-Authorized-By"), req)
	if err != nil {
		if errors.Is(err, ErrPayoutExceedsAvailableBalance) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "payout_exceeds_available_balance", Message: err.Error()}})
		}
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) CloseJourney(c fiber.Ctx) error {
	if err := h.service.AuthorizeSettlement(c.Get("X-Ledger-Settlement-Key")); err != nil {
		return writeSettlementAuthorizationError(c, err)
	}
	var req CloseJourneyRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.CloseJourney(c.Context(), c.Params("collaboratorId"), c.Get("X-Authorized-By"), req)
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
	if err := h.service.AuthorizeCorrection(c.Get("X-Ledger-Correction-Key")); err != nil {
		return writeCorrectionAuthorizationError(c, err)
	}
	var req ReverseLedgerEntryRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ReverseEntry(c.Context(), c.Params("entryId"), c.Get("X-Authorized-By"), req)
	if err != nil {
		return writeCorrectionError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) ReplaceEntry(c fiber.Ctx) error {
	if err := h.service.AuthorizeCorrection(c.Get("X-Ledger-Correction-Key")); err != nil {
		return writeCorrectionAuthorizationError(c, err)
	}
	var req ReplaceLedgerEntryRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ReplaceEntry(c.Context(), c.Params("entryId"), c.Get("X-Authorized-By"), req)
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
	actor, authorized, err := requireReceiptPermission(c, authz.PermissionLedgerReceiptsPrint)
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
	actor, authorized, err := requireReceiptPermission(c, authz.PermissionLedgerReceiptsReturn)
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

func requireReceiptPermission(c fiber.Ctx, permission authz.Permission) (*authz.Actor, bool, error) {
	actor, err := authz.ExtractActor(func(name string) string { return c.Get(name) })
	if err != nil {
		return nil, false, writeAuthorizationError(c, err)
	}
	if err := authz.RequirePermission(actor, permission, authz.WithLegacyAuthorizedByCompatibility()); err != nil {
		return nil, false, writeAuthorizationError(c, err)
	}
	return actor, true, nil
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
	actor, authorized, err := requireReceiptPermission(c, authz.PermissionLedgerReceiptsBackfill)
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
