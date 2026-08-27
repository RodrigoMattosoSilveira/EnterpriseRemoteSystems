package accruals

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/shared/requesttenant"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) ListRunsByWorkPeriod(c fiber.Ctx) error {
	var filter AccrualRunListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ListRunsByWorkPeriod(requesttenant.Context(c), c.Params("id"), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) CreateRun(c fiber.Ctx) error {
	var req CreateAccrualRunRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	created, err := h.service.CreateRun(requesttenant.Context(c), c.Params("id"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{Data: created})
}

func (h *Handler) GetRunByID(c fiber.Ctx) error {
	run, err := h.service.GetRunByID(requesttenant.Context(c), c.Params("runId"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: run})
}

func (h *Handler) RecalculateRun(c fiber.Ctx) error {
	run, err := h.service.RecalculateRun(requesttenant.Context(c), c.Params("runId"), actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: run})
}

func (h *Handler) PostRun(c fiber.Ctx) error {
	run, err := h.service.PostRun(requesttenant.Context(c), c.Params("runId"), actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: run})
}

func (h *Handler) ListItemsByRun(c fiber.Ctx) error {
	var filter AccrualItemListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.ListItemsByRun(requesttenant.Context(c), c.Params("runId"), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func actorUserID(c fiber.Ctx) string {
	value := c.Locals("userID")
	if userID, ok := value.(string); ok {
		return userID
	}
	return "system"
}
