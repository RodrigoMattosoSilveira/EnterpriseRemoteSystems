package routes

import (
	"errors"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
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
		if deps.DisableRouteAuthorization {
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
