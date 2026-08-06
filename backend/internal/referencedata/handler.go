package referencedata

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/tenants"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) ListByType(c fiber.Ctx) error {
	rows, err := h.service.ListByType(c.Context(), requestTenantID(c), c.Params("type"))
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
	row, err := h.service.Create(c.Context(), requestTenantID(c), c.Params("type"), req)
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
	row, err := h.service.Update(c.Context(), requestTenantID(c), c.Params("type"), c.Params("id"), req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, row)
}

func (h *Handler) Deactivate(c fiber.Ctx) error {
	row, err := h.service.Deactivate(c.Context(), requestTenantID(c), c.Params("type"), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, row)
}

func (h *Handler) Reactivate(c fiber.Ctx) error {
	row, err := h.service.Reactivate(c.Context(), requestTenantID(c), c.Params("type"), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, row)
}

func requestTenantID(c fiber.Ctx) string {
	if actor, err := authz.RequestActorFromContext(c); err == nil && actor != nil {
		tenantID := strings.TrimSpace(actor.TenantID)
		if tenantID != "" && tenantID != authz.GlobalTenantScope {
			return tenantID
		}
	}

	// Route-disabled handler tests do not install an authoritative actor. Honor
	// their explicit tenant header while retaining the historic default fallback.
	if tenantID := strings.TrimSpace(c.Get(authz.HeaderTenantID)); tenantID != "" {
		return tenantID
	}
	return tenants.DefaultTenantID
}
