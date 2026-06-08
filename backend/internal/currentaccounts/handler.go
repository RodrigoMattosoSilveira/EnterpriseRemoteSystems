package currentaccounts

import (
	"errors"

	"github.com/gofiber/fiber/v3"

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

func writeSettlementAuthorizationError(c fiber.Ctx, err error) error {
	if errors.Is(err, ErrLedgerSettlementDisabled) {
		return c.Status(fiber.StatusServiceUnavailable).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "ledger_settlement_disabled", Message: "Ledger settlement authorization is not configured"}})
	}
	return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Ledger settlement authorization failed"}})
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
