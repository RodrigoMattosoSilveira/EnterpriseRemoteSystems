package routes

import "github.com/gofiber/fiber/v3"

func Register(server *fiber.App, deps Dependencies) {
	RegisterPublicHealthFastPath(server)
	RegisterHealthRoutes(server)
	api := server.Group("/api")
	v1 := api.Group("/v1")
	v1.Use(authorizationMiddleware(deps))
	RegisterPeopleRoutes(v1, deps)
	RegisterCollaboratorRoutes(v1, deps)
	RegisterExpenseRoutes(v1, deps)
	RegisterPriceListRoutes(v1, deps)
	RegisterCurrentAccountRoutes(v1, deps)
	RegisterWorkPeriodRoutes(v1, deps)
	RegisterWorkPeriodAssignmentRoutes(v1, deps)
	RegisterGoldProductionRoutes(v1, deps)
	RegisterAccrualRoutes(v1, deps)
	RegisterReferenceDataRoutes(v1, deps)
	RegisterTenantRoutes(v1, deps)
	RegisterAuthzRoutes(v1, deps)
}
