package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterTenantRoutes(router fiber.Router, deps Dependencies) {
	tenants := router.Group("/tenants")
	tenants.Get("/current", requirePermission(deps, authz.PermissionTenantsRead), deps.TenantHandler.Current)
}
