package routes

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/tenants"
)

const (
	actorHeaderModeDisabled  = "disabled"
	actorHeaderModeBootstrap = "bootstrap"
	actorHeaderModeTest      = "test"
)

// authorizationMiddleware resolves one authoritative actor for the request.
// A valid authenticated session always wins over every actor identity header.
// Header identity remains available only through the explicitly configured
// bootstrap or isolated-test modes.
func authorizationMiddleware(deps Dependencies) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization || isPublicHealthPath(c.Path()) {
			return c.Next()
		}

		if session, ok := authentication.SessionFromContext(c); ok {
			actor, err := resolveAuthenticatedActor(c, deps, session)
			if err != nil {
				authz.SetRequestActorError(c, authenticationBoundaryError(err))
				return c.Next()
			}
			authz.SetRequestActor(c, actor)
			return c.Next()
		}

		actor, err := resolveConfiguredHeaderActor(c, deps)
		if err != nil {
			authz.SetRequestActorError(c, authenticationBoundaryError(err))
			return c.Next()
		}
		authz.SetRequestActor(c, actor)
		return c.Next()
	}
}

// authenticationBoundaryError converts an unresolved request identity into the
// public authentication contract. ErrMissingActor remains useful inside the
// authorization package and isolated handler tests, but normal HTTP traffic
// must not expose whether an actor key is absent from the persisted store.
func authenticationBoundaryError(err error) error {
	if errors.Is(err, authz.ErrMissingActor) {
		return authz.ErrAuthenticationRequired
	}
	return err
}

func rejectInvalidAuthenticationSession(deps Dependencies) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.AuthenticationHandler == nil {
			return c.Next()
		}
		if err := authentication.SessionErrorFromContext(c); err != nil {
			return deps.AuthenticationHandler.WriteSessionError(c, err)
		}
		return c.Next()
	}
}

func resolveAuthenticatedActor(c fiber.Ctx, deps Dependencies, session authentication.SessionResponse) (*authz.Actor, error) {
	if deps.ActorStore == nil || strings.TrimSpace(session.ActorKey) == "" || strings.TrimSpace(session.ActorID) == "" {
		return nil, authz.ErrAuthenticationRequired
	}
	tenantID := strings.TrimSpace(c.Get(authz.HeaderTenantID))
	if tenantID == "" {
		return nil, authz.ErrTenantSelectionRequired
	}
	actor, err := deps.ActorStore.FindActor(c.Context(), authz.ActorLookup{
		ActorID:  session.ActorKey,
		TenantID: tenantID,
	})
	if err != nil {
		return nil, err
	}
	if actor.RecordID == "" || actor.RecordID != session.ActorID {
		return nil, authz.ErrAuthenticationRequired
	}
	actor.Source = authz.ActorSourceAuthenticatedSession
	return actor, nil
}

func resolveConfiguredHeaderActor(c fiber.Ctx, deps Dependencies) (*authz.Actor, error) {
	mode := strings.ToLower(strings.TrimSpace(deps.ActorHeaderMode))
	if mode == "" {
		// Isolated route and handler tests historically construct Dependencies
		// directly. Treat an omitted mode there as test compatibility; Bootstrap
		// always supplies an explicit configured mode in a running server.
		mode = actorHeaderModeTest
	}

	switch mode {
	case actorHeaderModeDisabled:
		return nil, authz.ErrAuthenticationRequired
	case actorHeaderModeBootstrap:
		actorKey := strings.TrimSpace(c.Get(authz.HeaderActorID))
		if actorKey == "" || actorKey != strings.TrimSpace(deps.BootstrapActorKey) {
			return nil, authz.ErrAuthenticationRequired
		}
		if strings.TrimSpace(c.Get(authz.HeaderAuthorizedBy)) != "" || strings.TrimSpace(c.Get(authz.HeaderActorPermissions)) != "" {
			return nil, authz.ErrAuthenticationRequired
		}
		return authz.ResolveActor(c.Context(), deps.ActorStore, func(name string) string { return c.Get(name) })
	case actorHeaderModeTest:
		return authz.ResolveActor(c.Context(), deps.ActorStore, func(name string) string { return c.Get(name) })
	default:
		return nil, authz.ErrAuthenticationRequired
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
	actor, err := authz.RequestActorFromContext(c)
	if err == nil {
		return actor, nil
	}
	if !errors.Is(err, authz.ErrMissingActor) {
		return nil, err
	}

	actor, err = resolveConfiguredHeaderActor(c, deps)
	if err != nil {
		authz.SetRequestActorError(c, err)
		return nil, err
	}
	authz.SetRequestActor(c, actor)
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

func requireTenantAdministrator(deps Dependencies) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization {
			return c.Next()
		}

		actor, err := requestActor(c, deps)
		if err != nil {
			return writeAuthorizationError(c, err)
		}
		if actor.Scope != authz.ActorScopeTenant || strings.TrimSpace(actor.TenantID) == "" || actor.TenantID == authz.GlobalTenantScope {
			return writeAuthorizationError(c, authz.ErrForbidden)
		}
		for _, roleCode := range actor.RoleCodes {
			if roleCode == string(authz.RoleTenantAdmin) {
				return c.Next()
			}
		}
		return writeAuthorizationError(c, authz.ErrForbidden)
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

func requirePermissionOrSelfCollaborator(deps Dependencies, permission authz.Permission, selfPermission authz.Permission, collaboratorIDParam string) fiber.Handler {
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
		if actor.HasPermission(selfPermission) && actor.CollaboratorID != "" && actor.CollaboratorID == c.Params(collaboratorIDParam) {
			return c.Next()
		}
		return writeAuthorizationError(c, authz.ErrForbidden)
	}
}

func writeAuthorizationError(c fiber.Ctx, err error) error {
	if errors.Is(err, authz.ErrAuthenticationRequired) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "authentication_required", Message: "An authenticated session is required"}})
	}
	if errors.Is(err, authz.ErrTenantSelectionRequired) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "tenant_selection_required", Message: "A specific tenant must be selected for this operation"}})
	}
	if errors.Is(err, authz.ErrMissingActor) {
		return c.Status(fiber.StatusUnauthorized).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "missing_actor", Message: "Authorization actor is required"}})
	}
	if errors.Is(err, authz.ErrForbidden) {
		return c.Status(fiber.StatusForbidden).JSON(httpx.APIResponse{Error: &httpx.APIError{Code: "forbidden", Message: "Actor is not permitted to perform this operation"}})
	}
	return httpx.WriteError(c, err)
}
