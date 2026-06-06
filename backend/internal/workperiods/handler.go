package workperiods

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/shared/httpx"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) List(c fiber.Ctx) error {
	var filter WorkPeriodListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}

	result, err := h.service.List(c.Context(), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) Create(c fiber.Ctx) error {
	var req CreateWorkPeriodRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	created, err := h.service.Create(c.Context(), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{Data: created})
}

func (h *Handler) GetByID(c fiber.Ctx) error {
	item, err := h.service.GetByID(c.Context(), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: item})
}

func (h *Handler) Inform(c fiber.Ctx) error {
	updated, err := h.service.Inform(c.Context(), c.Params("id"), actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) PrintRoster(c fiber.Ctx) error {
	roster, err := h.service.PrintRoster(c.Context(), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: roster})
}

func actorUserID(c fiber.Ctx) string {
	value := c.Locals("userID")
	if userID, ok := value.(string); ok {
		return userID
	}
	return "system"
}
