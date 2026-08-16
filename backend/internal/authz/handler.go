package authz

import (
	"errors"

	"enterpriseremotesystems/backend/internal/shared/httpx"
	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

type Handler struct {
	store      ActorAdminStore
	actorStore ActorStore
}

func NewHandler(store *GORMStore) *Handler {
	return &Handler{store: store, actorStore: store}
}

func (h *Handler) CurrentActor(c fiber.Ctx) error {
	actor, err := h.resolveRequiredActor(c, PermissionAuthzSelfRead)
	if err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	return httpx.OK(c, CurrentActorResponse{
		ActorKey:             actor.ID,
		ActorRecordID:        actor.RecordID,
		TenantID:             actor.TenantID,
		Scope:                string(actor.Scope),
		PersonID:             actor.PersonID,
		GlobalPersonID:       actor.GlobalPersonID,
		MembershipID:         actor.MembershipID,
		CollaboratorID:       actor.CollaboratorID,
		RoleCodes:            append([]string(nil), actor.RoleCodes...),
		Permissions:          PermissionNames(actor.Permissions),
		IntrinsicPermissions: PermissionNames(actor.IntrinsicPermissions),
		DelegatedPermissions: PermissionNames(actor.DelegatedPermissions),
	})
}

func (h *Handler) ListRoles(c fiber.Ctx) error {
	if _, err := h.resolveRequiredActor(c, PermissionAuthzRead); err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	roles, err := h.store.ListRoles(c.Context())
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, roles)
}

func (h *Handler) ListPermissions(c fiber.Ctx) error {
	if _, err := h.resolveRequiredActor(c, PermissionAuthzRead); err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	permissions, err := h.store.ListPermissions(c.Context())
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, permissions)
}

func (h *Handler) ListActors(c fiber.Ctx) error {
	if _, err := h.resolveRequiredActor(c, PermissionAuthzRead); err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	actors, err := h.store.ListActors(c.Context())
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, actors)
}

func (h *Handler) ListAuditLogs(c fiber.Ctx) error {
	if _, err := h.resolveRequiredActor(c, PermissionAuthzRead); err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	var filter AuditLogFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.BadRequest(c, "invalid_query", "Invalid query parameters")
	}
	logs, err := h.store.ListAuthorizationAuditLogs(c.Context(), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, logs)
}

func (h *Handler) CreateActor(c fiber.Ctx) error {
	if _, err := h.resolveRequiredActor(c, PermissionAuthzManage); err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	var req CreateActorRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	actor, err := h.store.CreateActor(c.Context(), req)
	if err != nil {
		return h.writeError(c, err)
	}
	h.recordAdminAudit(c, PermissionAuthzManage, "authz.actors.create", "authz_actor", actor.ID)
	return httpx.Created(c, actor)
}

func (h *Handler) SetActorActive(c fiber.Ctx) error {
	actor, err := h.resolveRequiredActor(c, PermissionAuthzManage)
	if err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	var req SetActorActiveRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	if req.Active == nil {
		return httpx.BadRequest(c, "validation_error", "Active state is required")
	}
	if actor.RecordID != "" && actor.RecordID == c.Params("id") && !*req.Active {
		return writeAuthorizationHTTPError(c, ErrForbidden)
	}
	updated, err := h.store.SetActorActive(c.Context(), c.Params("id"), *req.Active)
	if err != nil {
		return h.writeError(c, err)
	}
	operation := "authz.actors.activate"
	if !*req.Active {
		operation = "authz.actors.deactivate"
	}
	h.recordAdminAudit(c, PermissionAuthzManage, operation, "authz_actor", updated.ID)
	return httpx.OK(c, updated)
}

func (h *Handler) GrantActorRole(c fiber.Ctx) error {
	if _, err := h.resolveRequiredActor(c, PermissionAuthzManage); err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	var req GrantActorRoleRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	grant, err := h.store.GrantActorRole(c.Context(), c.Params("id"), req)
	if err != nil {
		return h.writeError(c, err)
	}
	h.recordAdminAudit(c, PermissionAuthzManage, "authz.role_grants.create", "authz_actor_role_grant", grant.ID)
	return httpx.Created(c, grant)
}

func (h *Handler) RevokeActorRoleGrant(c fiber.Ctx) error {
	actor, err := h.resolveRequiredActor(c, PermissionAuthzManage)
	if err != nil {
		return writeAuthorizationHTTPError(c, err)
	}
	if actor.RecordID != "" && actor.RecordID == c.Params("id") {
		return writeAuthorizationHTTPError(c, ErrForbidden)
	}
	grant, err := h.store.RevokeActorRoleGrant(c.Context(), c.Params("id"), c.Params("grantId"))
	if err != nil {
		return h.writeError(c, err)
	}
	h.recordAdminAudit(c, PermissionAuthzManage, "authz.role_grants.revoke", "authz_actor_role_grant", grant.ID)
	return httpx.OK(c, grant)
}

func (h *Handler) recordAdminAudit(c fiber.Ctx, permission Permission, operation, targetType, targetID string) {
	if h.store == nil {
		return
	}
	actor, _ := ResolveRequestActor(c, h.actorStore)
	_ = h.store.RecordAuthorizationAudit(c.Context(), AuthorizationAuditEntry{
		Actor:           actor,
		FallbackActorID: c.Get(HeaderActorID),
		TenantID:        c.Get(HeaderTenantID),
		Permission:      permission,
		Operation:       operation,
		TargetType:      targetType,
		TargetID:        targetID,
		Decision:        AuditDecisionAuthorized,
		RequestMethod:   c.Method(),
		RequestPath:     c.Path(),
	})
}

func (h *Handler) resolveRequiredActor(c fiber.Ctx, permission Permission) (*Actor, error) {
	actor, err := ResolveRequestActor(c, h.actorStore)
	if err != nil {
		return nil, err
	}
	if err := RequirePermission(actor, permission); err != nil {
		return nil, err
	}
	return actor, nil
}

func (h *Handler) writeError(c fiber.Ctx, err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return httpx.NotFound(c, "Record not found")
	}
	return httpx.WriteError(c, err)
}

func writeAuthorizationHTTPError(c fiber.Ctx, err error) error {
	if errors.Is(err, ErrAuthenticationRequired) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "authentication_required", Message: "An authenticated session is required"}})
	}
	if errors.Is(err, ErrTenantSelectionRequired) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "tenant_selection_required", Message: "A specific tenant must be selected for this operation"}})
	}
	if errors.Is(err, ErrMissingActor) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "missing_actor", Message: "Authorization actor is required"}})
	}
	if errors.Is(err, ErrForbidden) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Actor is not permitted to perform this operation"}})
	}
	return httpx.WriteError(c, err)
}
