package currentaccounts

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/shared/httpx"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

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
