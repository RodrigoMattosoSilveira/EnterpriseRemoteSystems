package routes

import "github.com/gofiber/fiber/v3"

func Register(server *fiber.App, deps Dependencies) {
	RegisterHealthRoutes(server)
	api := server.Group("/api")
	v1 := api.Group("/v1")
	RegisterPeopleRoutes(v1, deps)
	RegisterCollaboratorRoutes(v1, deps)
	RegisterExpenseRoutes(v1, deps)
	RegisterCurrentAccountRoutes(v1, deps)
	RegisterReferenceDataRoutes(v1, deps)
	RegisterTenantRoutes(v1, deps)
}
