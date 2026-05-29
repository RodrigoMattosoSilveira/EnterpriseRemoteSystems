package referencedata

import (
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"github.com/gofiber/fiber/v3"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) ListByType(c fiber.Ctx) error {
	rows, err := h.service.ListByType(c.Context(), c.Params("type"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, rows)
}

func (h *Handler) Create(c fiber.Ctx) error {
	var req CreateReferenceDataRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	row, err := h.service.Create(c.Context(), c.Params("type"), req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.Created(c, row)
}

func (h *Handler) Update(c fiber.Ctx) error {
	var req UpdateReferenceDataRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	row, err := h.service.Update(c.Context(), c.Params("type"), c.Params("id"), req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, row)
}

func (h *Handler) Deactivate(c fiber.Ctx) error {
	row, err := h.service.Deactivate(c.Context(), c.Params("type"), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, row)
}

func (h *Handler) Reactivate(c fiber.Ctx) error {
	row, err := h.service.Reactivate(c.Context(), c.Params("type"), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, row)
}
