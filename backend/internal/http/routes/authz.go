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
	r.Get("/roles", requireApplicationPermission(deps, authz.PermissionAuthzRead), deps.AuthzHandler.ListRoles)
	r.Get("/permissions", requireApplicationPermission(deps, authz.PermissionAuthzRead), deps.AuthzHandler.ListPermissions)
	r.Get("/actors", requireApplicationPermission(deps, authz.PermissionAuthzRead), deps.AuthzHandler.ListActors)
	r.Get("/tenant-actors", requirePermission(deps, authz.PermissionJourneySettlementsPreview), deps.AuthzHandler.ListTenantActors)
	r.Get("/audit-logs", requireApplicationPermission(deps, authz.PermissionAuthzRead), deps.AuthzHandler.ListAuditLogs)
	r.Post("/actors", requireApplicationPermission(deps, authz.PermissionAuthzManage), deps.AuthzHandler.CreateActor)
	r.Patch("/actors/:id/active", requireApplicationPermission(deps, authz.PermissionAuthzManage), deps.AuthzHandler.SetActorActive)
	r.Post("/actors/:id/role-grants", requireApplicationPermission(deps, authz.PermissionAuthzManage), deps.AuthzHandler.GrantActorRole)
	r.Delete("/actors/:id/role-grants/:grantId", requireApplicationPermission(deps, authz.PermissionAuthzManage), deps.AuthzHandler.RevokeActorRoleGrant)
}
