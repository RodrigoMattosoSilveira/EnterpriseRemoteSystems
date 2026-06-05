package tenants

import (
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"github.com/gofiber/fiber/v3"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) Current(c fiber.Ctx) error {
	tenant, err := h.service.GetCurrent(c.Context())
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, tenant)
}
