package routes

import "github.com/gofiber/fiber/v3"

func RegisterCollaboratorRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/collaborators")
	r.Get("/", deps.CollaboratorHandler.List)
	r.Post("/", deps.CollaboratorHandler.Create)
	r.Get("/:id", deps.CollaboratorHandler.GetByID)
	r.Get("/:collaboratorId/current-account", deps.CurrentAccountHandler.GetDetail)
	r.Get("/:collaboratorId/ledger-entries", deps.CurrentAccountHandler.ListEntries)
}
