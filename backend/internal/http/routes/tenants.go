package routes

import "github.com/gofiber/fiber/v3"

func RegisterTenantRoutes(router fiber.Router, deps Dependencies) {
	tenants := router.Group("/tenants")
	tenants.Get("/current", deps.TenantHandler.Current)
}
