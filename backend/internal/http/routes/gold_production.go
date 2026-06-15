package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterGoldProductionRoutes(v1 fiber.Router, deps Dependencies) {
	workPeriods := v1.Group("/work-periods")
	workPeriods.Get("/:id/gold-production-entries", requirePermission(deps, authz.PermissionEarningsRead), deps.GoldProductionHandler.ListByWorkPeriod)
	workPeriods.Post("/:id/gold-production-entries", requirePermission(deps, authz.PermissionEarningsCreate), deps.GoldProductionHandler.Create)

	entries := v1.Group("/gold-production-entries")
	entries.Get("/:entryId", requirePermission(deps, authz.PermissionEarningsRead), deps.GoldProductionHandler.GetByID)
	entries.Patch("/:entryId", requirePermission(deps, authz.PermissionEarningsUpdate), deps.GoldProductionHandler.Update)
	entries.Patch("/:entryId/deactivate", requirePermission(deps, authz.PermissionEarningsUpdate), deps.GoldProductionHandler.Deactivate)
	entries.Delete("/:entryId", requirePermission(deps, authz.PermissionEarningsUpdate), deps.GoldProductionHandler.Delete)
}
