package people

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/tenants"
)

type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) List(c fiber.Ctx) error {
	var filter PersonListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}

	items, total, err := h.service.List(c.Context(), requestTenantID(c), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{
		Data: map[string]any{
			"items": items,
			"total": total,
		},
	})
}

func (h *Handler) Create(c fiber.Ctx) error {
	var req CreatePersonRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	created, err := h.service.Create(c.Context(), requestTenantID(c), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{
		Data: created,
	})
}

func (h *Handler) GetByID(c fiber.Ctx) error {
	id := c.Params("id")

	item, err := h.service.GetByID(c.Context(), requestTenantID(c), id)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{
		Data: item,
	})
}

func (h *Handler) Update(c fiber.Ctx) error {
	id := c.Params("id")

	var req UpdatePersonRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	updated, err := h.service.Update(c.Context(), requestTenantID(c), id, req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{
		Data: updated,
	})
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

func actorUserID(c fiber.Ctx) string {
	value := c.Locals("userID")
	if userID, ok := value.(string); ok {
		return userID
	}
	return "system"
}
