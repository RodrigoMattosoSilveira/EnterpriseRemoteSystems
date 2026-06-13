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

func (h *Handler) ListRoles(c fiber.Ctx) error {
	if ok, err := h.requirePermission(c, PermissionAuthzRead); err != nil || !ok {
		return err
	}
	roles, err := h.store.ListRoles(c.Context())
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, roles)
}

func (h *Handler) ListPermissions(c fiber.Ctx) error {
	if ok, err := h.requirePermission(c, PermissionAuthzRead); err != nil || !ok {
		return err
	}
	permissions, err := h.store.ListPermissions(c.Context())
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, permissions)
}

func (h *Handler) ListActors(c fiber.Ctx) error {
	if ok, err := h.requirePermission(c, PermissionAuthzRead); err != nil || !ok {
		return err
	}
	actors, err := h.store.ListActors(c.Context())
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return httpx.OK(c, actors)
}

func (h *Handler) CreateActor(c fiber.Ctx) error {
	if ok, err := h.requirePermission(c, PermissionAuthzManage); err != nil || !ok {
		return err
	}
	var req CreateActorRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	actor, err := h.store.CreateActor(c.Context(), req)
	if err != nil {
		return h.writeError(c, err)
	}
	return httpx.Created(c, actor)
}

func (h *Handler) GrantActorRole(c fiber.Ctx) error {
	if ok, err := h.requirePermission(c, PermissionAuthzManage); err != nil || !ok {
		return err
	}
	var req GrantActorRoleRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body")
	}
	grant, err := h.store.GrantActorRole(c.Context(), c.Params("id"), req)
	if err != nil {
		return h.writeError(c, err)
	}
	return httpx.Created(c, grant)
}

func (h *Handler) RevokeActorRoleGrant(c fiber.Ctx) error {
	if ok, err := h.requirePermission(c, PermissionAuthzManage); err != nil || !ok {
		return err
	}
	grant, err := h.store.RevokeActorRoleGrant(c.Context(), c.Params("id"), c.Params("grantId"))
	if err != nil {
		return h.writeError(c, err)
	}
	return httpx.OK(c, grant)
}

func (h *Handler) requirePermission(c fiber.Ctx, permission Permission) (bool, error) {
	actor, err := ResolveActor(c.Context(), h.actorStore, func(name string) string { return c.Get(name) })
	if err != nil {
		return false, writeAuthorizationHTTPError(c, err)
	}
	if err := RequirePermission(actor, permission); err != nil {
		return false, writeAuthorizationHTTPError(c, err)
	}
	return true, nil
}

func (h *Handler) writeError(c fiber.Ctx, err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return httpx.NotFound(c, "Record not found")
	}
	return httpx.WriteError(c, err)
}

func writeAuthorizationHTTPError(c fiber.Ctx, err error) error {
	if errors.Is(err, ErrMissingActor) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "missing_actor", Message: "Authorization actor is required"}})
	}
	if errors.Is(err, ErrForbidden) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Actor is not permitted to perform this operation"}})
	}
	return httpx.WriteError(c, err)
}
