package tenants

import (
	"errors"
	"strings"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	service    Service
	actorStore authz.ActorStore
	auditStore authz.AuditLogStore
}

func NewHandler(service Service, actorStore authz.ActorStore, auditStore authz.AuditLogStore) *Handler {
	return &Handler{service: service, actorStore: actorStore, auditStore: auditStore}
}

func (h *Handler) Current(c fiber.Ctx) error {
	tenant, err := h.service.GetCurrent(c.Context(), c.Get(authz.HeaderTenantID))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, tenant)
}

func (h *Handler) List(c fiber.Ctx) error {
	tenants, err := h.service.List(c.Context())
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, tenants)
}

func (h *Handler) GetByID(c fiber.Ctx) error {
	tenant, err := h.service.GetByID(c.Context(), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, tenant)
}

func (h *Handler) Create(c fiber.Ctx) error {
	var req CreateTenantRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	tenant, err := h.service.Create(c.Context(), req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionTenantsCreate, "tenants.create", tenant.ID)
	return httpx.Created(c, tenant)
}

func (h *Handler) Update(c fiber.Ctx) error {
	var req UpdateTenantRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	tenant, err := h.service.Update(c.Context(), c.Params("id"), req)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionTenantsUpdate, "tenants.update", tenant.ID)
	return httpx.OK(c, tenant)
}

func (h *Handler) SetActive(c fiber.Ctx) error {
	var req SetTenantActiveRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	if req.Active == nil {
		return httpx.BadRequest(c, "validation_error", "Active state is required")
	}
	tenant, err := h.service.SetActive(c.Context(), c.Params("id"), *req.Active)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	operation := "tenants.activate"
	if !*req.Active {
		operation = "tenants.deactivate"
	}
	h.recordAudit(c, authz.PermissionTenantsUpdate, operation, tenant.ID)
	return httpx.OK(c, tenant)
}

func (h *Handler) ListTenantAdminCandidates(c fiber.Ctx) error {
	candidates, err := h.service.ListTenantAdminCandidates(c.Context(), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, candidates)
}

func (h *Handler) AssignTenantAdmin(c fiber.Ctx) error {
	var req AssignTenantAdminRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	tenant, err := h.service.AssignTenantAdmin(c.Context(), c.Params("id"), req.ActorID)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionTenantsUpdate, "tenants.admins.assign", tenant.ID)
	return httpx.OK(c, tenant)
}

func (h *Handler) RevokeTenantAdmin(c fiber.Ctx) error {
	tenant, err := h.service.RevokeTenantAdmin(c.Context(), c.Params("id"), c.Params("actorId"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionTenantsUpdate, "tenants.admins.revoke", tenant.ID)
	return httpx.OK(c, tenant)
}

func (h *Handler) DeleteUnsupported(c fiber.Ctx) error {
	return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{
		Error: &httpx.APIError{
			Code:    "tenant_deletion_not_allowed",
			Message: "Tenant records cannot be deleted; deactivate the tenant to preserve historical records",
		},
	})
}

func (h *Handler) recordAudit(c fiber.Ctx, permission authz.Permission, operation string, tenantID string) {
	if h.auditStore == nil {
		return
	}
	actor, err := authz.ResolveActor(c.Context(), h.actorStore, func(name string) string { return c.Get(name) })
	if err != nil && !errors.Is(err, authz.ErrMissingActor) {
		return
	}
	fallbackActorID := strings.TrimSpace(c.Get(authz.HeaderActorID))
	_ = h.auditStore.RecordAuthorizationAudit(c.Context(), authz.AuthorizationAuditEntry{
		Actor:           actor,
		FallbackActorID: fallbackActorID,
		TenantID:        tenantID,
		Permission:      permission,
		Operation:       operation,
		TargetType:      "tenant",
		TargetID:        tenantID,
		Decision:        authz.AuditDecisionAuthorized,
		RequestMethod:   c.Method(),
		RequestPath:     c.Path(),
	})
}
