package pricelists

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/tenants"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) ListItems(c fiber.Ctx) error {
	var filter PriceListItemListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}
	items, err := h.service.ListItems(c.Context(), requestTenantID(c), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: items})
}

func (h *Handler) CreateItem(c fiber.Ctx) error {
	var req CreatePriceListItemRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	created, err := h.service.CreateItem(c.Context(), requestTenantID(c), req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{Data: created})
}

func (h *Handler) UpdateItem(c fiber.Ctx) error {
	var req UpdatePriceListItemRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	updated, err := h.service.UpdateItem(c.Context(), requestTenantID(c), c.Params("id"), req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) DeactivateItem(c fiber.Ctx) error {
	updated, err := h.service.DeactivateItem(c.Context(), requestTenantID(c), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) ReactivateItem(c fiber.Ctx) error {
	updated, err := h.service.ReactivateItem(c.Context(), requestTenantID(c), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) ListGoldPrices(c fiber.Ctx) error {
	var filter GoldPriceListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}
	items, err := h.service.ListGoldPrices(c.Context(), requestTenantID(c), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: items})
}

func (h *Handler) CreateGoldPrice(c fiber.Ctx) error {
	var req CreateGoldPriceRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	req.RecordedBy = authz.RequestActorID(c, req.RecordedBy)
	created, err := h.service.CreateGoldPrice(c.Context(), requestTenantID(c), req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{Data: created})
}

func (h *Handler) LatestGoldPrice(c fiber.Ctx) error {
	latest, err := h.service.LatestGoldPrice(c.Context(), requestTenantID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: latest})
}

func (h *Handler) DeactivateGoldPrice(c fiber.Ctx) error {
	updated, err := h.service.DeactivateGoldPrice(c.Context(), requestTenantID(c), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: updated})
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
