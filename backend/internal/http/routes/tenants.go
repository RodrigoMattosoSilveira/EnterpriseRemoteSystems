package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterTenantRoutes(router fiber.Router, deps Dependencies) {
	tenants := router.Group("/tenants")

	tenants.Get("/current", requirePermission(deps, authz.PermissionTenantsRead), deps.TenantHandler.Current)
	tenants.Get("/", requireApplicationPermission(deps, authz.PermissionTenantsRead), deps.TenantHandler.List)
	tenants.Post("/", requireApplicationPermission(deps, authz.PermissionTenantsCreate), deps.TenantHandler.Create)

	tenants.Get("/:id/admin-candidates", requireApplicationPermission(deps, authz.PermissionTenantsUpdate), deps.TenantHandler.ListTenantAdminCandidates)
	tenants.Post("/:id/admins", requireApplicationPermission(deps, authz.PermissionTenantsUpdate), deps.TenantHandler.AssignTenantAdmin)
	tenants.Delete("/:id/admins/:actorId", requireApplicationPermission(deps, authz.PermissionTenantsUpdate), deps.TenantHandler.RevokeTenantAdmin)
	tenants.Patch("/:id/active", requireApplicationPermission(deps, authz.PermissionTenantsUpdate), deps.TenantHandler.SetActive)
	tenants.Put("/:id", requireApplicationPermission(deps, authz.PermissionTenantsUpdate), deps.TenantHandler.Update)
	tenants.Delete("/:id", requireApplicationPermission(deps, authz.PermissionTenantsUpdate), deps.TenantHandler.DeleteUnsupported)
	tenants.Get("/:id", requireTenantPermission(deps, authz.PermissionTenantsRead, "id"), deps.TenantHandler.GetByID)
}
