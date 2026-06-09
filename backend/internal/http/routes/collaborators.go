package routes

import "github.com/gofiber/fiber/v3"

func RegisterCollaboratorRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/collaborators")
	r.Get("/", deps.CollaboratorHandler.List)
	r.Post("/", deps.CollaboratorHandler.Create)
	r.Get("/:id", deps.CollaboratorHandler.GetByID)
	r.Get("/:collaboratorId/financial-projection", deps.CurrentAccountHandler.FinancialProjection)
	r.Get("/:collaboratorId/settlement-preview", deps.CurrentAccountHandler.SettlementPreview)
	r.Post("/:collaboratorId/zero-gold", deps.CurrentAccountHandler.ZeroGold)
	r.Post("/:collaboratorId/payout", deps.CurrentAccountHandler.PartialPayout)
	r.Post("/:collaboratorId/close", deps.CurrentAccountHandler.CloseJourney)
	r.Get("/:collaboratorId/current-account", deps.CurrentAccountHandler.GetDetail)
	r.Get("/:collaboratorId/ledger-entries", deps.CurrentAccountHandler.ListEntries)
}
