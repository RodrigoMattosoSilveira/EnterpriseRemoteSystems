package authentication

import (
	"strings"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"github.com/gofiber/fiber/v3"
)

func (h *Handler) GetPersonAuthenticationStatus(c fiber.Ctx) error {
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil {
		return h.writeError(c, err)
	}
	status, err := h.service.GetPersonAuthenticationStatus(c.Context(), actor.TenantID, c.Params("id"))
	if err != nil {
		return h.writeError(c, err)
	}
	setNoStore(c)
	return httpx.OK(c, status)
}

func (h *Handler) IssueTenantPersonPasswordResetToken(c fiber.Ctx) error {
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil {
		return h.writeError(c, err)
	}
	result, err := h.service.IssueTenantPersonPasswordResetToken(c.Context(), actor.TenantID, c.Params("id"))
	if err != nil {
		return h.writeError(c, err)
	}
	h.recordTenantAuthenticationAudit(c, actor, "authentication.password_reset_tokens.issue", c.Params("id"))
	setNoStore(c)
	return httpx.Created(c, result)
}

func (h *Handler) EnablePersonAuthentication(c fiber.Ctx) error {
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil {
		return h.writeError(c, err)
	}
	var req EnablePersonAuthenticationRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	status, err := h.service.EnablePersonAuthentication(c.Context(), actor.TenantID, c.Params("id"), req)
	if err != nil {
		return h.writeError(c, err)
	}
	h.recordTenantAuthenticationAudit(c, actor, "authentication.person.enable", c.Params("id"))
	setNoStore(c)
	return httpx.OK(c, status)
}

func (h *Handler) RequestSelfReactivation(c fiber.Ctx) error {
	var req RequestAccountReactivationRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	result, err := h.service.RequestSelfReactivation(c.Context(), req, c.Get("User-Agent"), c.IP())
	if err != nil {
		return h.writeError(c, err)
	}
	setNoStore(c)
	return httpx.Created(c, result)
}

func (h *Handler) RequestTenantPersonReactivation(c fiber.Ctx) error {
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil {
		return h.writeError(c, err)
	}
	requesterActorID := strings.TrimSpace(actor.RecordID)
	result, err := h.service.RequestTenantPersonReactivation(c.Context(), actor.TenantID, c.Params("id"), requesterActorID, c.Get("User-Agent"), c.IP())
	if err != nil {
		return h.writeError(c, err)
	}
	h.recordTenantAuthenticationAudit(c, actor, "authentication.reactivation.request", c.Params("id"))
	setNoStore(c)
	return httpx.Created(c, result)
}

func (h *Handler) ListReactivationRequests(c fiber.Ctx) error {
	requests, err := h.service.ListReactivationRequests(c.Context())
	if err != nil {
		return h.writeError(c, err)
	}
	setNoStore(c)
	return httpx.OK(c, requests)
}

func (h *Handler) ReviewReactivationRequest(c fiber.Ctx) error {
	var req ReviewAccountReactivationRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil {
		return h.writeError(c, err)
	}
	reviewerActorID := strings.TrimSpace(actor.RecordID)
	result, err := h.service.ReviewReactivationRequest(c.Context(), c.Params("id"), reviewerActorID, req)
	if err != nil {
		return h.writeError(c, err)
	}
	operation := "authentication.reactivation.reject"
	if req.Approve {
		operation = "authentication.reactivation.approve"
	}
	h.recordAdminAudit(c, operation, result.AccountID)
	setNoStore(c)
	return httpx.OK(c, result)
}

func (h *Handler) recordTenantAuthenticationAudit(c fiber.Ctx, actor *authz.Actor, operation string, personID string) {
	if h.auditStore == nil || actor == nil {
		return
	}
	_ = h.auditStore.RecordAuthorizationAudit(c.Context(), authz.AuthorizationAuditEntry{
		Actor:         actor,
		TenantID:      strings.TrimSpace(actor.TenantID),
		Permission:    authz.PermissionPeopleUpdate,
		Operation:     operation,
		TargetType:    "person",
		TargetID:      strings.TrimSpace(personID),
		Decision:      authz.AuditDecisionAuthorized,
		RequestMethod: c.Method(),
		RequestPath:   c.Path(),
	})
}
