package referencedata

import (
	"github.com/gofiber/fiber/v3"
	"enterpriseremotesystems/backend/internal/shared/httpx"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }
func (h *Handler) ListByType(c fiber.Ctx) error {
	rows, err := h.service.ListByType(c.Context(), c.Params("type"))
	if err != nil {
		return httpx.ServerError(c, err)
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
		return httpx.ServerError(c, err)
	}
	return httpx.Created(c, row)
}
