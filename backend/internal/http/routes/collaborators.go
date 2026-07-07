package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterCollaboratorRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/collaborators")
	r.Get("/", requirePermission(deps, authz.PermissionCollaboratorsRead), deps.CollaboratorHandler.List)
	r.Post("/", requirePermission(deps, authz.PermissionCollaboratorsCreate), deps.CollaboratorHandler.Create)
	r.Get("/:id", requirePermission(deps, authz.PermissionCollaboratorsRead), deps.CollaboratorHandler.GetByID)
	r.Put("/:id", requirePermission(deps, authz.PermissionCollaboratorsUpdate), deps.CollaboratorHandler.Update)
	r.Get("/:collaboratorId/financial-projection", requirePermission(deps, authz.PermissionCurrentAccountsSummaryRead), deps.CurrentAccountHandler.FinancialProjection)
	r.Get("/:collaboratorId/settlement-preview", requirePermission(deps, authz.PermissionJourneySettlementsPreview), deps.CurrentAccountHandler.SettlementPreview)
	r.Post("/:collaboratorId/zero-gold", authorizationHandledByHandler(), deps.CurrentAccountHandler.ZeroGold)
	r.Post("/:collaboratorId/payout", authorizationHandledByHandler(), deps.CurrentAccountHandler.PartialPayout)
	r.Post("/:collaboratorId/close", authorizationHandledByHandler(), deps.CurrentAccountHandler.CloseJourney)
	r.Get("/:collaboratorId/current-account", requirePermission(deps, authz.PermissionCurrentAccountsSummaryRead), deps.CurrentAccountHandler.GetDetail)
	r.Get("/:collaboratorId/ledger-entries", requirePermission(deps, authz.PermissionCurrentAccountsLedgerRead), deps.CurrentAccountHandler.ListEntries)
}
