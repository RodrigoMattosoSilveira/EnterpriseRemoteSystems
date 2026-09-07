package authz

import (
	"errors"

	"enterpriseremotesystems/backend/internal/shared/httpx"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

func (h *Handler) RequestSupportAccessLease(c fiber.Ctx) error {
	actor, err := h.resolveRequiredActor(c, PermissionSupportAccessLeasesRequest)
	if err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	if actor.Scope != ActorScopeApplication || actor.TenantID != GlobalTenantScope || actor.SupportLeaseID != "" {
		return writeAuthorizationHTTPError(c, ErrForbidden)
	}
	var req CreateSupportAccessLeaseRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	lease, err := h.store.CreateSupportAccessLease(c.Context(), actor, req)
	if err != nil {
		return writeSupportAccessLeaseError(c, err)
	}
	h.recordSupportAccessLeaseAudit(c, actor, PermissionSupportAccessLeasesRequest, "support_access_leases.request", lease)
	return httpx.Created(c, lease)
}

func (h *Handler) ListSupportAccessLeases(c fiber.Ctx) error {
	actor, err := h.resolveRequiredActor(c, PermissionSupportAccessLeasesRead)
	if err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	var filter SupportAccessLeaseFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.BadRequest(c, "invalid_query", "Invalid query parameters")
	}
	leases, err := h.store.ListSupportAccessLeases(c.Context(), actor, filter)
	if err != nil {
		return writeSupportAccessLeaseError(c, err)
	}
	return httpx.OK(c, leases)
}

func (h *Handler) ApproveSupportAccessLease(c fiber.Ctx) error {
	actor, err := h.resolveRequiredActor(c, PermissionSupportAccessLeasesApprove)
	if err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	lease, err := h.store.ApproveSupportAccessLease(c.Context(), actor, c.Params("id"))
	if err != nil {
		return writeSupportAccessLeaseError(c, err)
	}
	h.recordSupportAccessLeaseAudit(c, actor, PermissionSupportAccessLeasesApprove, "support_access_leases.approve", lease)
	return httpx.OK(c, lease)
}

func (h *Handler) TerminateSupportAccessLease(c fiber.Ctx) error {
	actor, err := h.resolveRequiredActor(c, PermissionSupportAccessLeasesTerminate)
	if err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	var req TerminateSupportAccessLeaseRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	lease, err := h.store.TerminateSupportAccessLease(c.Context(), actor, c.Params("id"), req.Reason)
	if err != nil {
		return writeSupportAccessLeaseError(c, err)
	}
	h.recordSupportAccessLeaseAudit(c, actor, PermissionSupportAccessLeasesTerminate, "support_access_leases.terminate", lease)
	return httpx.OK(c, lease)
}

func (h *Handler) recordSupportAccessLeaseAudit(c fiber.Ctx, actor *Actor, permission Permission, operation string, lease SupportAccessLeaseResponse) {
	if h.store == nil {
		return
	}
	_ = h.store.RecordAuthorizationAudit(c.Context(), AuthorizationAuditEntry{
		Actor:         actor,
		TenantID:      lease.TenantID,
		Permission:    permission,
		Operation:     operation,
		TargetType:    "tenant_support_access_lease",
		TargetID:      lease.ID,
		Decision:      AuditDecisionAuthorized,
		RequestMethod: c.Method(),
		RequestPath:   c.Path(),
	})
}

func writeSupportAccessLeaseError(c fiber.Ctx, err error) error {
	if errors.Is(err, ErrForbidden) || errors.Is(err, ErrMissingActor) || errors.Is(err, ErrAuthenticationRequired) || errors.Is(err, ErrTenantSelectionRequired) || errors.Is(err, ErrTenantActorUnavailable) {
		return writeAuthorizationHTTPError(c, err)
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return httpx.NotFound(c, "Tenant Support Access Lease not found")
	}
	if errors.Is(err, ErrSupportAccessLeaseConflict) {
		return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "support_access_lease_conflict", Message: "An open Tenant Support Access Lease already exists for this Application Administrator and Tenant"}})
	}
	if errors.Is(err, ErrSupportAccessLeaseExpired) {
		return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "support_access_lease_expired", Message: "The Tenant Support Access Lease has expired"}})
	}
	if errors.Is(err, ErrSupportAccessLeaseInvalidState) {
		return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "support_access_lease_invalid_state", Message: "The Tenant Support Access Lease is not in the required lifecycle state"}})
	}
	return httpx.WriteError(c, err)
}
