package routes

import (
	"errors"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
)

func requirePermission(deps Dependencies, permission authz.Permission) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.DisableRouteAuthorization {
			return c.Next()
		}

		actor, err := authz.ResolveActor(c.Context(), deps.ActorStore, func(name string) string { return c.Get(name) })
		if err != nil {
			return writeAuthorizationError(c, err)
		}
		if err := authz.RequirePermission(actor, permission); err != nil {
			return writeAuthorizationError(c, err)
		}
		return c.Next()
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
