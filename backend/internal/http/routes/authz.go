package routes

import "github.com/gofiber/fiber/v3"

func RegisterAuthzRoutes(router fiber.Router, deps Dependencies) {
	if deps.AuthzHandler == nil {
		return
	}
	authz := router.Group("/authz")
	authz.Get("/roles", deps.AuthzHandler.ListRoles)
	authz.Get("/permissions", deps.AuthzHandler.ListPermissions)
	authz.Get("/actors", deps.AuthzHandler.ListActors)
	authz.Post("/actors", deps.AuthzHandler.CreateActor)
	authz.Post("/actors/:id/role-grants", deps.AuthzHandler.GrantActorRole)
	authz.Delete("/actors/:id/role-grants/:grantId", deps.AuthzHandler.RevokeActorRoleGrant)
}
