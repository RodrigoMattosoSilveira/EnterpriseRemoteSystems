package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterAuthzRoutes(router fiber.Router, deps Dependencies) {
	if deps.AuthzHandler == nil {
		return
	}
	r := router.Group("/authz")
	r.Get("/current-actor", requirePermission(deps, authz.PermissionAuthzSelfRead), deps.AuthzHandler.CurrentActor)
	r.Get("/roles", requirePermission(deps, authz.PermissionAuthzRead), deps.AuthzHandler.ListRoles)
	r.Get("/permissions", requirePermission(deps, authz.PermissionAuthzRead), deps.AuthzHandler.ListPermissions)
	r.Get("/actors", requirePermission(deps, authz.PermissionAuthzRead), deps.AuthzHandler.ListActors)
	r.Get("/audit-logs", requirePermission(deps, authz.PermissionAuthzRead), deps.AuthzHandler.ListAuditLogs)
	r.Post("/actors", requirePermission(deps, authz.PermissionAuthzManage), deps.AuthzHandler.CreateActor)
	r.Patch("/actors/:id/active", requirePermission(deps, authz.PermissionAuthzManage), deps.AuthzHandler.SetActorActive)
	r.Post("/actors/:id/role-grants", requirePermission(deps, authz.PermissionAuthzManage), deps.AuthzHandler.GrantActorRole)
	r.Delete("/actors/:id/role-grants/:grantId", requirePermission(deps, authz.PermissionAuthzManage), deps.AuthzHandler.RevokeActorRoleGrant)
}
