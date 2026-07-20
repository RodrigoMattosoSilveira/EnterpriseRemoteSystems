package routes

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/tenants"
)

const (
	authorizationActorLocalKey = "ers.authz.actor"
	authorizationErrorLocalKey = "ers.authz.error"
)

// authorizationMiddleware resolves the request actor once for the /api/v1 route
// group and stores the result in Fiber locals for downstream route guards. It is
// intentionally non-blocking: individual route guards still decide whether an
// actor is required and which permission must be satisfied.
func authorizationMiddleware(deps Dependencies) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization || isPublicHealthPath(c.Path()) {
			return c.Next()
		}

		actor, err := authz.ResolveActor(c.Context(), deps.ActorStore, func(name string) string { return c.Get(name) })
		if err != nil {
			c.Locals(authorizationErrorLocalKey, err)
			return c.Next()
		}
		c.Locals(authorizationActorLocalKey, actor)
		return c.Next()
	}
}

func isPublicHealthPath(path string) bool {
	switch path {
	case "/healthz", "/api/v1/healthz":
		return true
	default:
		return false
	}
}

func requestActor(c fiber.Ctx, deps Dependencies) (*authz.Actor, error) {
	if errValue := c.Locals(authorizationErrorLocalKey); errValue != nil {
		if err, ok := errValue.(error); ok {
			return nil, err
		}
	}
	if actorValue := c.Locals(authorizationActorLocalKey); actorValue != nil {
		if actor, ok := actorValue.(*authz.Actor); ok {
			return actor, nil
		}
	}

	actor, err := authz.ResolveActor(c.Context(), deps.ActorStore, func(name string) string { return c.Get(name) })
	if err != nil {
		c.Locals(authorizationErrorLocalKey, err)
		return nil, err
	}
	c.Locals(authorizationActorLocalKey, actor)
	return actor, nil
}

// authorizationHandledByHandler marks routes whose handlers perform the full
// authorization decision themselves. These handlers must retain control so
// denied sensitive operations are recorded in the authorization audit log.
// The route coverage test restricts this marker to an explicit allowlist.
func authorizationHandledByHandler() fiber.Handler {
	return func(c fiber.Ctx) error {
		return c.Next()
	}
}

func requirePermission(deps Dependencies, permission authz.Permission) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization {
			return c.Next()
		}

		actor, err := requestActor(c, deps)
		if err != nil {
			return writeAuthorizationError(c, err)
		}
		if err := authz.RequirePermission(actor, permission); err != nil {
			return writeAuthorizationError(c, err)
		}
		return c.Next()
	}
}

func requireApplicationPermission(deps Dependencies, permission authz.Permission) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization {
			return c.Next()
		}

		actor, err := requestActor(c, deps)
		if err != nil {
			return writeAuthorizationError(c, err)
		}
		if err := authz.RequirePermission(actor, permission); err != nil {
			return writeAuthorizationError(c, err)
		}
		if actor.Scope != authz.ActorScopeApplication {
			return writeAuthorizationError(c, authz.ErrForbidden)
		}
		return c.Next()
	}
}

func requireTenantPermission(deps Dependencies, permission authz.Permission, tenantIDParam string) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization {
			return c.Next()
		}

		actor, err := requestActor(c, deps)
		if err != nil {
			return writeAuthorizationError(c, err)
		}
		if err := authz.RequirePermission(actor, permission); err != nil {
			return writeAuthorizationError(c, err)
		}
		if err := authz.RequireTenantScope(actor, c.Params(tenantIDParam)); err != nil {
			return writeAuthorizationError(c, err)
		}
		return c.Next()
	}
}

func requireActiveTenantForMutations(deps Dependencies) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization || deps.TenantService == nil || !isTenantScopedMutation(c.Method(), c.Path()) {
			return c.Next()
		}

		actor, err := requestActor(c, deps)
		if err != nil {
			// Route-level authorization produces the canonical missing-actor or
			// forbidden response for the endpoint.
			return c.Next()
		}
		tenantID := strings.TrimSpace(actor.TenantID)
		if tenantID == "" {
			// Preserve the existing single-tenant request behavior for legacy
			// X-Authorized-By operations until Bite 28C replaces request headers
			// with an authenticated session and explicit tenant selection.
			tenantID = tenants.DefaultTenantID
		}
		if tenantID == authz.GlobalTenantScope {
			return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{
				Code:    "tenant_selection_required",
				Message: "A specific tenant must be selected for this operation",
			}})
		}
		if err := deps.TenantService.RequireActive(c.Context(), tenantID); err != nil {
			if errors.Is(err, tenants.ErrTenantInactive) {
				return c.Status(fiber.StatusLocked).JSON(httpx.APIResponse{Error: &httpx.APIError{
					Code:    "tenant_inactive",
					Message: "The selected tenant is inactive; historical records remain readable, but tenant operations are blocked",
				}})
			}
			return httpx.WriteError(c, err)
		}
		return c.Next()
	}
}

func isTenantScopedMutation(method string, path string) bool {
	switch method {
	case fiber.MethodGet, fiber.MethodHead, fiber.MethodOptions:
		return false
	}
	if strings.HasPrefix(path, "/api/v1/tenants") || strings.HasPrefix(path, "/api/v1/authz") {
		return false
	}
	return true
}

func requirePermissionOrSelfPerson(deps Dependencies, permission authz.Permission, selfPermission authz.Permission, personIDParam string) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization {
			return c.Next()
		}

		actor, err := requestActor(c, deps)
		if err != nil {
			return writeAuthorizationError(c, err)
		}
		if authz.RequirePermission(actor, permission) == nil {
			return c.Next()
		}
		if actor.HasPermission(selfPermission) && actor.PersonID != "" && actor.PersonID == c.Params(personIDParam) {
			return c.Next()
		}
		return writeAuthorizationError(c, authz.ErrForbidden)
	}
}

func writeAuthorizationError(c fiber.Ctx, err error) error {
	if errors.Is(err, authz.ErrMissingActor) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "missing_actor", Message: "Authorization actor is required"}})
	}
	if errors.Is(err, authz.ErrForbidden) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Actor is not permitted to perform this operation"}})
	}
	return httpx.WriteError(c, err)
}
